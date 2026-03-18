package com.shijie.transit.userapi.dify;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.shijie.transit.common.web.ErrorCode;
import com.shijie.transit.common.web.TransitException;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
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
    try {
      log.info("Dify chatMessages requestSize={}", requestBodyJson == null ? 0 : requestBodyJson.length());
      String responseJson = restClientForChat().post()
          .uri("/v1/chat-messages")
          .contentType(MediaType.APPLICATION_JSON)
          .body(requestBodyJson)
          .retrieve()
          .body(String.class);
      log.info("Dify chatMessages responseSize={}", responseJson == null ? 0 : responseJson.length());
      return parseChatResult(responseJson);
    } catch (RestClientResponseException ex) {
      throw toTransitException(ex);
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

  private TransitException toTransitException(RestClientResponseException ex) {
    ErrorCode errorCode = switch (ex.getRawStatusCode()) {
      case 401 -> ErrorCode.UNAUTHORIZED;
      case 403 -> ErrorCode.FORBIDDEN;
      default -> ex.getRawStatusCode() >= 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.BAD_REQUEST;
    };

    String message = null;
    try {
      String body = ex.getResponseBodyAsString();
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
        ? "Dify API error (" + ex.getRawStatusCode() + ")"
        : "Dify API error (" + ex.getRawStatusCode() + "): " + message;
    return new TransitException(errorCode, finalMessage, ex);
  }
}
