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
  private static final String SCENE_HINT_CHAT_REPLY_TRIGGER = "CHAT_REPLY_TRIGGER";
  private static final String SCENE_HINT_CONVERSATION_LIST = "CONVERSATION_LIST";
  private static final String SCENE_HINT_MARKETING_MOMENTS = "MARKETING_MOMENTS";

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

  public WechatReplyTriggerResult parseReplyTrigger(WechatVisionParseRequest request) {
    if (request == null || !StringUtils.hasText(request.imageDataUrl())) {
      throw new IllegalArgumentException("微信视觉解析缺少截图");
    }
    if (!modelConfigured) {
      throw new IllegalStateException("微信视觉解析模型未配置");
    }
    try {
      WechatVisionParseRequest triggerRequest = normalizeReplyTriggerRequest(request);
      String aiOutput = callCompatibleVision(triggerRequest);
      log.info("微信轻量自动回复视觉解析模型原始返回 model={} output={}", model, abbreviate(aiOutput));
      WechatReplyTriggerResult parsed = parseReplyTriggerModelOutput(aiOutput, triggerRequest);
      log.info("微信轻量自动回复视觉解析完成 contact={} shouldReply={} conversationType={} accountCategory={} confidence={} skipReason={}",
          parsed.contact(),
          parsed.shouldReply(),
          parsed.conversationType(),
          parsed.accountCategory(),
          parsed.confidence(),
          parsed.skipReason());
      return parsed;
    } catch (IllegalArgumentException | IllegalStateException ex) {
      throw ex;
    } catch (Exception ex) {
      throw new IllegalStateException("微信轻量自动回复视觉解析调用失败：" + safeMessage(ex), ex);
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
        .put("content", systemPrompt(request));
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
        String type = normalizeMessageType(text(node.path("type")));
        String content = text(node.path("content")).trim();
        if (!StringUtils.hasText(content) && "image".equals(type)) {
          content = "[图片]";
        }
        if (!StringUtils.hasText(content) && "sticker".equals(type)) {
          content = "[表情包]";
        }
        if (!StringUtils.hasText(content)) {
          continue;
        }
        if (isIgnoredSystemNotice(content)) {
          log.info("微信视觉解析忽略系统提示 contact={} content={}", contact, content);
          continue;
        }
        String uiId = text(node.path("uiId"));
        if (!StringUtils.hasText(uiId)) {
          uiId = "vlm-" + snapshotDigest.substring(0, 12) + "-" + index;
        }
        messages.add(new WechatVisionMessage(
            content,
            node.path("isSelf").asBoolean(false),
            uiId.trim(),
            type,
            parseBounds(node.path("bounds")),
            node.path("confidence").isNumber() ? node.path("confidence").asDouble() : null));
        index++;
      }
    }
    List<WechatMarketingMoment> moments = parseMarketingMoments(root.path("moments"));

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
        List.copyOf(moments),
        snapshotDigest,
        changed,
        classification.conversationType(),
        classification.accountCategory(),
        classification.skipAutoReply(),
        classification.skipReason(),
        classification.confidence());
  }

  private WechatReplyTriggerResult parseReplyTriggerModelOutput(String aiOutput, WechatVisionParseRequest request) {
    JsonNode root;
    try {
      root = objectMapper.readTree(stripJsonFence(aiOutput));
    } catch (Exception ex) {
      throw new IllegalArgumentException("微信轻量自动回复视觉解析结果不是有效 JSON", ex);
    }
    if (!root.isObject()) {
      throw new IllegalArgumentException("微信轻量自动回复视觉解析结果不是有效 JSON");
    }

    String contact = text(root.path("contact")).trim();
    if (!StringUtils.hasText(contact)) {
      contact = StringUtils.hasText(request.windowTitle()) ? request.windowTitle().trim() : "微信";
    }
    String conversationType = normalizeConversationType(text(root.path("conversationType")));
    String accountCategory = normalizeAccountCategory(text(root.path("accountCategory")));
    String skipReason = text(root.path("skipReason")).trim();
    double confidence = root.path("confidence").isNumber()
        ? Math.max(0D, Math.min(1D, root.path("confidence").asDouble()))
        : 0D;
    ClassificationResult classification = classifyConversation(
        contact,
        accountCategory,
        conversationType,
        skipReason,
        confidence,
        request);
    String latestCustomerMessage = text(root.path("latestCustomerMessage")).trim();
    String imageSummary = text(root.path("imageSummary")).trim();
    boolean shouldReply = root.path("shouldReply").asBoolean(false)
        && !classification.skipAutoReply()
        && confidence >= 0.65D
        && (StringUtils.hasText(latestCustomerMessage) || StringUtils.hasText(imageSummary));
    String finalSkipReason = classification.skipAutoReply()
        ? classification.skipReason()
        : shouldReply
            ? ""
            : ensureSkipReason(skipReason, confidence < 0.65D ? "视觉识别置信度不足，已跳过自动回复" : "未识别到需要回复的最新对方消息");
    return new WechatReplyTriggerResult(
        shouldReply,
        contact,
        latestCustomerMessage,
        imageSummary,
        classification.conversationType(),
        classification.accountCategory(),
        classification.confidence(),
        finalSkipReason);
  }

  private List<WechatMarketingMoment> parseMarketingMoments(JsonNode momentNodes) {
    List<WechatMarketingMoment> moments = new ArrayList<>();
    if (momentNodes == null || !momentNodes.isArray()) {
      return moments;
    }
    for (JsonNode node : momentNodes) {
      String author = text(node.path("author")).trim();
      String content = text(node.path("content")).trim();
      if (!StringUtils.hasText(author) && !StringUtils.hasText(content)) {
        continue;
      }
      moments.add(new WechatMarketingMoment(
          author,
          content,
          text(node.path("timeText")).trim(),
          parseMarketingVisualIndex(node),
          node.path("suitableForLike").isBoolean() ? node.path("suitableForLike").asBoolean() : null,
          node.path("suitableForComment").isBoolean() ? node.path("suitableForComment").asBoolean() : null,
          node.path("alreadyLiked").isBoolean() ? node.path("alreadyLiked").asBoolean() : null,
          normalizeMarketingLikeMenuAction(node.path("likeMenuAction")),
          parseMarketingVerticalRange(node.path("verticalRange")),
          parseBounds(node.has("postBounds") ? node.path("postBounds") : node.path("bounds")),
          parseMarketingPoint(node.path("likePoint")),
          parseMarketingPoint(node.path("commentPoint")),
          node.path("confidence").isNumber() ? node.path("confidence").asDouble() : null));
    }
    return moments;
  }

  private Integer parseMarketingVisualIndex(JsonNode node) {
    JsonNode indexNode = node.path("visualIndex");
    if (!indexNode.isNumber()) {
      indexNode = node.path("index");
    }
    if (!indexNode.isNumber()) {
      indexNode = node.path("order");
    }
    if (!indexNode.isNumber()) {
      return null;
    }
    int index = indexNode.asInt();
    return index >= 0 ? index : null;
  }

  private String normalizeMarketingLikeMenuAction(JsonNode node) {
    String normalized = text(node).trim().toLowerCase(Locale.ROOT);
    if (!StringUtils.hasText(normalized)) {
      return null;
    }
    if ("like".equals(normalized) || "赞".equals(normalized)) {
      return "like";
    }
    if ("unlike".equals(normalized) || "cancel".equals(normalized)
        || "取消".equals(normalized) || "取消赞".equals(normalized)) {
      return "unlike";
    }
    if ("unknown".equals(normalized)) {
      return "unknown";
    }
    return null;
  }

  private WechatMarketingVerticalRange parseMarketingVerticalRange(JsonNode node) {
    if (node == null || node.isMissingNode() || node.isNull()) {
      return null;
    }
    double y = node.has("y") ? node.path("y").asDouble(Double.NaN) : node.path("top").asDouble(Double.NaN);
    double h = node.has("h")
        ? node.path("h").asDouble(Double.NaN)
        : node.has("height")
            ? node.path("height").asDouble(Double.NaN)
            : node.path("bottom").asDouble(Double.NaN) - y;
    if (!Double.isFinite(y) || !Double.isFinite(h) || h <= 0D) {
      return null;
    }
    return new WechatMarketingVerticalRange(y, h);
  }

  private boolean isIgnoredSystemNotice(String content) {
    String normalizedContent = defaultString(content);
    // 微信撤回提示是灰色系统文案，不属于双方聊天气泡，不能进入自动回复消息流。
    return "你撤回了一条消息".equals(normalizedContent);
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

  private WechatVisionParseRequest normalizeReplyTriggerRequest(WechatVisionParseRequest request) {
    return new WechatVisionParseRequest(
        request.imageDataUrl(),
        request.windowTitle(),
        request.previousDigest(),
        request.driverMode(),
        SCENE_HINT_CHAT_REPLY_TRIGGER);
  }

  private String systemPrompt(WechatVisionParseRequest request) {
    if (SCENE_HINT_CHAT_REPLY_TRIGGER.equals(normalizeSceneHint(request == null ? null : request.sceneHint()))) {
      return replyTriggerSystemPrompt();
    }
    return """
        你是微信桌面端界面解析助手。
        必须只输出 JSON Object，不要输出 Markdown，不要解释。
        固定输出字段：
        contact、changed、messages、conversationType、accountCategory、skipReason、confidence。
        conversationType 只能是 SINGLE、GROUP、SYSTEM。
        accountCategory 只能是 NORMAL、FILE_HELPER、TENCENT_NEWS、OFFICIAL_ACCOUNT、SERVICE_ACCOUNT、CUSTOMER_SERVICE、UNKNOWN。
        messages 是数组，每项字段固定为 content、isSelf、uiId、type、bounds、confidence。
        如果图片是聊天窗口：
        - 只输出候选消息：你负责识别可见聊天气泡里的文字、粗略类型和粗略位置，不要推理不可见内容。
        - isSelf 只做粗略左右判断；最终归属和图片可信度会由客户端本地视觉守卫复核。
        - 只识别当前打开会话里的可见聊天气泡。
        - messages 必须严格按聊天气泡在截图中的视觉顺序输出：从上到下，也就是从旧到新。
        - 最底部可见聊天气泡必须是 messages 的最后一项。
        - 文本气泡输出 type=text，必须同时输出 bounds。
        - 对方发送的普通图片输出 type=image，content 固定为 [图片]。
        - 对方发送的静态表情包、动态表情包或 GIF 表情输出 type=sticker，content 固定为 [表情包]。
        - type=text、type=image 或 type=sticker 都必须输出 bounds，bounds 是该聊天气泡在当前截图内的坐标，字段为 x、y、w、h，单位是截图像素，原点是截图左上角。
        - bounds 只包住当前这一条聊天气泡主体，不能包含输入框、聊天列表、头像或其他消息。
        - 不要把头像、空白卡片、输入框、聊天列表缩略图或装饰区域输出为图片消息。
        - 如果文字、图片或归属不确定，请降低 confidence；不要为了补全 JSON 而猜测新消息。
        - 群聊名称通常会显示成员数量、多个成员头像或群聊标题，请输出 conversationType=GROUP。
        - 单聊请输出 conversationType=SINGLE。
        - 文件传输助手请输出 accountCategory=FILE_HELPER。
        - 腾讯新闻请输出 accountCategory=TENCENT_NEWS。
        - 公众号请输出 accountCategory=OFFICIAL_ACCOUNT。
        - 服务号请输出 accountCategory=SERVICE_ACCOUNT。
        - 客服消息、微信客服请输出 accountCategory=CUSTOMER_SERVICE。
        - 正常好友或客户会话请输出 accountCategory=NORMAL。
        - 如果会话本身不适合自动回复，请在 skipReason 写明原因。
        如果图片是左侧会话列表中的单个会话项：
        - 重点识别 contact、conversationType、accountCategory、skipReason、confidence。
        - messages 返回空数组。
        - changed 固定返回 true。
        如果场景是 MARKETING_MOMENTS 或截图是朋友圈：
        - messages 返回空数组，重点输出 moments 数组。
        - moments 每项字段固定为 author、content、timeText、visualIndex、suitableForLike、suitableForComment、alreadyLiked、likeMenuAction、verticalRange、postBounds、likePoint、commentPoint、confidence。
        - 只识别当前截图真实可见的朋友圈动态，不要推测屏幕外动态，不要补全看不清的昵称或内容。
        - timeText 是动态发布时间文本，例如“12小时前”“2天前”；看不清时返回空字符串，不能猜测。
        - visualIndex 必须按当前截图内动态从上到下排序，从 0 开始；suitableForLike 表示这条动态语义上是否适合点赞，suitableForComment 表示这条动态语义上是否适合评论。
        - 普通资讯、文章分享、生活记录、产品动态在没有明显风险时 suitableForComment 返回 true，不要因为内容是新闻标题、长文章标题或行业科普就默认不可评论。
        - 讣告、疾病隐私、灾害事故、争议攻击、投诉维权、明显广告引流、金融借贷、违法违规、成人低俗、政治敏感或内容严重负面时 suitableForComment 返回 false。
        - 朋友圈评论只允许你给候选动态和 suitableForComment，不要给“必须点击”的最终裁决；右侧两个点菜单和评论按钮由客户端本地像素识别确认。
        - alreadyLiked 和 likeMenuAction 是兼容旧版本的可选字段；不要根据未打开菜单推测点赞菜单状态，无法从当前截图确定时返回 null 或 unknown。
        - 点赞入口是动态右侧“..”菜单；最终“赞/取消”由客户端打开菜单后做本地像素判断，大模型只负责候选动态和语义判断。
        - verticalRange 只描述该动态在当前截图内的粗略垂直范围，字段为 y、h；它只用于本地匹配，不是点击坐标。
        - postBounds、likePoint、commentPoint 是兼容旧版本的可选字段；点赞和评论坐标由客户端本地识别“..”菜单，不要为了补全字段而猜测坐标。
        - 如果没有把握、动态不完整、语义不适合点赞、按钮被遮挡或不在朋友圈页面，moments 返回空数组或降低 confidence。
        只输出真实可见内容，忽略搜索框、输入框、菜单、按钮、时间轴和其他系统控件。
        """;
  }

  private String replyTriggerSystemPrompt() {
    return """
        你是微信桌面端轻量自动回复触发识别助手。
        必须只输出 JSON Object，不要输出 Markdown，不要解释。
        固定输出字段：
        shouldReply、contact、latestCustomerMessage、imageSummary、conversationType、accountCategory、confidence、skipReason。
        conversationType 只能是 SINGLE、GROUP、SYSTEM。
        accountCategory 只能是 NORMAL、FILE_HELPER、TENCENT_NEWS、OFFICIAL_ACCOUNT、SERVICE_ACCOUNT、CUSTOMER_SERVICE、UNKNOWN。
        你只判断是否需要回复最新一组连续对方消息，不解析完整聊天记录，不输出 messages，不输出 bounds，不输出点击坐标。
        判断规则：
        - 只看当前打开的微信聊天窗口，忽略左侧会话列表、搜索框、输入框、菜单、按钮和时间轴。
        - 微信桌面端个人聊天里，通常左侧灰色气泡是对方消息，右侧绿色气泡是己方消息；判断最新消息时必须优先使用气泡左右位置和颜色。
        - 必须从聊天区底部向上查找：最靠近输入框上方的对方聊天气泡才是最新对方消息；如果它下面还有对方气泡，不能选择上方较旧消息。
        - 如果最新对方气泡上方紧挨着同一发送者的多条对方气泡，且中间没有己方气泡、系统提示或明显时间分隔，则把这组连续气泡按从上到下用换行合并到 latestCustomerMessage。例如最新连续气泡是“在吗”和“周末不聊工作”时，latestCustomerMessage 必须是“在吗\n周末不聊工作”。
        - 如果“在吗”上方或下方隔着己方绿色气泡，而最底部对方气泡是“周末不聊工作”，latestCustomerMessage 必须只输出“周末不聊工作”，不能输出较旧的“在吗”。
        - 典型场景：左侧灰色“在吗” -> 右侧绿色己方回复 -> 左侧灰色“周末不聊工作”，latestCustomerMessage 必须是“周末不聊工作”，不能是“在吗”，也不能把两条合并。
        - 只有这组最新对方消息明确来自对方，且内容适合自动回复时，shouldReply 才能返回 true。
        - 如果聊天区底部最新气泡是己方消息、系统提示、历史消息上移、输入框内容、公众号/服务号/文件传输助手/腾讯新闻/客服消息，shouldReply 返回 false，并在 skipReason 写中文原因。
        - 如果最新对方消息组是文字，latestCustomerMessage 输出真实可见文字；多条连续文字用换行连接；imageSummary 输出空字符串。
        - 如果最新对方消息组包含图片或表情包，latestCustomerMessage 可输出“[图片]”或“[表情包]”，imageSummary 用中文概括图片或表情包真实可见内容；看不清时 shouldReply 返回 false。
        - 不要推测屏幕外内容，不要补全看不清的文字，不要为了回复而猜测客户意图。
        - confidence 表示对“最新一组连续对方消息可自动回复”判断的置信度，低于 0.65 时应返回 shouldReply=false。
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
    if ("客服消息".equals(normalizedContact) || "微信客服".equals(normalizedContact)
        || lowerContact.contains("customer service")) {
      return new ClassificationResult(conversationType, "CUSTOMER_SERVICE", true, "命中客服消息固定过滤规则", Math.max(confidence, 0.99D));
    }
    if ("OFFICIAL_ACCOUNT".equals(accountCategory)) {
      return new ClassificationResult(conversationType, accountCategory, true, ensureSkipReason(skipReason, "识别为公众号，按固定规则跳过"), Math.max(confidence, 0.9D));
    }
    if ("SERVICE_ACCOUNT".equals(accountCategory)) {
      return new ClassificationResult(conversationType, accountCategory, true, ensureSkipReason(skipReason, "识别为服务号，按固定规则跳过"), Math.max(confidence, 0.9D));
    }
    if ("CUSTOMER_SERVICE".equals(accountCategory)) {
      return new ClassificationResult(conversationType, accountCategory, true, ensureSkipReason(skipReason, "命中客服消息固定过滤规则"), Math.max(confidence, 0.9D));
    }
    if ("UNKNOWN".equals(accountCategory) && normalizedContact.contains("公众号")) {
      accountCategory = "OFFICIAL_ACCOUNT";
    } else if ("UNKNOWN".equals(accountCategory) && normalizedContact.contains("服务号")) {
      accountCategory = "SERVICE_ACCOUNT";
    } else if ("UNKNOWN".equals(accountCategory) && normalizedContact.contains("客服消息")) {
      accountCategory = "CUSTOMER_SERVICE";
    } else if ("UNKNOWN".equals(accountCategory) && SCENE_HINT_CONVERSATION_LIST.equals(sceneHint) && normalizedContact.contains("腾讯")) {
      accountCategory = "TENCENT_NEWS";
    }

    boolean skipAutoReply = "OFFICIAL_ACCOUNT".equals(accountCategory)
        || "SERVICE_ACCOUNT".equals(accountCategory)
        || "FILE_HELPER".equals(accountCategory)
        || "TENCENT_NEWS".equals(accountCategory)
        || "CUSTOMER_SERVICE".equals(accountCategory);
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
      case "NORMAL", "FILE_HELPER", "TENCENT_NEWS", "OFFICIAL_ACCOUNT", "SERVICE_ACCOUNT", "CUSTOMER_SERVICE" -> normalized;
      default -> "UNKNOWN";
    };
  }

  private String normalizeMessageType(String rawValue) {
    String normalized = defaultString(rawValue).toLowerCase(Locale.ROOT);
    if ("image".equals(normalized) || "sticker".equals(normalized)) {
      return normalized;
    }
    return "text";
  }

  private WechatVisionBounds parseBounds(JsonNode node) {
    if (node == null || !node.isObject()) {
      return null;
    }
    double x = readDouble(node.path("x"));
    double y = readDouble(node.path("y"));
    double w = readDouble(node.has("w") ? node.path("w") : node.path("width"));
    double h = readDouble(node.has("h") ? node.path("h") : node.path("height"));
    if (!Double.isFinite(x) || !Double.isFinite(y) || !Double.isFinite(w) || !Double.isFinite(h) || w <= 0D || h <= 0D) {
      return null;
    }
    return new WechatVisionBounds(x, y, w, h);
  }

  private WechatMarketingPoint parseMarketingPoint(JsonNode node) {
    if (node == null || !node.isObject()) {
      return null;
    }
    double x = readDouble(node.path("x"));
    double y = readDouble(node.path("y"));
    if (!Double.isFinite(x) || !Double.isFinite(y)) {
      return null;
    }
    return new WechatMarketingPoint(x, y);
  }

  private double readDouble(JsonNode node) {
    return node != null && node.isNumber() ? node.asDouble() : Double.NaN;
  }

  private String normalizeSceneHint(String rawValue) {
    String normalized = defaultString(rawValue).toUpperCase(Locale.ROOT);
    if (SCENE_HINT_CHAT_REPLY_TRIGGER.equals(normalized)) {
      return SCENE_HINT_CHAT_REPLY_TRIGGER;
    }
    if (SCENE_HINT_CONVERSATION_LIST.equals(normalized)) {
      return SCENE_HINT_CONVERSATION_LIST;
    }
    if (SCENE_HINT_MARKETING_MOMENTS.equals(normalized)) {
      return SCENE_HINT_MARKETING_MOMENTS;
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
