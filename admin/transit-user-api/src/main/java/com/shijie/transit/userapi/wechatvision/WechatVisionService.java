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
      log.info("微信视觉解析完成 contact={} changed={} messageCount={} model={}",
          parsed.contact(), parsed.changed(), parsed.messages().size(), model);
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

    log.info("微信视觉解析发起百炼兼容接口请求 endpoint={} model={} imageLength={}",
        compatibleEndpoint, model, request.imageDataUrl().length());
    try {
      JsonNode response = restClient.post()
          .uri(compatibleEndpoint)
          .headers(headers -> headers.setBearerAuth(apiKey))
          .contentType(MediaType.APPLICATION_JSON)
          .body(body)
          .retrieve()
          .body(JsonNode.class);
      return readCompatibleContent(response);
    } catch (RestClientResponseException ex) {
      log.error("微信视觉解析百炼兼容接口失败 endpoint={} model={} status={} response={}",
          compatibleEndpoint, model, ex.getRawStatusCode(), abbreviate(ex.getResponseBodyAsString()), ex);
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
    return new WechatVisionParseResponse(contact.trim(), List.copyOf(messages), snapshotDigest, changed);
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
        你是微信聊天窗口视觉解析助手。只从截图中识别当前打开会话的可见聊天消息。
        必须只输出 JSON Object，不要输出 Markdown，不要解释。
        JSON 字段固定为 contact、changed、messages。
        messages 是数组，每项字段固定为 content、isSelf、uiId、type、confidence。
        type 固定输出 text；isSelf 表示消息是否由当前登录微信账号发送。
        判断 isSelf 只能看截图里的气泡水平位置和头像位置，不能按文本语义、说话口吻或上下文猜测。
        微信桌面聊天窗口的固定规则如下，必须严格执行：
        - 右侧气泡、右侧头像、绿色气泡、气泡尖角朝右：当前登录账号自己发送，isSelf=true。
        - 左侧气泡、左侧头像、灰色或白色气泡、气泡尖角朝左：对方发送，isSelf=false。
        - 如果消息在截图右半区且靠右对齐，即使内容像提问，也必须输出 isSelf=true。
        - 如果消息在截图左半区且靠左对齐，即使内容像回答，也必须输出 isSelf=false。
        - 严禁反向标注：右侧绿色消息不能输出 isSelf=false；左侧灰白消息不能输出 isSelf=true。
        输出前必须自检每条消息的左右位置，发现左右规则与 isSelf 冲突时，以左右位置为准修正。
        只输出真实可见的聊天气泡文本，忽略微信菜单、搜索框、输入框、发送按钮、时间戳和系统导航。
        uiId 要在同一张截图内稳定，可使用消息位置或顺序生成。
        """;
  }

  private String userPrompt(WechatVisionParseRequest request) {
    return "请解析这张微信聊天截图。窗口标题：" + defaultString(request.windowTitle())
        + "；驱动方式：" + defaultString(request.driverMode())
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
}
