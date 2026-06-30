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
import com.shijie.transit.userapi.mapper.CrmCustomerMapper;
import com.shijie.transit.userapi.mapper.SessionMessageHistoryMapper;
import com.shijie.transit.userapi.mapper.SessionMessageHistoryMapper.MessageItem;
import com.shijie.transit.userapi.mapper.UserIntentMapper;
import com.shijie.transit.userapi.vo.SmartSalesVo.AiProfile;
import com.shijie.transit.userapi.vo.SmartSalesVo.BasicInfoSuggestion;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
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
 * 用户画像 AI 补充服务。
 * <p>
 * 设计要点：
 * <ul>
 *   <li>复用现有 user_intent(意向) + session_message_history(会话) 作为数据源，不重复造分析引擎。</li>
 *   <li>按需触发：打开客户画像详情或主动刷新时，若距今超过 {@link #CACHE_HOURS} 才调用 DashScope 模型，
 *       避免全量定时扫描导致 Token 成本失控。</li>
 *   <li>防幻觉：Prompt 强约束"只基于提供的会话内容总结，未涉及的信息返回空"，输出存 JSON 支持人工覆盖。</li>
 *   <li>直调 DashScope 兼容接口，不依赖 Dify 工作流。</li>
 * </ul>
 */
@Service
public class UserProfileAIService {
  private static final Logger log = LoggerFactory.getLogger(UserProfileAIService.class);
  /** AI 画像缓存时长：6 小时。 */
  private static final Duration CACHE_HOURS = Duration.ofHours(6);
  /** 拉取最近会话条数，用于 AI 总结。 */
  private static final int RECENT_MESSAGE_LIMIT = 30;
  private static final String DEFAULT_COMPATIBLE_BASE_URL = "https://dashscope.aliyuncs.com";

  private final boolean modelConfigured;
  private final CrmCustomerMapper customerMapper;
  private final UserIntentMapper userIntentMapper;
  private final SessionMessageHistoryMapper sessionMessageHistoryMapper;
  private final ObjectMapper objectMapper;
  private final Clock clock;
  private final RestClient restClient;
  private final SalesTextSafetyService safetyService;
  private final String apiKey;
  private final String compatibleEndpoint;
  private final String model;

  public UserProfileAIService(
      CrmCustomerMapper customerMapper,
      UserIntentMapper userIntentMapper,
      SessionMessageHistoryMapper sessionMessageHistoryMapper,
      ObjectMapper objectMapper,
      Clock clock,
      SalesTextSafetyService safetyService,
      RestClient.Builder restClientBuilder,
      @Value("${spring.ai.dashscope.api-key:}") String dashScopeApiKey,
      @Value("${spring.ai.dashscope.chat.base-url:${spring.ai.dashscope.base-url:https://dashscope.aliyuncs.com}}") String dashScopeBaseUrl,
      @Value("${transit.ai.profile.model:qwen-plus}") String profileModel) {
    this.customerMapper = customerMapper;
    this.userIntentMapper = userIntentMapper;
    this.sessionMessageHistoryMapper = sessionMessageHistoryMapper;
    this.objectMapper = objectMapper;
    this.clock = clock;
    this.safetyService = safetyService;
    this.apiKey = dashScopeApiKey == null ? "" : dashScopeApiKey.trim();
    this.compatibleEndpoint = buildCompatibleEndpoint(dashScopeBaseUrl);
    this.model = StringUtils.hasText(profileModel) ? profileModel.trim() : "qwen-plus";
    this.modelConfigured = StringUtils.hasText(this.apiKey);
    this.restClient = restClientBuilder.build();
  }

  /**
   * 刷新指定客户的 AI 画像。
   *
   * @param force true 表示忽略缓存强制刷新
   * @return 最新的 AI 画像；若模型未配置或无会话数据则返回 null
   */
  public AiProfile refreshProfile(Long ownerUserId, String contactKey, boolean force) {
    if (!StringUtils.hasText(contactKey)) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "contactKey 不能为空");
    }
    if (!modelConfigured) {
      log.warn("DashScope API Key 未配置，跳过AI画像刷新 userId={} contactKey={}",
          ownerUserId, contactKey);
      return null;
    }
    Long tenantId = TenantContext.getTenantId();

    CrmCustomerEntity customer = findCustomer(tenantId, ownerUserId, contactKey.trim());
    if (!force && customer != null && isCacheFresh(customer)) {
      log.info("AI画像缓存未过期，直接返回 userId={} contactKey={}", ownerUserId, contactKey);
      return parseAiProfile(customer);
    }

    // 拉取最近会话作为 AI 输入
    List<MessageItem> messages = loadRecentMessages(tenantId, ownerUserId, contactKey.trim());
    if (messages.isEmpty()) {
      log.info("无会话记录，跳过AI画像刷新 userId={} contactKey={}", ownerUserId, contactKey);
      return customer == null ? null : parseAiProfile(customer);
    }

    UserIntentEntity intent = getIntent(tenantId, ownerUserId, contactKey.trim());
    ProfileGenerationResult generationResult;
    try {
      generationResult = callDashScope(ownerUserId, contactKey.trim(), messages, intent, customer);
    } catch (Exception ex) {
      log.error("AI画像模型调用失败 tenantId={} userId={} contactKey={}",
          tenantId, ownerUserId, contactKey, ex);
      // 调用失败时返回历史画像(若有)，避免用户看到空白
      return customer == null ? null : parseAiProfile(customer);
    }
    if (generationResult == null || generationResult.aiProfile() == null) {
      return customer == null ? null : parseAiProfile(customer);
    }

    // 确保客户档案存在后写入 AI 画像 JSON
    if (customer == null) {
      customer = new CrmCustomerEntity();
      customer.setTenantId(tenantId);
      customer.setOwnerUserId(ownerUserId);
      customer.setContactKey(contactKey.trim());
      customer.setRemarkName(null);
      customer.setPhone("");
      customer.setGender("UNKNOWN");
      customer.setSource("UNKNOWN");
      customer.setStage("LEAD");
      customer.setStarred(0);
      customerMapper.insert(customer);
      log.info("AI画像刷新触发自动建档 tenantId={} userId={} contactKey={} customerId={}",
          tenantId, ownerUserId, contactKey, customer.getId());
    }
    writeGenerationResult(customer, generationResult);
    return generationResult.aiProfile();
  }

  // ===================== DashScope 调用 =====================

  private ProfileGenerationResult callDashScope(
      Long ownerUserId,
      String contactKey,
      List<MessageItem> messages,
      UserIntentEntity intent,
      CrmCustomerEntity customer) {
    String conversationText = buildConversationText(messages);
    String intentContext = buildIntentContext(intent);
    String oldProfileContext = buildOldProfileContext(customer);

    ObjectNode request = objectMapper.createObjectNode();
    request.put("model", model);
    request.put("stream", false);
    request.put("enable_thinking", false);
    ArrayNode messagesNode = request.putArray("messages");
    messagesNode.addObject()
        .put("role", "system")
        .put("content", profileSystemPrompt());
    messagesNode.addObject()
        .put("role", "user")
        .put("content", "【已有AI沟通辅助画像】\n" + oldProfileContext
            + "\n\n【已有意向分析】\n" + intentContext
            + "\n\n【最近会话记录】\n" + conversationText);

    log.info("AI画像模型请求发起 endpoint={} model={} userId={} contactKey={}",
        compatibleEndpoint, model, ownerUserId, contactKey);
    try {
      JsonNode response = restClient.post()
          .uri(compatibleEndpoint)
          .headers(headers -> headers.setBearerAuth(apiKey))
          .contentType(MediaType.APPLICATION_JSON)
          .body(request)
          .retrieve()
          .body(JsonNode.class);
      String content = readCompatibleContent(response);
      log.info("AI画像模型返回成功 model={} contentLength={}", model, content.length());
      return parseWorkflowOutput(content);
    } catch (RestClientResponseException ex) {
      log.error("AI画像模型兼容接口失败 endpoint={} model={} status={} response={}",
          compatibleEndpoint, model, ex.getRawStatusCode(), abbreviate(ex.getResponseBodyAsString(), 500), ex);
      throw ex;
    }
  }

  // ===================== 输出解析 =====================

  ProfileGenerationResult parseWorkflowOutput(String raw) {
    JsonNode node;
    try {
      // 模型输出可能是 JSON 字符串，也可能被包了一层代码块
      node = objectMapper.readTree(stripJsonFence(raw));
    } catch (Exception ex) {
      log.warn("AI画像模型返回非JSON，跳过写入可展示画像");
      return null;
    }
    JsonNode outputs = node.path("data").path("outputs");
    if (outputs.isMissingNode() || outputs.isNull()) {
      outputs = node.path("outputs");
    }
    if (!outputs.isMissingNode() && !outputs.isNull()) {
      node = outputs;
    }
    JsonNode profileNode = node.path("aiProfile");
    if (profileNode.isMissingNode() || profileNode.isNull()) {
      profileNode = node.path("ai_profile");
    }
    if (profileNode.isMissingNode() || profileNode.isNull()) {
      profileNode = node;
    }
    AiProfile aiProfile = fromNode(profileNode);
    BasicInfoSuggestion suggestion = fromSuggestionNode(firstNode(node, "basicInfoSuggestion", "basic_info_suggestion"));
    return aiProfile == null && suggestion == null ? null : new ProfileGenerationResult(aiProfile, suggestion);
  }

  private JsonNode firstNode(JsonNode node, String... fields) {
    for (String field : fields) {
      JsonNode value = node.path(field);
      if (!value.isMissingNode() && !value.isNull()) {
        return value;
      }
    }
    return objectMapper.nullNode();
  }

  private AiProfile fromNode(JsonNode node) {
    // 兼容历史三字段画像，避免老客户打开详情后画像丢失。
    if (node.hasNonNull("communicationFocus") || node.hasNonNull("communication_focus")
        || node.hasNonNull("suggestedNextAction") || node.hasNonNull("suggested_next_action")
        || node.hasNonNull("interestTags") || node.hasNonNull("interest_tags")) {
      String focus = safeProfileText(readText(node, "communicationFocus", "communication_focus"));
      String action = safeProfileText(readText(node, "suggestedNextAction", "suggested_next_action"));
      List<String> rawTags = readStringList(node, "interestTags", "interest_tags");
      List<String> tags = rawTags == null ? List.of() : rawTags.stream()
          .map(this::safeProfileText)
          .filter(StringUtils::hasText)
          .limit(6)
          .toList();
      if (!StringUtils.hasText(focus) && !StringUtils.hasText(action) && tags.isEmpty()) {
        return null;
      }
      return new AiProfile(focus, null, tags, List.of(), action, null, LocalDateTime.now(clock));
    }
    String communicationStyle = safeProfileText(readText(node, "communicationStyle", "communication_style"));
    String relationshipContext = safeProfileText(readText(node, "relationshipContext", "relationship_context"));
    List<String> preferenceHints = safeProfileList(readStringList(node, "preferenceHints", "preference_hints"));
    List<String> riskWarnings = safeProfileList(readStringList(node, "riskWarnings", "risk_warnings"));
    String nextConversationTips = safeProfileText(readText(node, "nextConversationTips", "next_conversation_tips"));
    String profileNote = safeProfileText(readText(node, "profileNote", "profile_note"));
    if (!StringUtils.hasText(communicationStyle)
        && !StringUtils.hasText(relationshipContext)
        && preferenceHints.isEmpty()
        && riskWarnings.isEmpty()
        && !StringUtils.hasText(nextConversationTips)
        && !StringUtils.hasText(profileNote)) {
      return null;
    }
    return new AiProfile(
        communicationStyle,
        relationshipContext,
        preferenceHints,
        riskWarnings,
        nextConversationTips,
        profileNote,
        LocalDateTime.now(clock));
  }

  private List<String> safeProfileList(List<String> rawTags) {
    if (rawTags == null) {
      return List.of();
    }
    return rawTags.stream()
        .map(this::safeProfileText)
        .filter(StringUtils::hasText)
        .limit(6)
        .toList();
  }

  private BasicInfoSuggestion fromSuggestionNode(JsonNode node) {
    if (node == null || node.isMissingNode() || node.isNull()) {
      return null;
    }
    String remarkName = safeBasicInfoText(readText(node, "remarkName", "remark_name", "name"));
    String phone = safeBasicInfoText(readText(node, "phone"));
    String gender = normalizeGender(readText(node, "gender"));
    String source = normalizeSource(readText(node, "source"));
    String remark = safeBasicInfoText(readText(node, "remark"));
    String evidence = safeBasicInfoText(readText(node, "evidence"));
    Integer confidence = readInteger(node, "confidence");
    if (!StringUtils.hasText(remarkName)
        && !StringUtils.hasText(phone)
        && !StringUtils.hasText(gender)
        && !StringUtils.hasText(source)
        && !StringUtils.hasText(remark)) {
      return null;
    }
    return new BasicInfoSuggestion(
        remarkName,
        phone,
        StringUtils.hasText(gender) ? gender : "UNKNOWN",
        StringUtils.hasText(source) ? source : "UNKNOWN",
        remark,
        evidence,
        confidence,
        LocalDateTime.now(clock));
  }

  private String safeProfileText(String text) {
    SalesTextSafetyService.SafetyResult result = safetyService.checkProfileText(text);
    return result.safe() ? result.safeText() : null;
  }

  private String safeBasicInfoText(String text) {
    if (!StringUtils.hasText(text)) {
      return null;
    }
    String value = text.trim();
    return value.length() > 120 ? value.substring(0, 120) : value;
  }

  private void writeGenerationResult(CrmCustomerEntity customer, ProfileGenerationResult result) {
    try {
      ObjectNode payload = objectMapper.createObjectNode();
      writeAiProfilePayload(payload, result.aiProfile());
      customer.setAiProfileJson(objectMapper.writeValueAsString(payload));
      LocalDateTime now = LocalDateTime.now(clock);
      customer.setAiProfileUpdatedAt(now);
      if (result.basicInfoSuggestion() != null) {
        customer.setBasicInfoSuggestionJson(objectMapper.writeValueAsString(toSuggestionPayload(result.basicInfoSuggestion())));
        customer.setBasicInfoSuggestionUpdatedAt(now);
      }
      customerMapper.updateById(customer);
      log.info("AI画像写入成功 customerId={} contactKey={}", customer.getId(), customer.getContactKey());
    } catch (Exception ex) {
      log.error("AI画像序列化写入失败 customerId={}", customer.getId(), ex);
      throw new TransitException(ErrorCode.INTERNAL_ERROR, "AI画像保存失败");
    }
  }

  private void writeAiProfilePayload(ObjectNode payload, AiProfile aiProfile) {
    payload.put("communicationStyle", aiProfile.communicationStyle());
    payload.put("relationshipContext", aiProfile.relationshipContext());
    ArrayNode preferenceHintsNode = payload.putArray("preferenceHints");
    if (aiProfile.preferenceHints() != null) {
      aiProfile.preferenceHints().forEach(preferenceHintsNode::add);
    }
    ArrayNode riskWarningsNode = payload.putArray("riskWarnings");
    if (aiProfile.riskWarnings() != null) {
      aiProfile.riskWarnings().forEach(riskWarningsNode::add);
    }
    payload.put("nextConversationTips", aiProfile.nextConversationTips());
    payload.put("profileNote", aiProfile.profileNote());
  }

  private ObjectNode toSuggestionPayload(BasicInfoSuggestion suggestion) {
    ObjectNode payload = objectMapper.createObjectNode();
    payload.put("remarkName", suggestion.remarkName());
    payload.put("phone", suggestion.phone());
    payload.put("gender", suggestion.gender());
    payload.put("source", suggestion.source());
    payload.put("remark", suggestion.remark());
    payload.put("evidence", suggestion.evidence());
    if (suggestion.confidence() != null) {
      payload.put("confidence", suggestion.confidence());
    }
    return payload;
  }

  // ===================== 数据加载辅助 =====================

  private boolean isCacheFresh(CrmCustomerEntity customer) {
    if (customer.getAiProfileUpdatedAt() == null || !StringUtils.hasText(customer.getAiProfileJson())) {
      return false;
    }
    return customer.getAiProfileUpdatedAt().plus(CACHE_HOURS)
        .isAfter(LocalDateTime.now(clock));
  }

  private AiProfile parseAiProfile(CrmCustomerEntity customer) {
    if (!StringUtils.hasText(customer.getAiProfileJson())) {
      return null;
    }
    try {
      JsonNode node = objectMapper.readTree(customer.getAiProfileJson());
      AiProfile parsed = fromNode(node);
      if (parsed == null) {
        return null;
      }
      return new AiProfile(
          parsed.communicationStyle(),
          parsed.relationshipContext(),
          parsed.preferenceHints(),
          parsed.riskWarnings(),
          parsed.nextConversationTips(),
          parsed.profileNote(),
          customer.getAiProfileUpdatedAt());
    } catch (Exception ex) {
      log.warn("解析AI画像JSON失败，忽略 customerId={}", customer.getId(), ex);
      return null;
    }
  }

  private CrmCustomerEntity findCustomer(Long tenantId, Long ownerUserId, String contactKey) {
    return customerMapper.selectOne(new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<CrmCustomerEntity>()
        .eq(CrmCustomerEntity::getTenantId, tenantId)
        .eq(CrmCustomerEntity::getOwnerUserId, ownerUserId)
        .eq(CrmCustomerEntity::getContactKey, contactKey)
        .last("limit 1"));
  }

  private UserIntentEntity getIntent(Long tenantId, Long ownerUserId, String contactKey) {
    return userIntentMapper.selectOne(new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<UserIntentEntity>()
        .eq(UserIntentEntity::getTenantId, tenantId)
        .eq(UserIntentEntity::getOwnerUserId, ownerUserId)
        .eq(UserIntentEntity::getContactKey, contactKey)
        .last("limit 1"));
  }

  private List<MessageItem> loadRecentMessages(Long tenantId, Long ownerUserId, String contactKey) {
    // 取最近 N 条会话(含双方)，用于 AI 总结。先取最大 msgId 锚点。
    Long maxMsgId = sessionMessageHistoryMapper.findRecentConversationMessages(
        tenantId, ownerUserId, contactKey, Long.MAX_VALUE, 1)
        .stream().findFirst().map(MessageItem::getId).orElse(null);
    if (maxMsgId == null) {
      return Collections.emptyList();
    }
    List<MessageItem> items = sessionMessageHistoryMapper.findRecentConversationMessages(
        tenantId, ownerUserId, contactKey, maxMsgId, RECENT_MESSAGE_LIMIT);
    // 查询为倒序，反转为时间正序更利于模型理解
    Collections.reverse(items);
    return items;
  }

  private String buildConversationText(List<MessageItem> messages) {
    StringBuilder sb = new StringBuilder();
    for (MessageItem item : messages) {
      String role = "USER".equalsIgnoreCase(item.getSenderType()) ? "客户" : "我方";
      String time = item.getSentAt() == null ? "" : item.getSentAt().toString();
      String content = item.getMessageContent() == null ? "" : item.getMessageContent();
      if (sb.length() > 0) {
        sb.append("\n");
      }
      sb.append("[").append(time).append("] ").append(role).append("：").append(content);
    }
    return sb.toString();
  }

  private String buildIntentContext(UserIntentEntity intent) {
    if (intent == null) {
      return "暂无已有意向分析数据。";
    }
    return "当前意向等级：" + toIntentText(intent.getIntentLevel())
        + "；需求强度：" + safe(intent.getDemandLevel())
        + "；预算：" + safe(intent.getBudgetLevel())
        + "；时间紧迫度：" + safe(intent.getTimeLevel())
        + "；预算描述：" + safe(intent.getBudgetDesc())
        + "；购买时间：" + safe(intent.getTimeDesc())
        + "；核心痛点：" + safe(intent.getPainPoints())
        + "；提及竞品：" + safe(intent.getCompetitors())
        + "；最近事件：" + safe(intent.getLatestEvent())
        + "；已有总结：" + safe(intent.getDailySummary());
  }

  private String buildOldProfileContext(CrmCustomerEntity customer) {
    if (customer == null || !StringUtils.hasText(customer.getAiProfileJson())) {
      return "暂无历史沟通辅助画像。";
    }
    AiProfile oldProfile = parseAiProfile(customer);
    if (oldProfile == null) {
      return "暂无可解析的历史沟通辅助画像。";
    }
    return "沟通风格：" + safe(oldProfile.communicationStyle())
        + "；关系背景：" + safe(oldProfile.relationshipContext())
        + "；偏好线索：" + String.join("、", oldProfile.preferenceHints() == null ? List.of() : oldProfile.preferenceHints())
        + "；风险提醒：" + String.join("、", oldProfile.riskWarnings() == null ? List.of() : oldProfile.riskWarnings())
        + "；下次沟通提示：" + safe(oldProfile.nextConversationTips())
        + "；画像备注：" + safe(oldProfile.profileNote());
  }

  // ===================== Prompt =====================

  private String profileSystemPrompt() {
    return """
        你是销售助理。请基于提供的会话内容和已有意向分析，总结该客户的画像。
        输出必须是 JSON，字段固定为：
        - aiProfile：沟通辅助画像对象
          - communicationStyle：沟通风格（不超过100字）
          - relationshipContext：关系背景（不超过100字）
          - preferenceHints：偏好线索（字符串数组，不超过5个，每个不超过20字）
          - riskWarnings：风险提醒（字符串数组，不超过5个，每个不超过30字）
          - nextConversationTips：下次沟通提示（不超过100字）
          - profileNote：人工可编辑画像备注（不超过100字）
        - basicInfoSuggestion：基础资料草稿对象
          - remarkName、phone、gender、source、remark、evidence、confidence

        严格规则：
        1) user_intent 已维护需求、预算、周期、痛点、竞品、最近事件，aiProfile 不要重复这些销售事实。
        2) aiProfile 只写沟通风格、关系背景、偏好、风险提醒、下次沟通提示和综合备注。
        3) 按“老画像 + 新聊天 = 新画像”增量更新：老画像仍有效则保留，新聊天明确推翻时才修正。
        4) 基础资料只能作为 basicInfoSuggestion 草稿返回，禁止直接假定已确认。
        5) 只使用对话中明确出现的信息；未涉及字段返回空字符串或空数组。
        6) gender 仅可输出 UNKNOWN、MALE、FEMALE、OTHER；source 仅可输出 UNKNOWN、GROUP、SCAN、REFERRAL、IMPORT。
        7) 只输出 JSON，不要任何解释、不要代码块。""";
  }

  // ===================== 通用工具方法 =====================

  private String readCompatibleContent(JsonNode response) {
    JsonNode contentNode = response == null
        ? null
        : response.path("choices").path(0).path("message").path("content");
    String content = contentNode == null || contentNode.isNull() ? "" : contentNode.asText("");
    if (!StringUtils.hasText(content)) {
      throw new IllegalStateException("AI画像模型返回内容为空");
    }
    return content.trim();
  }

  private String toIntentText(Integer intentLevel) {
    if (intentLevel == null) {
      return "未知";
    }
    return switch (intentLevel) {
      case 3 -> "高";
      case 2 -> "中";
      case 1 -> "低";
      default -> "未知";
    };
  }

  private String safe(String value) {
    return StringUtils.hasText(value) ? value : "未知";
  }

  private String readText(JsonNode node, String... fields) {
    for (String field : fields) {
      JsonNode value = node.path(field);
      if (!value.isMissingNode() && !value.isNull()) {
        String text = value.asText(null);
        if (StringUtils.hasText(text)) {
          return text.trim();
        }
      }
    }
    return null;
  }

  private Integer readInteger(JsonNode node, String field) {
    JsonNode value = node.path(field);
    if (value.isInt()) {
      return value.asInt();
    }
    if (value.isTextual() && StringUtils.hasText(value.asText())) {
      try {
        return Integer.parseInt(value.asText().trim());
      } catch (NumberFormatException ex) {
        return null;
      }
    }
    return null;
  }

  private String normalizeGender(String value) {
    if (!StringUtils.hasText(value)) {
      return null;
    }
    String normalized = value.trim().toUpperCase();
    return SmartSalesConstants.VALID_GENDERS.contains(normalized) ? normalized : "UNKNOWN";
  }

  private String normalizeSource(String value) {
    if (!StringUtils.hasText(value)) {
      return null;
    }
    String normalized = value.trim().toUpperCase();
    return SmartSalesConstants.VALID_SOURCES.contains(normalized) ? normalized : "UNKNOWN";
  }

  private List<String> readStringList(JsonNode node, String... fields) {
    for (String field : fields) {
      JsonNode value = node.path(field);
      if (value.isArray() && !value.isEmpty()) {
        List<String> result = new ArrayList<>();
        for (JsonNode item : value) {
          if (item != null && !item.isNull()) {
            String text = item.asText("");
            if (!text.isBlank()) {
              result.add(text.trim());
            }
          }
        }
        return result;
      }
    }
    return null;
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

  record ProfileGenerationResult(AiProfile aiProfile, BasicInfoSuggestion basicInfoSuggestion) {
  }
}
