package com.shijie.transit.userapi.dify;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.shijie.transit.common.web.ErrorCode;
import com.shijie.transit.common.web.TransitException;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Iterator;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.multipart.MultipartFile;

@Component
public class DifyClient {
  private static final Logger log = LoggerFactory.getLogger(DifyClient.class);
  private final DifyProperties properties;
  private final ObjectMapper objectMapper;

  public DifyClient(DifyProperties properties, ObjectMapper objectMapper) {
    this.properties = properties;
    this.objectMapper = objectMapper;
  }

  public DifyChatResult chatMessages(String requestBodyJson) {
    ChatRequestPayload chatRequestPayload = normalizeChatRequestPayload(requestBodyJson);
    if (chatRequestPayload.responseModeAdjusted()) {
      log.warn("Dify chatMessages 检测到 response_mode={}，当前 Chatflow 场景自动切换为 streaming",
          chatRequestPayload.originalResponseMode());
    }
    log.info("Dify chatMessages 路由完成 streaming={} adjusted={} hasFiles={} hasConversationId={}",
        chatRequestPayload.streaming(),
        chatRequestPayload.responseModeAdjusted(),
        containsFiles(chatRequestPayload.requestBodyJson()),
        containsConversationId(chatRequestPayload.requestBodyJson()));
    if (chatRequestPayload.streaming()) {
      return chatMessagesByStreaming(chatRequestPayload.requestBodyJson());
    }
    return chatMessagesByBlocking(chatRequestPayload.requestBodyJson());
  }

  private DifyChatResult chatMessagesByBlocking(String requestBodyJson) {
    String requestUrl = buildChatRequestUrl();
    String maskedHeader = "Authorization=Bearer " + maskToken(properties.getChatApiKey()) + ", Content-Type=application/json";
    long startedAt = System.currentTimeMillis();
    try {
      log.info("Dify chatMessages 发起请求 url={} 请求头={} 请求体={}",
          requestUrl, maskedHeader, abbreviate(requestBodyJson, 6000));
      ResponseEntity<String> responseEntity = restClientForChat().post()
          .uri("/v1/chat-messages")
          .contentType(MediaType.APPLICATION_JSON)
          .body(requestBodyJson)
          .retrieve()
          .toEntity(String.class);
      String responseRaw = responseEntity.getBody();
      int statusCode = responseEntity.getStatusCode().value();
      boolean success = statusCode >= 200 && statusCode < 300;
      long durationMs = System.currentTimeMillis() - startedAt;
      log.info("Dify chatMessages 收到响应 url={} 状态码={} 是否成功={} 耗时ms={} 响应头={} 响应体={}",
          requestUrl,
          statusCode,
          success,
          durationMs,
          responseEntity.getHeaders(),
          abbreviate(responseRaw, 6000));
      if (isSsePayload(responseRaw)) {
        DifyChatResult sseResult = parseChatResultFromSse(responseRaw);
        log.info("Dify chatMessages SSE解析完成 会话ID={} 回答长度={}",
            sseResult.conversationId(), sseResult.answer() == null ? 0 : sseResult.answer().length());
        return sseResult;
      }
      return parseChatResult(responseRaw);
    } catch (RestClientResponseException ex) {
      long durationMs = System.currentTimeMillis() - startedAt;
      log.error("Dify chatMessages 请求失败 url={} 状态码={} 是否成功=false 耗时ms={} 响应头={} 响应体={}",
          requestUrl,
          ex.getRawStatusCode(),
          durationMs,
          ex.getResponseHeaders(),
          abbreviate(ex.getResponseBodyAsString(), 6000),
          ex);
      throw toTransitException(ex);
    } catch (Exception ex) {
      long durationMs = System.currentTimeMillis() - startedAt;
      log.error("Dify chatMessages 网络异常或运行异常 url={} 状态码=N/A 是否成功=false 耗时ms={} 异常类型={} 异常信息={}",
          requestUrl,
          durationMs,
          ex.getClass().getName(),
          ex.getMessage(),
          ex);
      throw ex;
    }
  }

  private DifyChatResult chatMessagesByStreaming(String requestBodyJson) {
    String requestUrl = buildChatRequestUrl();
    String maskedHeader = "Authorization=Bearer " + maskToken(properties.getChatApiKey()) + ", Content-Type=application/json";
    long startedAt = System.currentTimeMillis();
    try {
      String apiKey = properties.getChatApiKey();
      if (!StringUtils.hasText(apiKey)) {
        throw new TransitException(ErrorCode.UNAUTHORIZED, "DIFY_CHAT_API_KEY 未配置");
      }
      log.info("Dify chatMessages 发起请求 url={} 请求头={} 请求体={}",
          requestUrl, maskedHeader, abbreviate(requestBodyJson, 6000));
      HttpRequest request = HttpRequest.newBuilder()
          .uri(URI.create(requestUrl))
          .timeout(Duration.ofMinutes(3))
          .header("Authorization", "Bearer " + apiKey)
          .header("Content-Type", MediaType.APPLICATION_JSON_VALUE)
          .header("Accept", MediaType.TEXT_EVENT_STREAM_VALUE)
          .POST(HttpRequest.BodyPublishers.ofString(requestBodyJson, StandardCharsets.UTF_8))
          .build();
      HttpResponse<InputStream> response = HttpClient.newBuilder()
          .version(HttpClient.Version.HTTP_1_1)
          .connectTimeout(Duration.ofSeconds(15))
          .build()
          .send(request, HttpResponse.BodyHandlers.ofInputStream());
      int statusCode = response.statusCode();
      log.info("Dify chatMessages 已收到响应头 url={} 状态码={} 响应头={}",
          requestUrl,
          statusCode,
          response.headers().map());
      String responseRaw = readStreamingResponse(response.body(), requestUrl, startedAt);
      boolean success = statusCode >= 200 && statusCode < 300;
      long durationMs = System.currentTimeMillis() - startedAt;
      log.info("Dify chatMessages 收到响应 url={} 状态码={} 是否成功={} 耗时ms={} 响应头={} 响应体={}",
          requestUrl,
          statusCode,
          success,
          durationMs,
          response.headers().map(),
          abbreviate(responseRaw, 6000));
      if (!success) {
        throw toTransitException(statusCode, responseRaw, null);
      }
      if (!isSsePayload(responseRaw)) {
        return parseChatResult(responseRaw);
      }
      DifyChatResult sseResult = parseChatResultFromSse(responseRaw);
      log.info("Dify chatMessages SSE解析完成 会话ID={} 回答长度={}",
          sseResult.conversationId(), sseResult.answer() == null ? 0 : sseResult.answer().length());
      return sseResult;
    } catch (TransitException ex) {
      long durationMs = System.currentTimeMillis() - startedAt;
      log.error("Dify chatMessages 请求失败 url={} 状态码={} 是否成功=false 耗时ms={} 响应体={}",
          requestUrl,
          extractStatusCode(ex),
          durationMs,
          abbreviate(ex.getMessage(), 6000),
          ex);
      throw ex;
    } catch (Exception ex) {
      long durationMs = System.currentTimeMillis() - startedAt;
      log.error("Dify chatMessages 网络异常或运行异常 url={} 状态码=N/A 是否成功=false 耗时ms={} 异常类型={} 异常信息={}",
          requestUrl,
          durationMs,
          ex.getClass().getName(),
          ex.getMessage(),
          ex);
      throw new TransitException(ErrorCode.INTERNAL_ERROR, "Dify chatMessages 调用失败", ex);
    }
  }

  public DifyDatasetResult createDataset(String name) {
    return createDataset(name, "only_me");
  }

  public DifyDatasetResult createDataset(String name, String permission) {
    try {
      log.info("Dify createDataset name={} permission={}", name, permission);
      ObjectNode request = objectMapper.createObjectNode();
      request.put("name", name);
      request.put("permission", StringUtils.hasText(permission) ? permission : "only_me");

      String responseJson = restClientForDataset().post()
          .uri("/v1/datasets")
          .contentType(MediaType.APPLICATION_JSON)
          .body(request.toString())
          .retrieve()
          .body(String.class);
      log.info("Dify createDataset responseSize={}", responseJson == null ? 0 : responseJson.length());
      return parseDatasetResult(responseJson);
    } catch (RestClientResponseException ex) {
      throw toTransitException(ex);
    }
  }

  public DifyDatasetListResult getDatasets(int page, int limit) {
    try {
      log.info("Dify getDatasets page={} limit={}", page, limit);
      String responseJson = restClientForDataset().get()
          .uri(uriBuilder -> uriBuilder.path("/v1/datasets")
              .queryParam("page", page)
              .queryParam("limit", limit)
              .build())
          .retrieve()
          .body(String.class);
      return parseDatasetListResult(responseJson);
    } catch (RestClientResponseException ex) {
      throw toTransitException(ex);
    }
  }

  public String getDocument(String datasetId, String documentId) {
    try {
      log.info("Dify getDocument datasetId={} documentId={}", datasetId, documentId);
      return restClientForDataset().get()
          .uri("/v1/datasets/{datasetId}/documents/{documentId}", datasetId, documentId)
          .retrieve()
          .body(String.class);
    } catch (RestClientResponseException ex) {
      throw toTransitException(ex);
    }
  }

  public String listDocuments(String datasetId, int page, int limit) {
    try {
      log.info("Dify listDocuments datasetId={} page={} limit={}", datasetId, page, limit);
      return restClientForDataset().get()
          .uri(uriBuilder -> uriBuilder.path("/v1/datasets/{datasetId}/documents")
              .queryParam("page", page)
              .queryParam("limit", limit)
              .build(datasetId))
          .retrieve()
          .body(String.class);
    } catch (RestClientResponseException ex) {
      throw toTransitException(ex);
    }
  }

  public String listDocumentSegments(String datasetId, String documentId, int page, int limit) {
    try {
      log.info("Dify listDocumentSegments datasetId={} documentId={} page={} limit={}", datasetId, documentId, page, limit);
      return restClientForDataset().get()
          .uri(uriBuilder -> uriBuilder.path("/v1/datasets/{datasetId}/documents/{documentId}/segments")
              .queryParam("page", page)
              .queryParam("limit", limit)
              .build(datasetId, documentId))
          .retrieve()
          .body(String.class);
    } catch (RestClientResponseException ex) {
      throw toTransitException(ex);
    }
  }

  public DifyDocumentResult createDocumentByText(
      String datasetId,
      String name,
      String text,
      String indexingTechnique,
      String processRuleMode) {
    try {
      log.info("Dify createDocumentByText datasetId={} name={}", datasetId, name);
      ObjectNode request = objectMapper.createObjectNode();
      request.put("name", name);
      request.put("text", text);
      request.put("indexing_technique", StringUtils.hasText(indexingTechnique) ? indexingTechnique : "high_quality");
      ObjectNode processRule = request.putObject("process_rule");
      processRule.put("mode", StringUtils.hasText(processRuleMode) ? processRuleMode : "automatic");

      String responseJson = restClientForDataset().post()
          .uri("/v1/datasets/{datasetId}/document/create-by-text", datasetId)
          .contentType(MediaType.APPLICATION_JSON)
          .body(request.toString())
          .retrieve()
          .body(String.class);
      return parseDocumentResult(responseJson);
    } catch (RestClientResponseException ex) {
      throw toTransitException(ex);
    }
  }

  public DifyDocumentResult updateDocumentByText(
      String datasetId,
      String documentId,
      String name,
      String text,
      String indexingTechnique,
      String processRuleMode) {
    try {
      log.info("Dify updateDocumentByText datasetId={} documentId={} name={}", datasetId, documentId, name);
      ObjectNode request = objectMapper.createObjectNode();
      if (StringUtils.hasText(name)) {
        request.put("name", name);
      }
      request.put("text", text);
      request.put("indexing_technique", StringUtils.hasText(indexingTechnique) ? indexingTechnique : "high_quality");
      ObjectNode processRule = request.putObject("process_rule");
      processRule.put("mode", StringUtils.hasText(processRuleMode) ? processRuleMode : "automatic");

      String responseJson = restClientForDataset().post()
          .uri("/v1/datasets/{datasetId}/documents/{documentId}/update-by-text", datasetId, documentId)
          .contentType(MediaType.APPLICATION_JSON)
          .body(request.toString())
          .retrieve()
          .body(String.class);
      return parseDocumentResult(responseJson);
    } catch (RestClientResponseException ex) {
      throw toTransitException(ex);
    }
  }

  public String uploadDocumentByFile(String datasetId, String dataJson, MultipartFile file) throws IOException {
    MultiValueMap<String, Object> multipartBody = new LinkedMultiValueMap<>();
    multipartBody.add("data", dataJson);
    multipartBody.add("file", new ByteArrayResource(file.getBytes()) {
      @Override
      public String getFilename() {
        return file.getOriginalFilename();
      }
    });

    try {
      log.info("Dify uploadDocument datasetId={} fileName={}", datasetId, file.getOriginalFilename());
      return restClientForDataset().post()
          .uri("/v1/datasets/{datasetId}/document/create-by-file", datasetId)
          .contentType(MediaType.MULTIPART_FORM_DATA)
          .body(multipartBody)
          .retrieve()
          .body(String.class);
    } catch (RestClientResponseException ex) {
      throw toTransitException(ex);
    }
  }

  public String uploadChatFile(String user, String filename, String mimeType, byte[] bytes) {
    MultiValueMap<String, Object> multipartBody = new LinkedMultiValueMap<>();
    multipartBody.add("user", user);
    ByteArrayResource fileResource = new ByteArrayResource(bytes) {
      @Override
      public String getFilename() {
        return filename;
      }
    };
    HttpHeaders fileHeaders = new HttpHeaders();
    if (StringUtils.hasText(mimeType)) {
      fileHeaders.setContentType(MediaType.parseMediaType(mimeType));
    }
    multipartBody.add("file", new HttpEntity<>(fileResource, fileHeaders));
    try {
      log.info("Dify uploadChatFile user={} fileName={} mimeType={} size={}",
          user, filename, mimeType, bytes == null ? 0 : bytes.length);
      String response = restClientForChat().post()
          .uri("/v1/files/upload")
          .contentType(MediaType.MULTIPART_FORM_DATA)
          .body(multipartBody)
          .retrieve()
          .body(String.class);
      log.info("Dify uploadChatFile 响应 user={} fileName={} response={}",
          user, filename, abbreviate(response, 2000));
      return parseUploadFileId(response);
    } catch (RestClientResponseException ex) {
      throw toTransitException(ex);
    }
  }

  public String retrieveDataset(String datasetId, String query) {
    try {
      log.info("Dify retrieve datasetId={} querySize={}", datasetId, query == null ? 0 : query.length());
      ObjectNode request = objectMapper.createObjectNode();
      request.put("query", query);

      return restClientForDataset().post()
          .uri("/v1/datasets/{datasetId}/retrieve", datasetId)
          .contentType(MediaType.APPLICATION_JSON)
          .body(request.toString())
          .retrieve()
          .body(String.class);
    } catch (RestClientResponseException ex) {
      throw toTransitException(ex);
    }
  }

  public void deleteDocument(String datasetId, String documentId) {
    try {
      log.info("Dify deleteDocument datasetId={} documentId={}", datasetId, documentId);
      restClientForDataset().delete()
          .uri("/v1/datasets/{datasetId}/documents/{documentId}", datasetId, documentId)
          .retrieve()
          .toBodilessEntity();
    } catch (RestClientResponseException ex) {
      throw toTransitException(ex);
    }
  }

  public void deleteDataset(String datasetId) {
    try {
      log.info("Dify deleteDataset datasetId={}", datasetId);
      restClientForDataset().delete()
          .uri("/v1/datasets/{datasetId}", datasetId)
          .retrieve()
          .toBodilessEntity();
    } catch (RestClientResponseException ex) {
      throw toTransitException(ex);
    }
  }

  public void updateDataset(String datasetId, String name, String permission) {
    try {
      log.info("Dify updateDataset datasetId={} name={} permission={}", datasetId, name, permission);
      ObjectNode request = objectMapper.createObjectNode();
      if (StringUtils.hasText(name)) {
        request.put("name", name);
      }
      if (StringUtils.hasText(permission)) {
        request.put("permission", permission);
      }

      restClientForDataset().patch()
          .uri("/v1/datasets/{datasetId}", datasetId)
          .contentType(MediaType.APPLICATION_JSON)
          .body(request.toString())
          .retrieve()
          .toBodilessEntity();
    } catch (RestClientResponseException ex) {
      throw toTransitException(ex);
    }
  }

  public void updateDatasetRetrievalModel(
      String datasetId,
      String searchMethod,
      boolean rerankingEnable,
      Integer topK,
      boolean scoreThresholdEnabled,
      Double scoreThreshold,
      String rerankingProviderName,
      String rerankingModelName) {
    try {
      log.info("Dify updateDatasetRetrievalModel datasetId={} searchMethod={} rerankingEnable={} topK={} scoreThresholdEnabled={} scoreThreshold={} provider={} model={}",
          datasetId, searchMethod, rerankingEnable, topK, scoreThresholdEnabled, scoreThreshold, rerankingProviderName, rerankingModelName);
      ObjectNode request = objectMapper.createObjectNode();
      ObjectNode retrievalModel = request.putObject("retrieval_model");
      retrievalModel.put("search_method", StringUtils.hasText(searchMethod) ? searchMethod : "hybrid_search");
      retrievalModel.put("reranking_enable", rerankingEnable);
      if (rerankingEnable) {
        retrievalModel.put("reranking_mode", "reranking_model");
        if (StringUtils.hasText(rerankingProviderName) && StringUtils.hasText(rerankingModelName)) {
          ObjectNode rerankingModelNode = retrievalModel.putObject("reranking_model");
          rerankingModelNode.put("reranking_provider_name", rerankingProviderName);
          rerankingModelNode.put("reranking_model_name", rerankingModelName);
        }
      }
      if (topK != null && topK > 0) {
        retrievalModel.put("top_k", topK);
      }
      retrievalModel.put("score_threshold_enabled", scoreThresholdEnabled);
      if (scoreThresholdEnabled && scoreThreshold != null) {
        retrievalModel.put("score_threshold", Math.max(0d, scoreThreshold));
      }

      restClientForDataset().patch()
          .uri("/v1/datasets/{datasetId}", datasetId)
          .contentType(MediaType.APPLICATION_JSON)
          .body(request.toString())
          .retrieve()
          .toBodilessEntity();
    } catch (RestClientResponseException ex) {
      throw toTransitException(ex);
    }
  }

  public String runWorkflow(String apiKey, ObjectNode inputs, String user) {
    try {
      log.info("Dify runWorkflow user={}", user);
      ObjectNode request = objectMapper.createObjectNode();
      request.set("inputs", inputs);
      request.put("response_mode", "blocking");
      request.put("user", user);

      String responseJson = restClient(apiKey).post()
          .uri("/v1/workflows/run")
          .contentType(MediaType.APPLICATION_JSON)
          .body(request.toString())
          .retrieve()
          .body(String.class);
      
      log.info("Dify runWorkflow responseSize={}", responseJson == null ? 0 : responseJson.length());
      
      if (responseJson == null) {
        return null;
      }
      
      JsonNode root = objectMapper.readTree(responseJson);
      if (root.hasNonNull("data") && root.get("data").hasNonNull("outputs")) {
        JsonNode outputs = root.get("data").get("outputs");
        if (outputs.hasNonNull("text")) {
            return outputs.get("text").asText();
        } else if (outputs.hasNonNull("result")) {
            JsonNode resultNode = outputs.get("result");
            if (resultNode.isContainerNode()) {
                return resultNode.toString();
            }
            return resultNode.asText();
        } else {
             // Fallback: return the whole outputs as string if we can't find specific field
             return outputs.toString();
        }
      }
      return null;
    } catch (Exception ex) {
      if (ex instanceof RestClientResponseException rex) {
          throw toTransitException(rex);
      }
      throw new RuntimeException("Failed to run workflow", ex);
    }
  }

  private RestClient restClient(String apiKey) {
    String baseUrl = properties.getBaseUrl();
    if (!StringUtils.hasText(baseUrl)) {
      throw new TransitException(ErrorCode.INTERNAL_ERROR, "DIFY_BASE_URL 未配置");
    }
    if (!StringUtils.hasText(apiKey)) {
      throw new TransitException(ErrorCode.UNAUTHORIZED, "DIFY_API_KEY (Workflow) 未配置");
    }
    return RestClient.builder()
        .baseUrl(baseUrl)
        .defaultHeader("Authorization", "Bearer " + apiKey)
        .build();
  }

  private RestClient restClientForChat() {
    String baseUrl = properties.getBaseUrl();
    String apiKey = properties.getChatApiKey();
    if (!StringUtils.hasText(baseUrl)) {
      throw new TransitException(ErrorCode.INTERNAL_ERROR, "DIFY_BASE_URL 未配置");
    }
    if (!StringUtils.hasText(apiKey)) {
      throw new TransitException(ErrorCode.UNAUTHORIZED, "DIFY_CHAT_API_KEY 未配置");
    }
    return RestClient.builder()
        .baseUrl(baseUrl)
        .defaultHeader("Authorization", "Bearer " + apiKey)
        .build();
  }

  private RestClient restClientForDataset() {
    String baseUrl = properties.getBaseUrl();
    String apiKey = properties.getDatasetApiKey();
    if (!StringUtils.hasText(baseUrl)) {
      throw new TransitException(ErrorCode.INTERNAL_ERROR, "DIFY_BASE_URL 未配置");
    }
    if (!StringUtils.hasText(apiKey)) {
      throw new TransitException(ErrorCode.UNAUTHORIZED, "DIFY_DATASET_API_KEY 未配置");
    }
    return RestClient.builder()
        .baseUrl(baseUrl)
        .defaultHeader("Authorization", "Bearer " + apiKey)
        .build();
  }

  private DifyChatResult parseChatResult(String responseJson) {
    if (responseJson == null) {
      return new DifyChatResult(null, null, null);
    }
    try {
      JsonNode node = objectMapper.readTree(responseJson);
      String conversationId = node.hasNonNull("conversation_id") ? node.get("conversation_id").asText() : null;
      String answer = node.hasNonNull("answer") ? node.get("answer").asText() : null;
      return new DifyChatResult(responseJson, conversationId, answer);
    } catch (Exception ex) {
      return new DifyChatResult(responseJson, null, null);
    }
  }

  private boolean isSsePayload(String payload) {
    if (!StringUtils.hasText(payload)) {
      return false;
    }
    String trimmed = payload.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      return false;
    }
    return payload.contains("data:") || payload.contains("event:");
  }

  private boolean isStreamingRequest(String requestBodyJson) {
    if (!StringUtils.hasText(requestBodyJson)) {
      return false;
    }
    try {
      JsonNode node = objectMapper.readTree(requestBodyJson);
      return "streaming".equalsIgnoreCase(node.path("response_mode").asText());
    } catch (Exception ex) {
      return false;
    }
  }

  private ChatRequestPayload normalizeChatRequestPayload(String requestBodyJson) {
    if (!StringUtils.hasText(requestBodyJson)) {
      return new ChatRequestPayload(requestBodyJson, false, null, false);
    }
    try {
      JsonNode node = objectMapper.readTree(requestBodyJson);
      if (!(node instanceof ObjectNode objectNode)) {
        return new ChatRequestPayload(requestBodyJson, isStreamingRequest(requestBodyJson), null, false);
      }
      String responseMode = objectNode.path("response_mode").asText(null);
      if ("streaming".equalsIgnoreCase(responseMode)) {
        return new ChatRequestPayload(requestBodyJson, true, responseMode, false);
      }
      objectNode.put("response_mode", "streaming");
      return new ChatRequestPayload(objectNode.toString(), true, responseMode, true);
    } catch (Exception ex) {
      log.warn("Dify chatMessages 解析请求体失败，保留原 response_mode，msg={}", ex.getMessage());
      return new ChatRequestPayload(requestBodyJson, isStreamingRequest(requestBodyJson), null, false);
    }
  }

  private DifyChatResult parseChatResultFromSse(String ssePayload) {
    if (!StringUtils.hasText(ssePayload)) {
      return new DifyChatResult(null, null, null);
    }
    String conversationId = null;
    StringBuilder answerBuilder = new StringBuilder();
    String[] lines = ssePayload.split("\\r?\\n");
    for (String line : lines) {
      if (!StringUtils.hasText(line)) {
        continue;
      }
      String trimmed = line.trim();
      if (!trimmed.startsWith("data:")) {
        continue;
      }
      String dataPart = trimmed.substring(5).trim();
      if (!StringUtils.hasText(dataPart) || "[DONE]".equals(dataPart)) {
        continue;
      }
      try {
        JsonNode node = objectMapper.readTree(dataPart);
        String currentConversationId = extractConversationIdFromEvent(node);
        if (StringUtils.hasText(currentConversationId)) {
          conversationId = currentConversationId;
        }
        
        String event = node.path("event").asText("");
        if ("error".equals(event)) {
          String errMsg = node.path("message").asText("Unknown Dify SSE Error");
          int errStatus = node.path("status").asInt(400);
          throw new TransitException(ErrorCode.BAD_REQUEST, "Dify SSE Error (" + errStatus + "): " + errMsg);
        }
        
        if ("message".equals(event) || "agent_message".equals(event) || "text_chunk".equals(event) || "".equals(event) || "answer".equals(event)) {
          String answer = extractAnswerFromEvent(node);
          if (StringUtils.hasText(answer)) {
            answerBuilder.append(answer);
          }
        } else if ("message_replace".equals(event) || "text_replace".equals(event)) {
          String answer = extractAnswerFromEvent(node);
          if (StringUtils.hasText(answer)) {
            answerBuilder.setLength(0);
            answerBuilder.append(answer);
          }
        }
      } catch (TransitException ex) {
        throw ex;
      } catch (Exception ignored) {
      }
    }
    String answer = answerBuilder.toString();
    ObjectNode normalized = objectMapper.createObjectNode();
    if (StringUtils.hasText(conversationId)) {
      normalized.put("conversation_id", conversationId);
    } else {
      normalized.putNull("conversation_id");
    }
    normalized.put("answer", answer);
    normalized.put("mode", "streaming");
    return new DifyChatResult(normalized.toString(), conversationId, StringUtils.hasText(answer) ? answer : null);
  }

  private String extractConversationIdFromEvent(JsonNode node) {
    if (node == null || node.isMissingNode() || node.isNull()) {
      return null;
    }
    if (node.hasNonNull("conversation_id")) {
      return node.get("conversation_id").asText();
    }
    JsonNode dataNode = node.path("data");
    if (dataNode.hasNonNull("conversation_id")) {
      return dataNode.get("conversation_id").asText();
    }
    return null;
  }

  private String extractAnswerFromEvent(JsonNode node) {
    if (node == null || node.isMissingNode() || node.isNull()) {
      return null;
    }
    // Handle top-level answer
    if (node.hasNonNull("answer")) {
      return node.get("answer").asText();
    }
    
    JsonNode dataNode = node.path("data");
    if (dataNode.isMissingNode() || dataNode.isNull()) {
      return null;
    }

    // Handle data.answer (Basic chat message)
    if (dataNode.hasNonNull("answer")) {
      return dataNode.get("answer").asText();
    }
    
    // Handle data.text (Workflow text_chunk)
    if (dataNode.hasNonNull("text")) {
      return dataNode.get("text").asText();
    }

    return null;
  }

  private DifyDatasetResult parseDatasetResult(String responseJson) {
    if (responseJson == null) {
      return new DifyDatasetResult(null, null);
    }
    try {
      JsonNode node = objectMapper.readTree(responseJson);
      String datasetId = node.hasNonNull("id") ? node.get("id").asText() : null;
      return new DifyDatasetResult(responseJson, datasetId);
    } catch (Exception ex) {
      return new DifyDatasetResult(responseJson, null);
    }
  }

  public record DifyChatResult(String rawJson, String conversationId, String answer) {
  }

  private record ChatRequestPayload(
      String requestBodyJson,
      boolean streaming,
      String originalResponseMode,
      boolean responseModeAdjusted) {
  }

  public record DifyDatasetResult(String rawJson, String datasetId) {
  }

  public record DifyDocumentResult(
      String rawJson,
      String documentId,
      String indexingStatus,
      String error,
      Integer wordCount) {
  }

  private DifyDatasetListResult parseDatasetListResult(String responseJson) {
    if (responseJson == null) {
      return new DifyDatasetListResult(List.of(), false);
    }
    try {
      JsonNode node = objectMapper.readTree(responseJson);
      List<DifyDatasetItem> items = new ArrayList<>();
      if (node.hasNonNull("data")) {
        for (JsonNode itemNode : node.get("data")) {
          String id = itemNode.hasNonNull("id") ? itemNode.get("id").asText() : null;
          String name = itemNode.hasNonNull("name") ? itemNode.get("name").asText() : null;
          if (id != null && name != null) {
            items.add(new DifyDatasetItem(id, name));
          }
        }
      }
      boolean hasMore = node.hasNonNull("has_more") && node.get("has_more").asBoolean();
      return new DifyDatasetListResult(items, hasMore);
    } catch (Exception ex) {
      log.error("Failed to parse dataset list", ex);
      return new DifyDatasetListResult(List.of(), false);
    }
  }

  public record DifyDatasetItem(String id, String name) {}
  public record DifyDatasetListResult(List<DifyDatasetItem> data, boolean hasMore) {}

  private DifyDocumentResult parseDocumentResult(String responseJson) {
    if (responseJson == null) {
      return new DifyDocumentResult(null, null, null, null, 0);
    }
    try {
      JsonNode root = objectMapper.readTree(responseJson);
      JsonNode document = root.path("document");
      if (document == null || document.isMissingNode() || document.isNull()) {
        document = root;
      }
      String documentId = extractText(document, "id");
      if (!StringUtils.hasText(documentId)) {
        documentId = extractText(root, "id");
      }
      String indexingStatus = extractText(document, "indexing_status");
      if (!StringUtils.hasText(indexingStatus)) {
        indexingStatus = extractText(root, "indexing_status");
      }
      String error = extractText(document, "error");
      if (!StringUtils.hasText(error)) {
        error = extractText(root, "error");
      }
      Integer wordCount = parseInt(document.path("word_count"), parseInt(root.path("word_count"), 0));
      return new DifyDocumentResult(responseJson, documentId, indexingStatus, error, wordCount);
    } catch (Exception ex) {
      log.error("Failed to parse document result", ex);
      return new DifyDocumentResult(responseJson, null, null, null, 0);
    }
  }

  private String parseUploadFileId(String responseJson) {
    if (!StringUtils.hasText(responseJson)) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "Dify 上传图片失败：返回为空");
    }
    try {
      JsonNode node = objectMapper.readTree(responseJson);
      String id = extractText(node, "id");
      if (!StringUtils.hasText(id)) {
        id = extractText(node, "data", "id");
      }
      if (!StringUtils.hasText(id)) {
        id = extractText(node, "file", "id");
      }
      if (StringUtils.hasText(id)) {
        return id;
      }
      throw new TransitException(ErrorCode.BAD_REQUEST, "Dify 上传图片失败：未返回文件ID");
    } catch (TransitException ex) {
      throw ex;
    } catch (Exception ex) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "Dify 上传图片失败：返回解析异常", ex);
    }
  }

  private Integer parseInt(JsonNode node, Integer fallback) {
    if (node != null && node.canConvertToInt()) {
      return node.asInt();
    }
    return fallback == null ? 0 : fallback;
  }

  private String extractText(JsonNode current, String... path) {
    JsonNode node = current;
    for (String item : path) {
      if (node == null) {
        return null;
      }
      node = node.path(item);
    }
    if (node == null || node.isMissingNode() || node.isNull()) {
      return null;
    }
    if (node.isTextual() || node.isNumber() || node.isBoolean()) {
      return node.asText();
    }
    return null;
  }

  private String readStreamingResponse(InputStream responseBody, String requestUrl, long startedAt) throws IOException {
    if (responseBody == null) {
      return null;
    }
    StringBuilder payloadBuilder = new StringBuilder();
    int lineCount = 0;
    int dataLineCount = 0;
    boolean terminalDetected = false;
    boolean firstContentLogged = false;
    try (BufferedReader reader = new BufferedReader(new InputStreamReader(responseBody, StandardCharsets.UTF_8))) {
      String line;
      while ((line = reader.readLine()) != null) {
        lineCount++;
        if (line.trim().startsWith("data:")) {
          dataLineCount++;
        }
        if (!firstContentLogged && StringUtils.hasText(line)) {
          firstContentLogged = true;
          log.info("Dify chatMessages 流式首包到达 url={} elapsedMs={} 首行内容={}",
              requestUrl,
              System.currentTimeMillis() - startedAt,
              abbreviate(line, 500));
        }
        payloadBuilder.append(line).append(System.lineSeparator());
        if (isStreamCompletedLine(line)) {
          terminalDetected = true;
          break;
        }
      }
    }
    long elapsedMs = System.currentTimeMillis() - startedAt;
    if (!firstContentLogged) {
      log.warn("Dify chatMessages 流式响应未读取到任何内容 url={} elapsedMs={}", requestUrl, elapsedMs);
    }
    log.info("Dify chatMessages 流式读取结束 url={} elapsedMs={} lineCount={} dataLineCount={} terminalDetected={} payloadLength={}",
        requestUrl,
        elapsedMs,
        lineCount,
        dataLineCount,
        terminalDetected,
        payloadBuilder.length());
    return payloadBuilder.toString();
  }

  private boolean isStreamCompletedLine(String line) {
    if (!StringUtils.hasText(line)) {
      return false;
    }
    String trimmed = line.trim();
    if ("data: [DONE]".equalsIgnoreCase(trimmed)) {
      return true;
    }
    if (trimmed.startsWith("event:")) {
      return isTerminalEvent(trimmed.substring(6).trim());
    }
    if (!trimmed.startsWith("data:")) {
      return false;
    }
    String dataPart = trimmed.substring(5).trim();
    if (!StringUtils.hasText(dataPart) || "[DONE]".equalsIgnoreCase(dataPart)) {
      return true;
    }
    try {
      JsonNode node = objectMapper.readTree(dataPart);
      return isTerminalEvent(extractEventType(node));
    } catch (Exception ex) {
      return false;
    }
  }

  private String extractEventType(JsonNode node) {
    if (node == null || node.isMissingNode() || node.isNull()) {
      return null;
    }
    if (node.hasNonNull("event")) {
      return node.get("event").asText();
    }
    JsonNode dataNode = node.path("data");
    if (dataNode.hasNonNull("event")) {
      return dataNode.get("event").asText();
    }
    return null;
  }

  private boolean isTerminalEvent(String event) {
    if (!StringUtils.hasText(event)) {
      return false;
    }
    return "message_end".equalsIgnoreCase(event)
        || "agent_message_end".equalsIgnoreCase(event)
        || "workflow_finished".equalsIgnoreCase(event)
        || "tts_message_end".equalsIgnoreCase(event)
        || "done".equalsIgnoreCase(event)
        || "error".equalsIgnoreCase(event);
  }

  private boolean containsFiles(String requestBodyJson) {
    if (!StringUtils.hasText(requestBodyJson)) {
      return false;
    }
    try {
      JsonNode node = objectMapper.readTree(requestBodyJson);
      JsonNode filesNode = node.path("files");
      return filesNode.isArray() && !filesNode.isEmpty();
    } catch (Exception ex) {
      return false;
    }
  }

  private boolean containsConversationId(String requestBodyJson) {
    if (!StringUtils.hasText(requestBodyJson)) {
      return false;
    }
    try {
      JsonNode node = objectMapper.readTree(requestBodyJson);
      return node.hasNonNull("conversation_id") && StringUtils.hasText(node.path("conversation_id").asText());
    } catch (Exception ex) {
      return false;
    }
  }

  private String buildChatRequestUrl() {
    String baseUrl = properties.getBaseUrl();
    if (!StringUtils.hasText(baseUrl)) {
      return "/v1/chat-messages";
    }
    String normalized = baseUrl.trim();
    if (normalized.endsWith("/")) {
      normalized = normalized.substring(0, normalized.length() - 1);
    }
    return normalized + "/v1/chat-messages";
  }

  private String maskToken(String token) {
    if (!StringUtils.hasText(token)) {
      return "EMPTY";
    }
    String trimmed = token.trim();
    if (trimmed.length() <= 8) {
      return "****";
    }
    return trimmed.substring(0, 4) + "****" + trimmed.substring(trimmed.length() - 4);
  }

  private String abbreviate(String text, int maxLength) {
    if (text == null) {
      return null;
    }
    if (maxLength <= 0 || text.length() <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength) + "...(truncated," + text.length() + ")";
  }

  private TransitException toTransitException(RestClientResponseException ex) {
    return toTransitException(ex.getRawStatusCode(), ex.getResponseBodyAsString(), ex);
  }

  private TransitException toTransitException(int statusCode, String responseBody, Exception ex) {
    ErrorCode errorCode = switch (statusCode) {
      case 401 -> ErrorCode.UNAUTHORIZED;
      case 403 -> ErrorCode.FORBIDDEN;
      default -> statusCode >= 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.BAD_REQUEST;
    };

    String message = null;
    try {
      String body = responseBody;
      if (body != null && !body.isBlank()) {
        JsonNode node = objectMapper.readTree(body);
        if (node.hasNonNull("message")) {
          message = node.get("message").asText();
        } else if (node.hasNonNull("error")) {
          message = node.get("error").asText();
        }
      }
    } catch (Exception ignored) {
      message = null;
    }

    String finalMessage = (message == null || message.isBlank())
        ? "Dify API error (" + statusCode + ")"
        : "Dify API error (" + statusCode + "): " + message;
    return new TransitException(errorCode, finalMessage, ex);
  }

  private Integer extractStatusCode(TransitException ex) {
    Throwable cause = ex.getCause();
    if (cause instanceof RestClientResponseException restEx) {
      return restEx.getRawStatusCode();
    }
    return null;
  }
}
