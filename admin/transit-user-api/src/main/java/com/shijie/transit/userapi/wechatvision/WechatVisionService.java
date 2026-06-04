package com.shijie.transit.userapi.wechatvision;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HexFormat;
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
public class WechatVisionService {
  private static final Logger log = LoggerFactory.getLogger(WechatVisionService.class);
  private static final String DEFAULT_COMPATIBLE_BASE_URL = "https://dashscope.aliyuncs.com";
  private static final int MAX_LOG_RESPONSE_LENGTH = 1000;
  private static final String SCENE_HINT_CHAT = "CHAT";
  private static final String SCENE_HINT_CONVERSATION_LIST = "CONVERSATION_LIST";

  private final boolean modelConfigured;
  private final ObjectMapper objectMapper;
  private final RestClient restClient;
  private final String apiKey;
  private final String compatibleEndpoint;
  private final String model;

  public WechatVisionService(
      ObjectMapper objectMapper,
      RestClient.Builder restClientBuilder,
      @Value("${spring.ai.dashscope.api-key:}") String dashScopeApiKey,
      @Value("${spring.ai.dashscope.chat.base-url:${spring.ai.dashscope.base-url:https://dashscope.aliyuncs.com}}") String dashScopeBaseUrl,
      @Value("${spring.ai.dashscope.vision.model:${spring.ai.dashscope.chat.options.model:qwen-vl-plus}}") String visionModel) {
    this.modelConfigured = StringUtils.hasText(dashScopeApiKey);
    this.objectMapper = objectMapper;
    this.restClient = restClientBuilder.build();
    this.apiKey = dashScopeApiKey == null ? "" : dashScopeApiKey.trim();
    this.compatibleEndpoint = buildCompatibleEndpoint(dashScopeBaseUrl);
    this.model = StringUtils.hasText(visionModel) ? visionModel.trim() : "qwen-vl-plus";
  }

  public WechatVisionParseResponse parse(WechatVisionParseRequest request) {
    if (request == null || !StringUtils.hasText(request.imageDataUrl())) {
      throw new IllegalArgumentException("微信视觉解析缺少截图");
    }
    if (!modelConfigured) {
      throw new IllegalStateException("微信视觉解析模型未配置");
    }
    String snapshotDigest = digest(request.imageDataUrl());
    try {
      String aiOutput = callCompatibleVision(request);
      log.info("微信视觉解析模型原始返回 snapshotDigest={} model={} output={}",
          snapshotDigest, model, abbreviate(aiOutput));
      WechatVisionParseResponse parsed = parseModelOutput(aiOutput, request, snapshotDigest);
      log.info("微信视觉解析完成 contact={} changed={} messageCount={} conversationType={} accountCategory={} skipAutoReply={} model={}",
          parsed.contact(),
          parsed.changed(),
          parsed.messages().size(),
          parsed.conversationType(),
          parsed.accountCategory(),
          parsed.skipAutoReply(),
          model);
      logParsedMessages(parsed);
      return parsed;
    } catch (IllegalArgumentException | IllegalStateException ex) {
      throw ex;
    } catch (Exception ex) {
      throw new IllegalStateException("微信视觉解析调用失败：" + safeMessage(ex), ex);
    }
  }

  private String callCompatibleVision(WechatVisionParseRequest request) {
    ObjectNode body = objectMapper.createObjectNode();
    body.put("model", model);
    body.put("stream", false);
    body.put("enable_thinking", false);
    ArrayNode messages = body.putArray("messages");
    messages.addObject()
        .put("role", "system")
        .put("content", systemPrompt());
    ObjectNode userMessage = messages.addObject();
    userMessage.put("role", "user");
    ArrayNode content = userMessage.putArray("content");
    content.addObject()
        .put("type", "text")
        .put("text", userPrompt(request));
    content.addObject()
        .put("type", "image_url")
        .putObject("image_url")
        .put("url", request.imageDataUrl());

    log.info("微信视觉解析发起百炼兼容接口请求 endpoint={} model={} imageLength={} sceneHint={}",
        compatibleEndpoint,
        model,
        request.imageDataUrl().length(),
        request.sceneHint());
    long startedAt = System.currentTimeMillis();
    try {
      JsonNode response = restClient.post()
          .uri(compatibleEndpoint)
          .headers(headers -> headers.setBearerAuth(apiKey))
          .contentType(MediaType.APPLICATION_JSON)
          .body(body)
          .retrieve()
          .body(JsonNode.class);
      String contentText = readCompatibleContent(response);
      long elapsedMs = System.currentTimeMillis() - startedAt;
      log.info("微信视觉识别消息调用视觉大模型成功 endpoint={} model={} sceneHint={} elapsedMs={} outputLength={}",
          compatibleEndpoint,
          model,
          request.sceneHint(),
          elapsedMs,
          contentText.length());
      return contentText;
    } catch (RestClientResponseException ex) {
      long elapsedMs = System.currentTimeMillis() - startedAt;
      log.error("微信视觉识别消息调用视觉大模型失败 endpoint={} model={} sceneHint={} elapsedMs={} status={} response={}",
          compatibleEndpoint,
          model,
          request.sceneHint(),
          elapsedMs,
          ex.getRawStatusCode(),
          abbreviate(ex.getResponseBodyAsString()),
          ex);
      throw ex;
    } catch (RuntimeException ex) {
      long elapsedMs = System.currentTimeMillis() - startedAt;
      log.error("微信视觉识别消息调用视觉大模型异常 endpoint={} model={} sceneHint={} elapsedMs={} exType={} msg={}",
          compatibleEndpoint,
          model,
          request.sceneHint(),
          elapsedMs,
          ex.getClass().getName(),
          ex.getMessage(),
          ex);
      throw ex;
    }
  }

  private WechatVisionParseResponse parseModelOutput(
      String aiOutput,
      WechatVisionParseRequest request,
      String snapshotDigest) {
    JsonNode root;
    try {
      root = objectMapper.readTree(stripJsonFence(aiOutput));
    } catch (Exception ex) {
      throw new IllegalArgumentException("微信视觉解析结果不是有效 JSON", ex);
    }
    if (!root.isObject()) {
      throw new IllegalArgumentException("微信视觉解析结果不是有效 JSON");
    }

    String contact = text(root.path("contact"));
    if (!StringUtils.hasText(contact)) {
      contact = StringUtils.hasText(request.windowTitle()) ? request.windowTitle().trim() : "微信";
    }
    String conversationType = normalizeConversationType(text(root.path("conversationType")));
    String accountCategory = normalizeAccountCategory(text(root.path("accountCategory")));
    String skipReason = text(root.path("skipReason")).trim();
    Double confidence = root.path("confidence").isNumber() ? root.path("confidence").asDouble() : null;

    List<WechatVisionMessage> messages = new ArrayList<>();
    JsonNode messageNodes = root.path("messages");
    if (messageNodes.isArray()) {
      int index = 0;
      for (JsonNode node : messageNodes) {
        String content = text(node.path("content")).trim();
        if (!StringUtils.hasText(content)) {
          continue;
        }
        String uiId = text(node.path("uiId"));
        if (!StringUtils.hasText(uiId)) {
          uiId = "vlm-" + snapshotDigest.substring(0, 12) + "-" + index;
        }
        String type = text(node.path("type"));
        messages.add(new WechatVisionMessage(
            content,
            node.path("isSelf").asBoolean(false),
            uiId.trim(),
            StringUtils.hasText(type) ? type.trim() : "text",
            node.path("confidence").isNumber() ? node.path("confidence").asDouble() : null));
        index++;
      }
    }

    boolean changed = root.has("changed")
        ? root.path("changed").asBoolean(true)
        : !snapshotDigest.equals(StringUtils.hasText(request.previousDigest()) ? request.previousDigest().trim() : "");
    ClassificationResult classification = classifyConversation(
        contact,
        accountCategory,
        conversationType,
        skipReason,
        confidence,
        request);
    return new WechatVisionParseResponse(
        contact.trim(),
        List.copyOf(messages),
        snapshotDigest,
        changed,
        classification.conversationType(),
        classification.accountCategory(),
        classification.skipAutoReply(),
        classification.skipReason(),
        classification.confidence());
  }

  private void logParsedMessages(WechatVisionParseResponse parsed) {
    if (parsed == null || parsed.messages() == null || parsed.messages().isEmpty()) {
      log.info("微信视觉解析消息明细为空");
      return;
    }
    for (int i = 0; i < parsed.messages().size(); i++) {
      WechatVisionMessage message = parsed.messages().get(i);
      log.info("微信视觉解析消息明细 index={} contact={} isSelf={} uiId={} type={} confidence={} content={}",
          i,
          parsed.contact(),
          message.isSelf(),
          message.uiId(),
          message.type(),
          message.confidence(),
          abbreviate(message.content()));
    }
  }

  private String readCompatibleContent(JsonNode response) {
    String content = text(response == null ? null : response.path("choices").path(0).path("message").path("content"));
    if (!StringUtils.hasText(content)) {
      throw new IllegalArgumentException("微信视觉解析结果为空");
    }
    return content;
  }

  private String systemPrompt() {
    return """
        你是微信桌面端界面解析助手。
        必须只输出 JSON Object，不要输出 Markdown，不要解释。
        固定输出字段：
        contact、changed、messages、conversationType、accountCategory、skipReason、confidence。
        conversationType 只能是 SINGLE、GROUP、SYSTEM。
        accountCategory 只能是 NORMAL、FILE_HELPER、TENCENT_NEWS、OFFICIAL_ACCOUNT、SERVICE_ACCOUNT、UNKNOWN。
        messages 是数组，每项字段固定为 content、isSelf、uiId、type、confidence。
        如果图片是聊天窗口：
        - 只识别当前打开会话里的可见聊天气泡文本。
        - type 固定输出 text。
        - 右侧绿色或右侧头像消息必须是 isSelf=true。
        - 左侧灰白色或左侧头像消息必须是 isSelf=false。
        - 群聊名称通常会显示成员数量、多个成员头像或群聊标题，请输出 conversationType=GROUP。
        - 单聊请输出 conversationType=SINGLE。
        - 文件传输助手请输出 accountCategory=FILE_HELPER。
        - 腾讯新闻请输出 accountCategory=TENCENT_NEWS。
        - 公众号请输出 accountCategory=OFFICIAL_ACCOUNT。
        - 服务号请输出 accountCategory=SERVICE_ACCOUNT。
        - 正常好友或客户会话请输出 accountCategory=NORMAL。
        - 如果会话本身不适合自动回复，请在 skipReason 写明原因。
        如果图片是左侧会话列表中的单个会话项：
        - 重点识别 contact、conversationType、accountCategory、skipReason、confidence。
        - messages 返回空数组。
        - changed 固定返回 true。
        只输出真实可见内容，忽略搜索框、输入框、菜单、按钮、时间轴和其他系统控件。
        """;
  }

  private String userPrompt(WechatVisionParseRequest request) {
    return "请解析这张微信或企业微信截图。窗口标题：" + defaultString(request.windowTitle())
        + "；驱动方式：" + defaultString(request.driverMode())
        + "；场景：" + defaultString(request.sceneHint())
        + "；上一张截图摘要：" + defaultString(request.previousDigest()) + "。";
  }

  private String stripJsonFence(String text) {
    String value = text == null ? "" : text.trim();
    if (value.startsWith("```")) {
      value = value.replaceFirst("^```(?:json|JSON)?\\s*", "");
      value = value.replaceFirst("\\s*```$", "");
    }
    return value.trim();
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

  private ClassificationResult classifyConversation(
      String contact,
      String rawAccountCategory,
      String rawConversationType,
      String rawSkipReason,
      Double rawConfidence,
      WechatVisionParseRequest request) {
    String normalizedContact = StringUtils.hasText(contact) ? contact.trim() : "";
    String accountCategory = normalizeAccountCategory(rawAccountCategory);
    String conversationType = normalizeConversationType(rawConversationType);
    String skipReason = StringUtils.hasText(rawSkipReason) ? rawSkipReason.trim() : "";
    double confidence = rawConfidence == null ? 0.78D : Math.max(0D, Math.min(1D, rawConfidence));
    String sceneHint = normalizeSceneHint(request == null ? null : request.sceneHint());
    String lowerContact = normalizedContact.toLowerCase(Locale.ROOT);

    if ("文件传输助手".equals(normalizedContact) || lowerContact.contains("file transfer")) {
      return new ClassificationResult(conversationType, "FILE_HELPER", true, "命中文件传输助手固定过滤规则", Math.max(confidence, 0.99D));
    }
    if ("腾讯新闻".equals(normalizedContact) || lowerContact.contains("tencent news")) {
      return new ClassificationResult(conversationType, "TENCENT_NEWS", true, "命中腾讯新闻固定过滤规则", Math.max(confidence, 0.99D));
    }
    if ("OFFICIAL_ACCOUNT".equals(accountCategory)) {
      return new ClassificationResult(conversationType, accountCategory, true, ensureSkipReason(skipReason, "识别为公众号，按固定规则跳过"), Math.max(confidence, 0.9D));
    }
    if ("SERVICE_ACCOUNT".equals(accountCategory)) {
      return new ClassificationResult(conversationType, accountCategory, true, ensureSkipReason(skipReason, "识别为服务号，按固定规则跳过"), Math.max(confidence, 0.9D));
    }
    if ("UNKNOWN".equals(accountCategory) && normalizedContact.contains("公众号")) {
      accountCategory = "OFFICIAL_ACCOUNT";
    } else if ("UNKNOWN".equals(accountCategory) && normalizedContact.contains("服务号")) {
      accountCategory = "SERVICE_ACCOUNT";
    } else if ("UNKNOWN".equals(accountCategory) && SCENE_HINT_CONVERSATION_LIST.equals(sceneHint) && normalizedContact.contains("腾讯")) {
      accountCategory = "TENCENT_NEWS";
    }

    boolean skipAutoReply = "OFFICIAL_ACCOUNT".equals(accountCategory)
        || "SERVICE_ACCOUNT".equals(accountCategory)
        || "FILE_HELPER".equals(accountCategory)
        || "TENCENT_NEWS".equals(accountCategory);
    return new ClassificationResult(
        conversationType,
        accountCategory,
        skipAutoReply,
        skipAutoReply ? ensureSkipReason(skipReason, "命中特殊会话固定过滤规则") : skipReason,
        confidence);
  }

  private String ensureSkipReason(String skipReason, String defaultReason) {
    return StringUtils.hasText(skipReason) ? skipReason.trim() : defaultReason;
  }

  private String normalizeConversationType(String rawValue) {
    String normalized = defaultString(rawValue).toUpperCase(Locale.ROOT);
    if ("GROUP".equals(normalized) || "SYSTEM".equals(normalized)) {
      return normalized;
    }
    return "SINGLE";
  }

  private String normalizeAccountCategory(String rawValue) {
    String normalized = defaultString(rawValue).toUpperCase(Locale.ROOT);
    return switch (normalized) {
      case "NORMAL", "FILE_HELPER", "TENCENT_NEWS", "OFFICIAL_ACCOUNT", "SERVICE_ACCOUNT" -> normalized;
      default -> "UNKNOWN";
    };
  }

  private String normalizeSceneHint(String rawValue) {
    String normalized = defaultString(rawValue).toUpperCase(Locale.ROOT);
    if (SCENE_HINT_CONVERSATION_LIST.equals(normalized)) {
      return SCENE_HINT_CONVERSATION_LIST;
    }
    return SCENE_HINT_CHAT;
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

  private String digest(String value) {
    try {
      MessageDigest messageDigest = MessageDigest.getInstance("SHA-256");
      return HexFormat.of().formatHex(messageDigest.digest(value.getBytes(StandardCharsets.UTF_8)));
    } catch (Exception ex) {
      throw new IllegalStateException("微信截图摘要计算失败", ex);
    }
  }

  private String defaultString(String value) {
    return value == null ? "" : value.trim();
  }

  private String safeMessage(Exception ex) {
    if (ex == null || !StringUtils.hasText(ex.getMessage())) {
      return "未知错误";
    }
    return ex.getMessage();
  }

  private String abbreviate(String text) {
    if (!StringUtils.hasText(text)) {
      return "";
    }
    String value = text.trim();
    return value.length() <= MAX_LOG_RESPONSE_LENGTH ? value : value.substring(0, MAX_LOG_RESPONSE_LENGTH);
  }

  private record ClassificationResult(
      String conversationType,
      String accountCategory,
      boolean skipAutoReply,
      String skipReason,
      Double confidence) {
  }
}
