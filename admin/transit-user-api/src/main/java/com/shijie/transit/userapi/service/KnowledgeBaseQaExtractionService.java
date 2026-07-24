package com.shijie.transit.userapi.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

@Service
public class KnowledgeBaseQaExtractionService {
  private static final Logger log = LoggerFactory.getLogger(KnowledgeBaseQaExtractionService.class);
  private static final int CHUNK_SIZE = 7000;
  private static final String DEFAULT_COMPATIBLE_BASE_URL = "https://dashscope.aliyuncs.com";
  private final boolean modelConfigured;
  private final ObjectMapper objectMapper;
  private final RestClient restClient;
  private final String apiKey;
  private final String compatibleEndpoint;
  private final String model;

  public KnowledgeBaseQaExtractionService(
      ObjectMapper objectMapper,
      RestClient.Builder restClientBuilder,
      @Value("${spring.ai.dashscope.api-key:}") String dashScopeApiKey,
      @Value("${spring.ai.dashscope.chat.base-url:${spring.ai.dashscope.base-url:https://dashscope.aliyuncs.com}}") String dashScopeBaseUrl,
      @Value("${spring.ai.dashscope.chat.options.model:qwen-plus}") String dashScopeModel) {
    this.modelConfigured = StringUtils.hasText(dashScopeApiKey);
    this.objectMapper = objectMapper;
    this.apiKey = dashScopeApiKey == null ? "" : dashScopeApiKey.trim();
    this.compatibleEndpoint = buildCompatibleEndpoint(dashScopeBaseUrl);
    this.model = StringUtils.hasText(dashScopeModel) ? dashScopeModel.trim() : "qwen-plus";
    this.restClient = restClientBuilder.build();
  }

  public List<CleaningQaItem> extractQaItems(String cleanedText) {
    if (!StringUtils.hasText(cleanedText)) {
      throw new IllegalArgumentException("文件解析后没有可清洗文本");
    }
    if (!modelConfigured) {
      throw new IllegalStateException("AI 清洗模型未配置");
    }
    List<CleaningQaItem> allItems = new ArrayList<>();
    for (String chunk : splitText(cleanedText)) {
      String response;
      try {
        response = callCompatibleChat(chunk);
      } catch (Exception ex) {
        throw new IllegalStateException("AI 清洗调用失败：" + safeMessage(ex), ex);
      }
      allItems.addAll(parseQaItems(response));
    }
    if (allItems.isEmpty()) {
      throw new IllegalArgumentException("AI 未提取到可用问答");
    }
    log.info("知识库文件 AI 清洗完成 qaCount={}", allItems.size());
    return allItems;
  }

  private String callCompatibleChat(String chunk) throws Exception {
    ObjectNode request = objectMapper.createObjectNode();
    request.put("model", model);
    request.put("stream", false);
    // qwen3.6-plus 默认会输出深度思考内容，清洗场景只需要稳定的 JSON 正文。
    request.put("enable_thinking", false);
    ArrayNode messages = request.putArray("messages");
    messages.addObject()
        .put("role", "system")
        .put("content", systemPrompt());
    messages.addObject()
        .put("role", "user")
        .put("content", chunk);

    log.info("知识库 AI 清洗发起百炼兼容接口请求 endpoint={} model={} textLength={}",
        compatibleEndpoint, model, chunk.length());
    try {
      JsonNode response = restClient.post()
          .uri(compatibleEndpoint)
          .headers(headers -> headers.setBearerAuth(apiKey))
          .contentType(MediaType.APPLICATION_JSON)
          .body(request)
          .retrieve()
          .body(JsonNode.class);
      String content = readCompatibleContent(response);
      log.info("知识库 AI 清洗百炼兼容接口返回成功 model={} contentLength={}",
          model, content.length());
      return content;
    } catch (RestClientResponseException ex) {
      log.error("知识库 AI 清洗百炼兼容接口失败 endpoint={} model={} status={} response={}",
          compatibleEndpoint, model, ex.getRawStatusCode(), abbreviate(ex.getResponseBodyAsString(), 1000), ex);
      throw ex;
    }
  }

  private String readCompatibleContent(JsonNode response) {
    JsonNode contentNode = response == null
        ? null
        : response.path("choices").path(0).path("message").path("content");
    String content = text(contentNode);
    if (!StringUtils.hasText(content)) {
      throw new IllegalArgumentException("AI 清洗结果为空");
    }
    return content;
  }

  public List<CleaningQaItem> parseQaItems(String aiOutput) {
    if (!StringUtils.hasText(aiOutput)) {
      throw new IllegalArgumentException("AI 清洗结果为空");
    }
    try {
      JsonNode root = objectMapper.readTree(stripJsonFence(aiOutput));
      if (!root.isArray()) {
        throw new IllegalArgumentException("AI 清洗结果必须是 JSON 数组");
      }
      List<CleaningQaItem> items = new ArrayList<>();
      for (JsonNode node : root) {
        List<String> questions = readQuestions(node);
        String answer = text(node.path("answer"));
        if (questions.isEmpty() || !StringUtils.hasText(answer)) {
          throw new IllegalArgumentException("AI 清洗结果缺少问题或答案");
        }
        items.add(new CleaningQaItem(
            questions,
            answer.trim(),
            normalizeStatus(text(node.path("status"))),
            text(node.path("warning")).trim()));
      }
      return items;
    } catch (IllegalArgumentException ex) {
      throw ex;
    } catch (Exception ex) {
      throw new IllegalArgumentException("AI 清洗结果不是有效 JSON", ex);
    }
  }

  private List<String> readQuestions(JsonNode node) {
    LinkedHashSet<String> questions = new LinkedHashSet<>();
    JsonNode questionsNode = node.path("questions");
    if (questionsNode.isArray()) {
      for (JsonNode questionNode : questionsNode) {
        addQuestion(questions, text(questionNode));
      }
    } else {
      addQuestion(questions, text(questionsNode));
    }
    // 兼容模型偶发返回旧的单问题字段，避免一次清洗任务整体失败。
    if (questions.isEmpty()) {
      addQuestion(questions, text(node.path("question")));
    }
    return List.copyOf(questions);
  }

  private void addQuestion(LinkedHashSet<String> questions, String question) {
    if (StringUtils.hasText(question)) {
      questions.add(question.trim());
    }
  }

  private List<String> splitText(String text) {
    List<String> chunks = new ArrayList<>();
    String normalized = text.trim();
    for (int start = 0; start < normalized.length(); start += CHUNK_SIZE) {
      chunks.add(normalized.substring(start, Math.min(start + CHUNK_SIZE, normalized.length())));
    }
    return chunks;
  }

  private String systemPrompt() {
    return """
        你是客服知识库数据清洗助手。请从用户提供的原始文本中提取可直接用于客服问答检索的知识点。
        输出必须是 JSON Array，不要输出 Markdown，不要解释。
        每个元素字段固定为 questions、answer、status、warning；questions 必须是非空字符串数组。
        当原文明确多个问题共用同一个答案时，把这些原文中的问题放在同一个 questions 数组中。
        不要根据常识生成原文不存在的同义问法，也不要把不同答案的问题合并。
        status 只能是 NORMAL、WARNING、INCOMPLETE。
        如果原文存在冲突、模糊、缺少条件或时间范围，请把 status 设为 WARNING 或 INCOMPLETE，并在 warning 中写中文提示。
        """;
  }

  private String normalizeStatus(String status) {
    String value = StringUtils.hasText(status) ? status.trim().toUpperCase(Locale.ROOT) : "NORMAL";
    if ("NORMAL".equals(value) || "WARNING".equals(value) || "INCOMPLETE".equals(value)) {
      return value;
    }
    return "WARNING";
  }

  private String stripJsonFence(String text) {
    String value = text.trim();
    if (value.startsWith("```")) {
      value = value.replaceFirst("^```(?:json|JSON)?\\s*", "");
      value = value.replaceFirst("\\s*```$", "");
    }
    return value.trim();
  }

  private String safeMessage(Exception ex) {
    if (ex == null || !StringUtils.hasText(ex.getMessage())) {
      return "未知错误";
    }
    return ex.getMessage();
  }

  private String text(JsonNode node) {
    if (node == null || node.isMissingNode() || node.isNull()) {
      return "";
    }
    if (node.isTextual() || node.isNumber() || node.isBoolean()) {
      return node.asText();
    }
    return "";
  }

  private String buildCompatibleEndpoint(String configuredBaseUrl) {
    String baseUrl = StringUtils.hasText(configuredBaseUrl) ? configuredBaseUrl.trim() : DEFAULT_COMPATIBLE_BASE_URL;
    baseUrl = baseUrl.replaceAll("/+$", "");
    if (baseUrl.endsWith("/chat/completions")) {
      return baseUrl;
    }
    if (baseUrl.endsWith("/compatible-mode/v1")) {
      return baseUrl + "/chat/completions";
    }
    if (baseUrl.endsWith("/api/v1")) {
      baseUrl = baseUrl.substring(0, baseUrl.length() - "/api/v1".length());
    }
    return baseUrl + "/compatible-mode/v1/chat/completions";
  }

  private String abbreviate(String text, int maxLength) {
    if (!StringUtils.hasText(text)) {
      return "";
    }
    String value = text.trim();
    return value.length() <= maxLength ? value : value.substring(0, maxLength);
  }

  public record CleaningQaItem(List<String> questions, String answer, String status, String warning) {
    public CleaningQaItem {
      questions = questions == null ? List.of() : List.copyOf(questions);
    }

    public CleaningQaItem(String question, String answer, String status, String warning) {
      this(StringUtils.hasText(question) ? List.of(question.trim()) : List.of(), answer, status, warning);
    }
  }
}
