package com.shijie.transit.userapi.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.shijie.transit.common.db.entity.CrmCustomerEntity;
import com.shijie.transit.common.db.entity.UserIntentEntity;
import com.shijie.transit.common.tenant.TenantContext;
import com.shijie.transit.common.web.ErrorCode;
import com.shijie.transit.common.web.TransitException;
import com.shijie.transit.userapi.mapper.SessionMessageHistoryMapper;
import com.shijie.transit.userapi.vo.SmartSalesVo;
import java.util.Collections;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

/**
 * 智能销售 AI 跟进建议服务。生成结果只进入人工草稿，不触发微信自动发送。
 */
@Service
public class SmartSalesAiSuggestionService {
  private static final Logger log = LoggerFactory.getLogger(SmartSalesAiSuggestionService.class);
  private static final int FOLLOW_UP_CONVERSATION_LIMIT = 20;
  private static final String DEFAULT_COMPATIBLE_BASE_URL = "https://dashscope.aliyuncs.com";

  private final SmartSalesCustomerAccess customerAccess;
  private final SessionMessageHistoryMapper sessionMessageHistoryMapper;
  private final ObjectMapper objectMapper;
  private final SalesTextSafetyService safetyService;
  private final boolean modelConfigured;
  private final RestClient restClient;
  private final String apiKey;
  private final String endpoint;
  private final String model;

  public SmartSalesAiSuggestionService(
      SmartSalesCustomerAccess customerAccess,
      SessionMessageHistoryMapper sessionMessageHistoryMapper,
      ObjectMapper objectMapper,
      SalesTextSafetyService safetyService,
      RestClient.Builder restClientBuilder,
      @Value("${spring.ai.dashscope.api-key:}") String dashScopeApiKey,
      @Value("${spring.ai.dashscope.chat.base-url:${spring.ai.dashscope.base-url:https://dashscope.aliyuncs.com}}") String dashScopeBaseUrl,
      @Value("${transit.ai.follow-up.model:qwen-plus}") String followUpModel) {
    this.customerAccess = customerAccess;
    this.sessionMessageHistoryMapper = sessionMessageHistoryMapper;
    this.objectMapper = objectMapper;
    this.safetyService = safetyService;
    this.apiKey = dashScopeApiKey == null ? "" : dashScopeApiKey.trim();
    this.endpoint = buildCompatibleEndpoint(dashScopeBaseUrl);
    this.model = StringUtils.hasText(followUpModel) ? followUpModel.trim() : "qwen-plus";
    this.modelConfigured = StringUtils.hasText(this.apiKey);
    this.restClient = restClientBuilder.build();
  }

  public SmartSalesVo.FollowUpSuggestion suggestFollowUp(Long ownerUserId, String contactKey) {
    if (!StringUtils.hasText(contactKey)) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "contactKey 不能为空");
    }
    if (!modelConfigured) {
      throw new TransitException(ErrorCode.INTERNAL_ERROR, "AI 跟进建议模型未配置（缺少 DashScope API Key）");
    }
    Long tenantId = TenantContext.getTenantId();
    String trimmedKey = contactKey.trim();
    UserIntentEntity intent = customerAccess.getIntent(tenantId, ownerUserId, trimmedKey);
    CrmCustomerEntity customer = customerAccess.findCustomer(tenantId, ownerUserId, trimmedKey);
    List<SessionMessageHistoryMapper.MessageItem> messages = loadRecentMessages(tenantId, ownerUserId, trimmedKey);

    ObjectNode request = objectMapper.createObjectNode();
    request.put("model", model);
    request.put("stream", false);
    request.put("enable_thinking", false);
    ArrayNode messagesNode = request.putArray("messages");
    messagesNode.addObject().put("role", "system").put("content", followUpSystemPrompt());
    messagesNode.addObject().put("role", "user").put("content", buildFollowUpUserPrompt(intent, customer, messages));

    log.info("AI跟进建议模型请求发起 endpoint={} model={} userId={} contactKey={}",
        endpoint, model, ownerUserId, trimmedKey);
    try {
      JsonNode response = restClient.post()
          .uri(endpoint)
          .headers(headers -> headers.setBearerAuth(apiKey))
          .contentType(MediaType.APPLICATION_JSON)
          .body(request)
          .retrieve()
          .body(JsonNode.class);
      String content = readCompatibleContent(response);
      log.info("AI跟进建议模型返回成功 model={} contentLength={}", model, content.length());
      return parseFollowUpSuggestion(content);
    } catch (RestClientResponseException ex) {
      log.error("AI跟进建议模型调用失败 endpoint={} model={} status={} response={}",
          endpoint, model, ex.getRawStatusCode(), abbreviate(ex.getResponseBodyAsString(), 500), ex);
      throw new TransitException(ErrorCode.INTERNAL_ERROR, "AI 跟进建议生成失败");
    }
  }

  SmartSalesVo.FollowUpSuggestion parseFollowUpSuggestion(String raw) {
    try {
      JsonNode node = objectMapper.readTree(stripJsonFence(raw));
      String content = text(node.path("suggestedContent"));
      if (!StringUtils.hasText(content)) {
        content = text(node.path("suggested_content"));
      }
      if (!StringUtils.hasText(content)) {
        return new SmartSalesVo.FollowUpSuggestion("", "AI 返回格式非标准，请人工编辑后再使用");
      }
      SalesTextSafetyService.SafetyResult safety = safetyService.checkFollowUpSuggestion(content);
      if (!safety.safe()) {
        return new SmartSalesVo.FollowUpSuggestion("", safety.reason());
      }
      String reason = text(node.path("reason"));
      return new SmartSalesVo.FollowUpSuggestion(safety.safeText(), reason);
    } catch (Exception ex) {
      log.warn("解析AI跟进建议JSON失败，不写入可发送草稿 reason={}", ex.getMessage());
      return new SmartSalesVo.FollowUpSuggestion("", "AI 返回格式非标准，请人工编辑后再使用");
    }
  }

  private List<SessionMessageHistoryMapper.MessageItem> loadRecentMessages(
      Long tenantId, Long ownerUserId, String contactKey) {
    Long maxMsgId = sessionMessageHistoryMapper.findRecentConversationMessages(
        tenantId, ownerUserId, contactKey, Long.MAX_VALUE, 1)
        .stream().findFirst().map(SessionMessageHistoryMapper.MessageItem::getId).orElse(null);
    if (maxMsgId == null) {
      return Collections.emptyList();
    }
    List<SessionMessageHistoryMapper.MessageItem> messages =
        sessionMessageHistoryMapper.findRecentConversationMessages(
            tenantId, ownerUserId, contactKey, maxMsgId, FOLLOW_UP_CONVERSATION_LIMIT);
    Collections.reverse(messages);
    return messages;
  }

  private String followUpSystemPrompt() {
    return """
        你是销售跟进助手。请基于客户画像和最近沟通记录，生成一条合适的跟进话术建议。
        输出必须是 JSON，字段固定为 suggestedContent 和 reason。
        严格规则：
        1) 只基于提供的客户信息生成，禁止编造客户未提及的产品或服务
        2) 禁止输出手机号、链接、微信号或绝对成交承诺
        3) 话术用于人工确认后的草稿，不代表系统会自动发送
        4) 只输出 JSON，不要任何解释、不要代码块""";
  }

  private String buildFollowUpUserPrompt(
      UserIntentEntity intent,
      CrmCustomerEntity customer,
      List<SessionMessageHistoryMapper.MessageItem> messages) {
    StringBuilder sb = new StringBuilder();
    sb.append("【客户画像】\n");
    if (intent != null) {
      sb.append("意向等级：").append(intent.getIntentLevel() == null ? "未知" : intent.getIntentLevel()).append("\n");
      sb.append("需求强度：").append(safe(intent.getDemandLevel())).append("\n");
      sb.append("预算：").append(safe(intent.getBudgetLevel())).append("\n");
      sb.append("时间紧迫度：").append(safe(intent.getTimeLevel())).append("\n");
      sb.append("最近事件：").append(safe(intent.getLatestEvent())).append("\n");
      sb.append("当日总结：").append(safe(intent.getDailySummary())).append("\n");
    } else {
      sb.append("暂无意向分析数据\n");
    }
    if (customer != null) {
      sb.append("商机阶段：").append(safe(customer.getStage())).append("\n");
      sb.append("备注名：").append(safe(customer.getRemarkName())).append("\n");
      if (StringUtils.hasText(customer.getAiProfileJson())) {
        sb.append("AI画像：").append(customer.getAiProfileJson()).append("\n");
      }
    }
    sb.append("\n【最近沟通记录】\n");
    if (messages.isEmpty()) {
      sb.append("暂无沟通记录");
    } else {
      for (SessionMessageHistoryMapper.MessageItem item : messages) {
        String role = "USER".equalsIgnoreCase(item.getSenderType()) ? "客户" : "我方";
        String time = item.getSentAt() == null ? "" : item.getSentAt().toString();
        String content = item.getMessageContent() == null ? "" : item.getMessageContent();
        sb.append("[").append(time).append("] ").append(role).append("：").append(content).append("\n");
      }
    }
    return sb.toString();
  }

  private String readCompatibleContent(JsonNode response) {
    JsonNode contentNode = response == null
        ? null
        : response.path("choices").path(0).path("message").path("content");
    String content = contentNode == null || contentNode.isNull() ? "" : contentNode.asText("");
    if (!StringUtils.hasText(content)) {
      throw new IllegalStateException("AI模型返回内容为空");
    }
    return content.trim();
  }

  private String text(JsonNode node) {
    if (node == null || node.isMissingNode() || node.isNull()) {
      return "";
    }
    return node.isTextual() || node.isNumber() || node.isBoolean() ? node.asText() : "";
  }

  private String safe(String value) {
    return StringUtils.hasText(value) ? value : "未知";
  }

  private String stripJsonFence(String text) {
    if (text == null) return "";
    String value = text.trim();
    if (value.startsWith("```")) {
      value = value.replaceFirst("^```(?:json|JSON)?\\s*", "");
      value = value.replaceFirst("\\s*```$", "");
    }
    return value.trim();
  }

  private String buildCompatibleEndpoint(String configuredBaseUrl) {
    String baseUrl = StringUtils.hasText(configuredBaseUrl) ? configuredBaseUrl.trim() : DEFAULT_COMPATIBLE_BASE_URL;
    baseUrl = baseUrl.replaceAll("/+$", "");
    if (baseUrl.endsWith("/chat/completions")) return baseUrl;
    if (baseUrl.endsWith("/compatible-mode/v1")) return baseUrl + "/chat/completions";
    if (baseUrl.endsWith("/api/v1")) baseUrl = baseUrl.substring(0, baseUrl.length() - "/api/v1".length());
    return baseUrl + "/compatible-mode/v1/chat/completions";
  }

  private String abbreviate(String text, int maxLength) {
    if (!StringUtils.hasText(text)) {
      return "";
    }
    String value = text.trim();
    return value.length() <= maxLength ? value : value.substring(0, maxLength);
  }
}
