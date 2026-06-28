package com.shijie.transit.userapi.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.shijie.transit.common.web.ErrorCode;
import com.shijie.transit.common.web.TransitException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

@Service
public class WechatAutoReplyModelService {
  private static final Logger log = LoggerFactory.getLogger(WechatAutoReplyModelService.class);
  private static final String DEFAULT_COMPATIBLE_BASE_URL = "https://dashscope.aliyuncs.com";

  private final ObjectMapper objectMapper;
  private final RestClient restClient;
  private final String apiKey;
  private final String compatibleEndpoint;
  private final String model;

  public WechatAutoReplyModelService(
      ObjectMapper objectMapper,
      RestClient.Builder restClientBuilder,
      @Value("${spring.ai.dashscope.api-key:}") String dashScopeApiKey,
      @Value("${spring.ai.dashscope.chat.base-url:${spring.ai.dashscope.base-url:https://dashscope.aliyuncs.com}}") String dashScopeBaseUrl,
      @Value("${spring.ai.dashscope.chat.options.model:qwen-plus}") String chatModel) {
    this.objectMapper = objectMapper;
    this.restClient = restClientBuilder.build();
    this.apiKey = dashScopeApiKey == null ? "" : dashScopeApiKey.trim();
    this.compatibleEndpoint = buildCompatibleEndpoint(dashScopeBaseUrl);
    this.model = StringUtils.hasText(chatModel) ? chatModel.trim() : "qwen-plus";
  }

  public String generateReply(AutoReplyRequest request) {
    if (!StringUtils.hasText(apiKey)) {
      throw new TransitException(ErrorCode.INTERNAL_ERROR, "自动回复模型未配置");
    }
    if (request == null || !StringUtils.hasText(request.customerMessage())) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "自动回复缺少客户消息");
    }
    ObjectNode body = objectMapper.createObjectNode();
    body.put("model", model);
    body.put("stream", false);
    body.put("enable_thinking", false);
    ArrayNode messages = body.putArray("messages");
    messages.addObject()
        .put("role", "system")
        .put("content", systemPrompt());
    messages.addObject()
        .put("role", "user")
        .put("content", buildUserPrompt(request));

    log.info("微信自动回复模型请求 endpoint={} model={} messageLength={} hasImageSummary={}",
        compatibleEndpoint,
        model,
        request.customerMessage().length(),
        StringUtils.hasText(request.imageSummary()));
    try {
      JsonNode response = restClient.post()
          .uri(compatibleEndpoint)
          .headers(headers -> headers.setBearerAuth(apiKey))
          .contentType(MediaType.APPLICATION_JSON)
          .body(body)
          .retrieve()
          .body(JsonNode.class);
      String answer = readCompatibleContent(response).trim();
      if (!StringUtils.hasText(answer)) {
        throw new TransitException(ErrorCode.INTERNAL_ERROR, "自动回复模型返回为空");
      }
      log.info("微信自动回复模型调用成功 model={} answerLength={}", model, answer.length());
      return answer;
    } catch (RestClientResponseException ex) {
      log.error("微信自动回复模型调用失败 endpoint={} model={} status={} response={}",
          compatibleEndpoint, model, ex.getRawStatusCode(), abbreviate(ex.getResponseBodyAsString(), 1000), ex);
      throw new TransitException(ErrorCode.INTERNAL_ERROR, "自动回复模型调用失败：" + ex.getMessage(), ex);
    }
  }

  private String systemPrompt() {
    return """
        你是微信私域客服自动回复助手。
        只输出可以直接发送给客户的一段中文回复，不要输出 Markdown，不要解释你的思考过程。
        必须严格依据客户最新消息、知识库内容、角色设定和历史对话回复。
        如果知识库没有相关内容，要诚实说明并用角色设定给出稳妥的下一步建议，不能编造价格、承诺、链接或政策。
        回复要自然、简洁、适合微信聊天场景。
        """;
  }

  private String buildUserPrompt(AutoReplyRequest request) {
    StringBuilder sb = new StringBuilder();
    sb.append("客户最新消息：").append(nullSafe(request.customerMessage())).append("\n");
    if (StringUtils.hasText(request.imageSummary())) {
      sb.append("图片内容摘要：").append(nullSafe(request.imageSummary())).append("\n");
    }
    sb.append("知识库内容：\n").append(nullSafe(request.context())).append("\n\n");
    sb.append("角色设定：\n").append(nullSafe(request.roleContent())).append("\n\n");
    sb.append("历史对话：\n").append(nullSafe(request.history())).append("\n\n");
    if (StringUtils.hasText(request.salesStage()) || StringUtils.hasText(request.customerProfile())) {
      sb.append("销售阶段：").append(nullSafe(request.salesStage())).append("\n");
      sb.append("客户画像：\n").append(nullSafe(request.customerProfile())).append("\n\n");
    }
    sb.append("助手模式：").append(nullSafe(request.assistantMode()));
    return sb.toString();
  }

  private String readCompatibleContent(JsonNode response) {
    String content = text(response == null ? null : response.path("choices").path(0).path("message").path("content"));
    if (!StringUtils.hasText(content)) {
      throw new TransitException(ErrorCode.INTERNAL_ERROR, "自动回复模型返回为空");
    }
    return content;
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

  private String text(JsonNode node) {
    if (node == null || node.isMissingNode() || node.isNull()) {
      return "";
    }
    if (node.isTextual() || node.isNumber() || node.isBoolean()) {
      return node.asText();
    }
    return "";
  }

  private String nullSafe(String value) {
    return value == null ? "" : value.trim();
  }

  private String abbreviate(String text, int maxLength) {
    if (text == null || text.length() <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength) + "...";
  }

  public record AutoReplyRequest(
      String customerMessage,
      String imageSummary,
      String context,
      String roleContent,
      String history,
      String salesStage,
      String customerProfile,
      String assistantMode) {
  }
}
