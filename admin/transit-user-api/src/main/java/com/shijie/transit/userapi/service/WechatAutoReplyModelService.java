package com.shijie.transit.userapi.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.shijie.transit.common.web.ErrorCode;
import com.shijie.transit.common.web.TransitException;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
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
public class WechatAutoReplyModelService {
  private static final Logger log = LoggerFactory.getLogger(WechatAutoReplyModelService.class);
  private static final String DEFAULT_COMPATIBLE_BASE_URL = "https://dashscope.aliyuncs.com";
  private static final DateTimeFormatter CURRENT_TIME_FORMATTER =
      DateTimeFormatter.ofPattern("yyyy年MM月dd日 EEEE HH:mm", Locale.CHINA);

  private final ObjectMapper objectMapper;
  private final RestClient restClient;
  private final String apiKey;
  private final String compatibleEndpoint;
  private final String model;
  private final Clock clock;

  public WechatAutoReplyModelService(
      ObjectMapper objectMapper,
      RestClient.Builder restClientBuilder,
      Clock clock,
      @Value("${spring.ai.dashscope.api-key:}") String dashScopeApiKey,
      @Value("${spring.ai.dashscope.chat.base-url:${spring.ai.dashscope.base-url:https://dashscope.aliyuncs.com}}") String dashScopeBaseUrl,
      @Value("${spring.ai.dashscope.chat.options.model:qwen-plus}") String chatModel) {
    this.objectMapper = objectMapper;
    this.restClient = restClientBuilder.build();
    this.clock = clock;
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
        你是微信私域聊天代回复助手。
        只输出可以直接发送给客户的一段中文回复，不要输出 Markdown，不要解释你的思考过程。
        回复要像真人微信聊天：自然、简洁、有来有回，不能像公告、机器人或客服模板。
        不要说“我是 AI”、不要说“作为智能助手”、不要提模型、知识库、系统提示、分类结果或思考过程。
        必须严格依据客户最新消息、当前时间、知识库内容、角色设定和历史对话回复。
        如果知识库没有相关内容，要诚实说明并用角色设定给出稳妥的下一步建议，不能编造价格、承诺、链接或政策。
        如果客户只是寒暄、确认、约时间或表达暂时不聊，优先短句自然回应，不要强行推销或长篇解释。
        """;
  }

  private String buildUserPrompt(AutoReplyRequest request) {
    StringBuilder sb = new StringBuilder();
    sb.append("当前时间：").append(buildCurrentTimeText()).append("\n");
    sb.append(buildIntentRules(request.assistantMode())).append("\n");
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

  private String buildCurrentTimeText() {
    LocalDateTime now = LocalDateTime.now(clock);
    return CURRENT_TIME_FORMATTER.format(now) + "，" + resolveTimePeriod(now.getHour());
  }

  private String resolveTimePeriod(int hour) {
    if (hour >= 5 && hour < 9) {
      return "早上";
    }
    if (hour >= 9 && hour < 12) {
      return "上午";
    }
    if (hour >= 12 && hour < 14) {
      return "中午";
    }
    if (hour >= 14 && hour < 18) {
      return "下午";
    }
    if (hour >= 18 && hour < 23) {
      return "晚上";
    }
    return "深夜";
  }

  private String buildIntentRules(String assistantMode) {
    String normalized = StringUtils.hasText(assistantMode)
        ? assistantMode.trim().toLowerCase(Locale.ROOT)
        : "customer_service";
    if ("sales".equals(normalized)) {
      return """
          消息类型判断：智能销售
          - 闲聊寒暄类：客户在打招呼、闲聊、问天气、讲笑话、讲生活，或者只是表达礼貌确认；回复要轻松自然，先接住话题，不要急着推产品。
          - 咨询项目/产品/方案类：客户在问项目、产品、服务、方案、流程、规则、适配场景或解决方案；优先结合知识库和角色设定解释清楚，并顺势推进下一步沟通。
          - 价格/费用/优惠/购买意向类：客户询问价格、费用、折扣、体验价、优惠活动、预算、试用、购买、预约或留下联系方式；必须谨慎，不能编造价格和承诺，适合时推动确认需求或安排跟进。
          分类只在内部用于决定回复策略，最终回复里不要写出分类名称。
          """;
    }
    return """
        消息类型判断：智能客服
        - 闲聊/寒暄/确认类：客户打招呼、闲聊、问天气、讲笑话、简单确认、表示晚点聊或只是礼貌回应；回复要短、自然、像真人接话，不要长篇介绍。
        - 问题咨询/需求解决类：客户明确咨询问题、规则、要求、流程、使用方法、售后、故障或具体需求；优先依据知识库回答，必要时给出下一步处理方式。
        分类只在内部用于决定回复策略，最终回复里不要写出分类名称。
        """;
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
