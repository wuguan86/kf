package com.shijie.transit.userapi.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.shijie.transit.common.db.entity.CrmCustomerEntity;
import com.shijie.transit.common.db.entity.CrmCustomerTagEntity;
import com.shijie.transit.common.db.entity.CrmCustomerTagRelEntity;
import com.shijie.transit.common.db.entity.CrmFollowUpRecordEntity;
import com.shijie.transit.common.db.entity.UserIntentEntity;
import com.shijie.transit.common.tenant.TenantContext;
import com.shijie.transit.common.web.ErrorCode;
import com.shijie.transit.common.web.TransitException;
import com.shijie.transit.userapi.dto.SmartSalesDto;
import com.shijie.transit.userapi.mapper.CrmCustomerMapper;
import com.shijie.transit.userapi.mapper.CrmCustomerTagMapper;
import com.shijie.transit.userapi.mapper.CrmCustomerTagRelMapper;
import com.shijie.transit.userapi.mapper.CrmFollowUpRecordMapper;
import com.shijie.transit.userapi.mapper.SessionMessageHistoryMapper;
import com.shijie.transit.userapi.mapper.UserIntentDailySnapshotMapper;
import com.shijie.transit.userapi.mapper.UserIntentMapper;
import com.shijie.transit.userapi.mapper.CrmCustomerTagRelMapper.CustomerTagProjection;
import com.shijie.transit.userapi.vo.SmartSalesVo;
import com.shijie.transit.userapi.vo.SmartSalesVo.AiProfile;
import com.shijie.transit.userapi.vo.SmartSalesVo.CustomerListItem;
import com.shijie.transit.userapi.vo.SmartSalesVo.CustomerListResponse;
import com.shijie.transit.userapi.vo.SmartSalesVo.CustomerProfile;
import com.shijie.transit.userapi.vo.SmartSalesVo.DashboardView;
import com.shijie.transit.userapi.vo.SmartSalesVo.FollowUpView;
import com.shijie.transit.userapi.vo.SmartSalesVo.PendingFollowUpView;
import com.shijie.transit.userapi.vo.SmartSalesVo.StageCountView;
import com.shijie.transit.userapi.vo.SmartSalesVo.TagView;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

/**
 * 智能销售核心服务：客户档案 / 标签 / 跟进记录 / 商机阶段 / 工作台。
 * <p>
 * 设计要点：
 * <ul>
 *   <li>客户档案以 (tenant_id, owner_user_id, contact_key) 唯一定位，与 user_intent 逻辑关联。</li>
 *   <li>客户列表以 user_intent 为主表左联 crm_customer，保证未建档的意向客户也能展示。</li>
 *   <li>所有写操作都做归属人校验，防止跨用户越权访问。</li>
 * </ul>
 */
@Service
public class SmartSalesService {
  private static final Logger log = LoggerFactory.getLogger(SmartSalesService.class);

  /** 商机阶段定义及中文标签(顺序即漏斗顺序)。 */
  public static final List<String> STAGE_ORDER =
      List.of("LEAD", "FOLLOWING", "INTENDED", "WON", "LOST");
  private static final Map<String, String> STAGE_LABELS = Map.of(
      "LEAD", "线索",
      "FOLLOWING", "跟进中",
      "INTENDED", "明确意向",
      "WON", "已成交",
      "LOST", "已流失");
  private static final Set<String> VALID_SOURCES = Set.of(
      "GROUP", "SCAN", "REFERRAL", "IMPORT", "UNKNOWN");
  private static final Set<String> VALID_FOLLOW_UP_TYPES = Set.of(
      "PHONE", "WECHAT", "MEETING", "NOTE");
  private static final int PENDING_FOLLOW_UP_LIMIT = 20;
  private static final int FOLLOW_UP_TIMELINE_LIMIT = 50;
  private static final int FOLLOW_UP_CONVERSATION_LIMIT = 20;
  private static final String DEFAULT_COMPATIBLE_BASE_URL = "https://dashscope.aliyuncs.com";

  private final CrmCustomerMapper customerMapper;
  private final CrmCustomerTagMapper tagMapper;
  private final CrmCustomerTagRelMapper tagRelMapper;
  private final CrmFollowUpRecordMapper followUpMapper;
  private final UserIntentMapper userIntentMapper;
  private final UserIntentDailySnapshotMapper userIntentDailySnapshotMapper;
  private final SessionMessageHistoryMapper sessionMessageHistoryMapper;
  private final ObjectMapper objectMapper;
  private final Clock clock;
  private final boolean followUpModelConfigured;
  private final RestClient restClient;
  private final String dashScopeApiKey;
  private final String dashScopeEndpoint;
  private final String followUpModel;

  public SmartSalesService(
      CrmCustomerMapper customerMapper,
      CrmCustomerTagMapper tagMapper,
      CrmCustomerTagRelMapper tagRelMapper,
      CrmFollowUpRecordMapper followUpMapper,
      UserIntentMapper userIntentMapper,
      UserIntentDailySnapshotMapper userIntentDailySnapshotMapper,
      SessionMessageHistoryMapper sessionMessageHistoryMapper,
      ObjectMapper objectMapper,
      Clock clock,
      RestClient.Builder restClientBuilder,
      @Value("${spring.ai.dashscope.api-key:}") String dashScopeApiKey,
      @Value("${spring.ai.dashscope.chat.base-url:${spring.ai.dashscope.base-url:https://dashscope.aliyuncs.com}}") String dashScopeBaseUrl,
      @Value("${transit.ai.follow-up.model:qwen-plus}") String followUpModel) {
    this.customerMapper = customerMapper;
    this.tagMapper = tagMapper;
    this.tagRelMapper = tagRelMapper;
    this.followUpMapper = followUpMapper;
    this.userIntentMapper = userIntentMapper;
    this.userIntentDailySnapshotMapper = userIntentDailySnapshotMapper;
    this.sessionMessageHistoryMapper = sessionMessageHistoryMapper;
    this.objectMapper = objectMapper;
    this.clock = clock;
    this.dashScopeApiKey = dashScopeApiKey == null ? "" : dashScopeApiKey.trim();
    this.dashScopeEndpoint = buildCompatibleEndpoint(dashScopeBaseUrl);
    this.followUpModel = StringUtils.hasText(followUpModel) ? followUpModel.trim() : "qwen-plus";
    this.followUpModelConfigured = StringUtils.hasText(this.dashScopeApiKey);
    this.restClient = restClientBuilder.build();
  }

  // ===================== 客户列表 =====================

  public CustomerListResponse listCustomers(
      Long ownerUserId,
      long pageNo,
      long pageSize,
      Integer intentLevel,
      String stage,
      Boolean starred,
      String keyword) {
    Long tenantId = TenantContext.getTenantId();
    long normalizedPageNo = Math.max(pageNo, 1);
    long normalizedPageSize = Math.max(1, Math.min(pageSize, 200));
    long offset = (normalizedPageNo - 1) * normalizedPageSize;
    String normalizedKeyword = StringUtils.hasText(keyword) ? keyword.trim() : null;
    validateIntentLevel(intentLevel);
    validateStage(stage);

    Long total = customerMapper.countCustomers(
        tenantId, ownerUserId, intentLevel, stage, starred, normalizedKeyword);
    if (total == null || total == 0) {
      return new CustomerListResponse(0L, List.of());
    }
    List<CrmCustomerMapper.CustomerListItem> rawItems = customerMapper.listCustomers(
        tenantId, ownerUserId, intentLevel, stage, starred, normalizedKeyword,
        offset, normalizedPageSize);

    // 批量回填标签：仅对已建档(customerId != null)的客户查询标签关联。
    List<Long> customerIds = rawItems.stream()
        .map(CrmCustomerMapper.CustomerListItem::getCustomerId)
        .filter(java.util.Objects::nonNull)
        .distinct()
        .toList();
    Map<Long, List<TagView>> tagMap = batchLoadTags(tenantId, customerIds);

    List<CustomerListItem> list = rawItems.stream()
        .map(item -> new CustomerListItem(
            item.getContactKey(),
            item.getCustomerName(),
            item.getIntentLevel(),
            toIntentLabel(item.getIntentLevel()),
            item.getTotalScore(),
            item.getDailySummary(),
            item.getDemandLevel(),
            item.getBudgetLevel(),
            item.getTimeLevel(),
            item.getLatestEvent(),
            item.getCustomerId(),
            item.getPhone(),
            item.getSource(),
            item.getStage(),
            item.getStarred(),
            item.getNextFollowUpAt(),
            item.getLastChatTime(),
            item.getCustomerId() == null
                ? List.of()
                : tagMap.getOrDefault(item.getCustomerId(), List.of())))
        .toList();
    log.info("查询智能销售客户列表 tenantId={} userId={} total={} returned={}",
        tenantId, ownerUserId, total, list.size());
    return new CustomerListResponse(total, list);
  }

  // ===================== 客户档案 =====================

  /** 新建或更新客户档案(contactKey 定位，存在则更新)。 */
  @Transactional
  public CustomerProfile saveCustomer(Long ownerUserId, SmartSalesDto.SaveCustomerRequest req) {
    if (req == null || !StringUtils.hasText(req.contactKey())) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "contactKey 不能为空");
    }
    validateStage(req.stage());
    validateSource(req.source());
    Long tenantId = TenantContext.getTenantId();
    String contactKey = req.contactKey().trim();

    CrmCustomerEntity existing = findCustomerByContactKey(tenantId, ownerUserId, contactKey);
    CrmCustomerEntity entity = existing != null ? existing : new CrmCustomerEntity();
    if (existing == null) {
      entity.setTenantId(tenantId);
      entity.setOwnerUserId(ownerUserId);
      entity.setContactKey(contactKey);
      entity.setStarred(req.starred() == null ? 0 : (req.starred() == 1 ? 1 : 0));
      entity.setStage(StringUtils.hasText(req.stage()) ? req.stage() : "LEAD");
      entity.setSource(StringUtils.hasText(req.source()) ? req.source() : "UNKNOWN");
    }
    if (req.remarkName() != null) {
      entity.setRemarkName(req.remarkName());
    }
    if (req.phone() != null) {
      entity.setPhone(req.phone());
    }
    if (StringUtils.hasText(req.source())) {
      entity.setSource(req.source());
    }
    if (StringUtils.hasText(req.stage())) {
      entity.setStage(req.stage());
    }
    entity.setAssignedRoleId(req.assignedRoleId());
    entity.setRemark(req.remark());
    entity.setNextFollowUpAt(req.nextFollowUpAt());
    if (req.starred() != null) {
      entity.setStarred(req.starred() == 1 ? 1 : 0);
    }

    if (existing == null) {
      customerMapper.insert(entity);
      log.info("新建客户档案 tenantId={} userId={} contactKey={} customerId={}",
          tenantId, ownerUserId, contactKey, entity.getId());
    } else {
      customerMapper.updateById(entity);
      log.info("更新客户档案 tenantId={} userId={} contactKey={} customerId={}",
          tenantId, ownerUserId, contactKey, entity.getId());
    }
    return getProfile(ownerUserId, contactKey);
  }

  /** 流转商机阶段。 */
  @Transactional
  public CustomerProfile updateStage(Long ownerUserId, String contactKey, String stage) {
    if (!StringUtils.hasText(contactKey)) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "contactKey 不能为空");
    }
    validateStage(stage);
    Long tenantId = TenantContext.getTenantId();
    CrmCustomerEntity entity = findCustomerByContactKey(tenantId, ownerUserId, contactKey.trim());
    if (entity == null) {
      // 尚未建档时，流转阶段自动建档，降低用户操作门槛。
      entity = new CrmCustomerEntity();
      entity.setTenantId(tenantId);
      entity.setOwnerUserId(ownerUserId);
      entity.setContactKey(contactKey.trim());
      entity.setRemarkName("");
      entity.setPhone("");
      entity.setSource("UNKNOWN");
      entity.setStarred(0);
      entity.setStage(stage);
      customerMapper.insert(entity);
      log.info("阶段流转触发自动建档 tenantId={} userId={} contactKey={} stage={}",
          tenantId, ownerUserId, contactKey, stage);
    } else {
      entity.setStage(stage);
      customerMapper.updateById(entity);
      log.info("阶段流转 tenantId={} userId={} contactKey={} stage={}",
          tenantId, ownerUserId, contactKey, stage);
    }
    return getProfile(ownerUserId, contactKey);
  }

  /** 切换星标。 */
  @Transactional
  public CustomerProfile updateStarred(Long ownerUserId, String contactKey, Integer starred) {
    if (!StringUtils.hasText(contactKey)) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "contactKey 不能为空");
    }
    int normalizedStarred = starred != null && starred == 1 ? 1 : 0;
    Long tenantId = TenantContext.getTenantId();
    CrmCustomerEntity entity = findCustomerByContactKey(tenantId, ownerUserId, contactKey.trim());
    if (entity == null) {
      entity = new CrmCustomerEntity();
      entity.setTenantId(tenantId);
      entity.setOwnerUserId(ownerUserId);
      entity.setContactKey(contactKey.trim());
      entity.setRemarkName("");
      entity.setPhone("");
      entity.setSource("UNKNOWN");
      entity.setStage("LEAD");
      entity.setStarred(normalizedStarred);
      customerMapper.insert(entity);
    } else {
      entity.setStarred(normalizedStarred);
      customerMapper.updateById(entity);
    }
    return getProfile(ownerUserId, contactKey);
  }

  // ===================== 客户画像详情 =====================

  /** 聚合客户画像：基础信息 + 意向 + 标签 + 跟进时间线 + AI 画像。 */
  public CustomerProfile getProfile(Long ownerUserId, String contactKey) {
    if (!StringUtils.hasText(contactKey)) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "contactKey 不能为空");
    }
    Long tenantId = TenantContext.getTenantId();
    String normalizedKey = contactKey.trim();

    UserIntentEntity intent = getIntent(tenantId, ownerUserId, normalizedKey);
    CrmCustomerEntity customer = findCustomerByContactKey(tenantId, ownerUserId, normalizedKey);

    if (intent == null && customer == null) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "客户不存在或暂无沟通记录");
    }

    List<TagView> tags = customer == null
        ? List.of()
        : loadTagsOfCustomer(tenantId, customer.getId());
    List<FollowUpView> followUps = customer == null
        ? List.of()
        : loadFollowUps(tenantId, customer.getId());
    AiProfile aiProfile = customer == null ? null : parseAiProfile(customer);

    String customerName = resolveCustomerName(intent, customer, normalizedKey);
    Integer intentLevel = intent == null ? null : intent.getIntentLevel();
    LocalDateTime lastChatTime = findLastChatTime(tenantId, ownerUserId, normalizedKey);

    return new CustomerProfile(
        normalizedKey,
        customerName,
        intentLevel,
        toIntentLabel(intentLevel),
        intent == null ? null : intent.getTotalScore(),
        intent == null ? null : intent.getDemandLevel(),
        intent == null ? null : intent.getBudgetLevel(),
        intent == null ? null : intent.getTimeLevel(),
        intent == null ? null : intent.getLatestEvent(),
        intent == null ? null : intent.getAiReason(),
        intent == null ? null : intent.getDailySummary(),
        customer == null ? null : customer.getId(),
        customer == null ? null : customer.getRemarkName(),
        customer == null ? null : customer.getPhone(),
        customer == null ? null : customer.getSource(),
        customer == null ? null : customer.getStage(),
        customer == null ? null : customer.getStarred(),
        customer == null ? null : customer.getNextFollowUpAt(),
        lastChatTime,
        tags,
        followUps,
        aiProfile);
  }

  // ===================== 标签 =====================

  /** 列出当前用户的所有标签(含预设与自定义)，预设标签(owner_user_id=0)对所有用户可见。 */
  public List<TagView> listTags(Long ownerUserId) {
    Long tenantId = TenantContext.getTenantId();
    LambdaQueryWrapper<CrmCustomerTagEntity> query = new LambdaQueryWrapper<CrmCustomerTagEntity>()
        .and(w -> w
            .eq(CrmCustomerTagEntity::getOwnerUserId, ownerUserId)
            .or()
            .eq(CrmCustomerTagEntity::getCategory, "PRESET"))
        .orderByAsc(CrmCustomerTagEntity::getCategory)
        .orderByAsc(CrmCustomerTagEntity::getId);
    List<CrmCustomerTagEntity> entities = tagMapper.selectList(query);
    return entities.stream()
        .map(e -> new TagView(e.getId(), e.getName(), e.getColor(), e.getCategory()))
        .toList();
  }

  /** 新建自定义标签(同用户下名称不可重复)。 */
  @Transactional
  public TagView createTag(Long ownerUserId, SmartSalesDto.CreateTagRequest req) {
    if (req == null || !StringUtils.hasText(req.name())) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "标签名称不能为空");
    }
    Long tenantId = TenantContext.getTenantId();
    String name = req.name().trim();
    Long existCount = tagMapper.selectCount(new LambdaQueryWrapper<CrmCustomerTagEntity>()
        .eq(CrmCustomerTagEntity::getTenantId, tenantId)
        .eq(CrmCustomerTagEntity::getOwnerUserId, ownerUserId)
        .eq(CrmCustomerTagEntity::getName, name));
    if (existCount != null && existCount > 0) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "标签名称已存在");
    }
    CrmCustomerTagEntity entity = new CrmCustomerTagEntity();
    entity.setTenantId(tenantId);
    entity.setOwnerUserId(ownerUserId);
    entity.setName(name);
    entity.setColor(StringUtils.hasText(req.color()) ? req.color().trim() : "#5B8FF9");
    entity.setCategory("CUSTOM");
    tagMapper.insert(entity);
    log.info("新建标签 tenantId={} userId={} tagId={} name={}",
        tenantId, ownerUserId, entity.getId(), name);
    return new TagView(entity.getId(), entity.getName(), entity.getColor(), entity.getCategory());
  }

  /** 批量给客户打标/取消。 */
  @Transactional
  public List<TagView> updateCustomerTags(
      Long ownerUserId, String contactKey, SmartSalesDto.UpdateCustomerTagsRequest req) {
    if (!StringUtils.hasText(contactKey)) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "contactKey 不能为空");
    }
    Long tenantId = TenantContext.getTenantId();
    // 确保客户已建档(打标必须依赖 crm_customer.id)。
    CrmCustomerEntity customer = ensureCustomerExists(tenantId, ownerUserId, contactKey.trim());

    List<Long> addIds = req == null || req.addTagIds() == null ? List.of() : req.addTagIds();
    List<Long> removeIds = req == null || req.removeTagIds() == null ? List.of() : req.removeTagIds();

    if (!addIds.isEmpty()) {
      // 先查已存在的关联，避免重复插入违反唯一索引。
      Set<Long> existing = new HashSet<>(tagRelMapper.findTagIdsByCustomer(tenantId, customer.getId()));
      for (Long tagId : addIds) {
        if (tagId == null || existing.contains(tagId)) {
          continue;
        }
        validateTagOwnership(tenantId, ownerUserId, tagId);
        CrmCustomerTagRelEntity rel = new CrmCustomerTagRelEntity();
        rel.setTenantId(tenantId);
        rel.setCustomerId(customer.getId());
        rel.setTagId(tagId);
        tagRelMapper.insert(rel);
      }
    }
    if (!removeIds.isEmpty()) {
      for (Long tagId : removeIds) {
        if (tagId == null) {
          continue;
        }
        tagRelMapper.delete(new LambdaQueryWrapper<CrmCustomerTagRelEntity>()
            .eq(CrmCustomerTagRelEntity::getTenantId, tenantId)
            .eq(CrmCustomerTagRelEntity::getCustomerId, customer.getId())
            .eq(CrmCustomerTagRelEntity::getTagId, tagId));
      }
    }
    return loadTagsOfCustomer(tenantId, customer.getId());
  }

  // ===================== 跟进记录 =====================

  /** 新增跟进记录。 */
  @Transactional
  public FollowUpView createFollowUp(
      Long ownerUserId, String contactKey, SmartSalesDto.CreateFollowUpRequest req) {
    if (req == null || !StringUtils.hasText(req.content())) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "跟进内容不能为空");
    }
    if (StringUtils.hasText(req.followUpType()) && !VALID_FOLLOW_UP_TYPES.contains(req.followUpType())) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "跟进类型不合法");
    }
    Long tenantId = TenantContext.getTenantId();
    CrmCustomerEntity customer = ensureCustomerExists(tenantId, ownerUserId, contactKey.trim());

    CrmFollowUpRecordEntity entity = new CrmFollowUpRecordEntity();
    entity.setTenantId(tenantId);
    entity.setOwnerUserId(ownerUserId);
    entity.setCustomerId(customer.getId());
    entity.setContent(req.content().trim());
    entity.setFollowUpType(StringUtils.hasText(req.followUpType()) ? req.followUpType() : "WECHAT");
    entity.setNextFollowUpAt(req.nextFollowUpAt());
    entity.setAiSuggested(req.aiSuggested() != null && req.aiSuggested() == 1 ? 1 : 0);
    followUpMapper.insert(entity);

    // 同步更新客户档案的下次跟进时间，便于工作台待跟进提醒。
    if (req.nextFollowUpAt() != null) {
      customer.setNextFollowUpAt(req.nextFollowUpAt());
      customerMapper.updateById(customer);
    }
    log.info("新增跟进记录 tenantId={} userId={} contactKey={} followUpId={}",
        tenantId, ownerUserId, contactKey, entity.getId());
    return new FollowUpView(
        entity.getId(),
        entity.getContent(),
        entity.getFollowUpType(),
        entity.getAiSuggested(),
        entity.getNextFollowUpAt(),
        entity.getCreatedAt());
  }

  // ===================== 工作台 =====================

  /** 删除跟进记录(校验归属人，防止越权删除)。 */
  @Transactional
  public void deleteFollowUp(Long ownerUserId, String contactKey, Long followUpId) {
    if (!StringUtils.hasText(contactKey) || followUpId == null) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "参数不合法");
    }
    Long tenantId = TenantContext.getTenantId();
    CrmCustomerEntity customer = findCustomerByContactKey(tenantId, ownerUserId, contactKey.trim());
    if (customer == null) {
      return;
    }
    followUpMapper.delete(new LambdaQueryWrapper<CrmFollowUpRecordEntity>()
        .eq(CrmFollowUpRecordEntity::getTenantId, tenantId)
        .eq(CrmFollowUpRecordEntity::getOwnerUserId, ownerUserId)
        .eq(CrmFollowUpRecordEntity::getCustomerId, customer.getId())
        .eq(CrmFollowUpRecordEntity::getId, followUpId));
  }

  // ===================== AI 跟进建议 =====================

  /**
   * 基于客户画像与近期会话，AI 生成跟进建议话术。
   *
   * @return 跟进建议（含建议内容和分析理由）
   */
  public SmartSalesVo.FollowUpSuggestion suggestFollowUp(Long ownerUserId, String contactKey) {
    if (!StringUtils.hasText(contactKey)) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "contactKey 不能为空");
    }
    if (!followUpModelConfigured) {
      throw new TransitException(ErrorCode.INTERNAL_ERROR, "AI 跟进建议模型未配置（缺少 DashScope API Key）");
    }
    Long tenantId = TenantContext.getTenantId();
    String trimmedKey = contactKey.trim();

    // 加载客户上下文
    UserIntentEntity intent = getIntent(tenantId, ownerUserId, trimmedKey);
    CrmCustomerEntity customer = findCustomerByContactKey(tenantId, ownerUserId, trimmedKey);

    // 拉取最近会话
    Long maxMsgId = sessionMessageHistoryMapper.findRecentConversationMessages(
        tenantId, ownerUserId, trimmedKey, Long.MAX_VALUE, 1)
        .stream().findFirst().map(SessionMessageHistoryMapper.MessageItem::getId).orElse(null);
    List<SessionMessageHistoryMapper.MessageItem> messages = maxMsgId == null
        ? Collections.emptyList()
        : sessionMessageHistoryMapper.findRecentConversationMessages(
            tenantId, ownerUserId, trimmedKey, maxMsgId, FOLLOW_UP_CONVERSATION_LIMIT);
    Collections.reverse(messages);

    // 构建 DashScope 请求
    ObjectNode request = objectMapper.createObjectNode();
    request.put("model", followUpModel);
    request.put("stream", false);
    request.put("enable_thinking", false);
    ArrayNode messagesNode = request.putArray("messages");
    messagesNode.addObject()
        .put("role", "system")
        .put("content", followUpSystemPrompt());
    messagesNode.addObject()
        .put("role", "user")
        .put("content", buildFollowUpUserPrompt(intent, customer, messages));

    log.info("AI跟进建议模型请求发起 endpoint={} model={} userId={} contactKey={}",
        dashScopeEndpoint, followUpModel, ownerUserId, trimmedKey);
    try {
      JsonNode response = restClient.post()
          .uri(dashScopeEndpoint)
          .headers(headers -> headers.setBearerAuth(dashScopeApiKey))
          .contentType(MediaType.APPLICATION_JSON)
          .body(request)
          .retrieve()
          .body(JsonNode.class);
      String content = readCompatibleContent(response);
      log.info("AI跟进建议模型返回成功 model={} contentLength={}", followUpModel, content.length());
      return parseFollowUpSuggestion(content);
    } catch (RestClientResponseException ex) {
      log.error("AI跟进建议模型调用失败 endpoint={} model={} status={} response={}",
          dashScopeEndpoint, followUpModel, ex.getRawStatusCode(),
          abbreviate(ex.getResponseBodyAsString(), 500), ex);
      throw new TransitException(ErrorCode.INTERNAL_ERROR, "AI 跟进建议生成失败");
    }
  }

  // ===================== 工作台 =====================

  public DashboardView getDashboard(Long ownerUserId) {
    Long tenantId = TenantContext.getTenantId();

    List<CrmCustomerMapper.StageCount> rawStageCounts =
        customerMapper.countByStage(tenantId, ownerUserId);
    Map<String, Integer> stageCountMap = new HashMap<>();
    if (rawStageCounts != null) {
      for (CrmCustomerMapper.StageCount sc : rawStageCounts) {
        if (sc.getStage() != null) {
          stageCountMap.put(sc.getStage(), sc.getCnt() == null ? 0 : sc.getCnt());
        }
      }
    }
    List<StageCountView> funnel = STAGE_ORDER.stream()
        .map(stage -> new StageCountView(
            stage,
            STAGE_LABELS.getOrDefault(stage, stage),
            stageCountMap.getOrDefault(stage, 0)))
        .toList();

    Integer starredCount = toInt(customerMapper.selectCount(new LambdaQueryWrapper<CrmCustomerEntity>()
        .eq(CrmCustomerEntity::getTenantId, tenantId)
        .eq(CrmCustomerEntity::getOwnerUserId, ownerUserId)
        .eq(CrmCustomerEntity::getStarred, 1)));

    // 高意向但未建档(漏斗里没出现)的客户数：意向为3但无 crm_customer 记录。
    Integer highIntentTotal = toInt(userIntentMapper.selectCount(
        new LambdaQueryWrapper<UserIntentEntity>()
            .eq(UserIntentEntity::getTenantId, tenantId)
            .eq(UserIntentEntity::getOwnerUserId, ownerUserId)
            .eq(UserIntentEntity::getIntentLevel, 3)));
    int stagedTotal = stageCountMap.values().stream().mapToInt(Integer::intValue).sum();
    int highIntentWithoutStage = Math.max(0, highIntentTotal - stagedTotal);

    LocalDateTime now = LocalDateTime.now(clock);
    List<CrmCustomerMapper.PendingFollowUpItem> pending =
        customerMapper.listPendingFollowUps(tenantId, ownerUserId, now, PENDING_FOLLOW_UP_LIMIT);
    List<PendingFollowUpView> pendingViews = pending.stream()
        .map(p -> new PendingFollowUpView(
            p.getContactKey(),
            p.getCustomerName(),
            p.getIntentLevel(),
            toIntentLabel(p.getIntentLevel()),
            p.getNextFollowUpAt()))
        .toList();

    Integer todayPendingTotal = toInt(customerMapper.selectCount(
        new LambdaQueryWrapper<CrmCustomerEntity>()
            .eq(CrmCustomerEntity::getTenantId, tenantId)
            .eq(CrmCustomerEntity::getOwnerUserId, ownerUserId)
            .le(CrmCustomerEntity::getNextFollowUpAt, now)
            .isNotNull(CrmCustomerEntity::getNextFollowUpAt)));

    return new DashboardView(funnel, starredCount, highIntentWithoutStage, pendingViews, todayPendingTotal);
  }

  // ===================== AI 画像写入(供 UserProfileAIService 调用) =====================

  /**
   * 写入 AI 画像 JSON。由 UserProfileAIService 在刷新后调用。
   */
  @Transactional
  public void updateAiProfile(Long ownerUserId, String contactKey, AiProfile aiProfile) {
    Long tenantId = TenantContext.getTenantId();
    CrmCustomerEntity entity = ensureCustomerExists(tenantId, ownerUserId, contactKey);
    try {
      // 只序列化 communicationFocus/interestTags/suggestedNextAction，updatedAt 单独存。
      Map<String, Object> payload = new LinkedHashMap<>();
      payload.put("communicationFocus", aiProfile.communicationFocus());
      payload.put("interestTags", aiProfile.interestTags());
      payload.put("suggestedNextAction", aiProfile.suggestedNextAction());
      entity.setAiProfileJson(objectMapper.writeValueAsString(payload));
      entity.setAiProfileUpdatedAt(LocalDateTime.now(clock));
      customerMapper.updateById(entity);
    } catch (Exception ex) {
      log.error("写入AI画像失败 tenantId={} userId={} contactKey={}",
          tenantId, ownerUserId, contactKey, ex);
      throw new TransitException(ErrorCode.INTERNAL_ERROR, "AI画像保存失败");
    }
  }

  // ===================== 私有辅助 =====================

  private CrmCustomerEntity findCustomerByContactKey(
      Long tenantId, Long ownerUserId, String contactKey) {
    return customerMapper.selectOne(new LambdaQueryWrapper<CrmCustomerEntity>()
        .eq(CrmCustomerEntity::getTenantId, tenantId)
        .eq(CrmCustomerEntity::getOwnerUserId, ownerUserId)
        .eq(CrmCustomerEntity::getContactKey, contactKey)
        .last("limit 1"));
  }

  private CrmCustomerEntity ensureCustomerExists(Long tenantId, Long ownerUserId, String contactKey) {
    CrmCustomerEntity existing = findCustomerByContactKey(tenantId, ownerUserId, contactKey);
    if (existing != null) {
      return existing;
    }
    CrmCustomerEntity entity = new CrmCustomerEntity();
    entity.setTenantId(tenantId);
    entity.setOwnerUserId(ownerUserId);
    entity.setContactKey(contactKey);
    entity.setRemarkName("");
    entity.setPhone("");
    entity.setSource("UNKNOWN");
    entity.setStage("LEAD");
    entity.setStarred(0);
    customerMapper.insert(entity);
    log.info("自动建档 tenantId={} userId={} contactKey={} customerId={}",
        tenantId, ownerUserId, contactKey, entity.getId());
    return entity;
  }

  private UserIntentEntity getIntent(Long tenantId, Long ownerUserId, String contactKey) {
    return userIntentMapper.selectOne(new LambdaQueryWrapper<UserIntentEntity>()
        .eq(UserIntentEntity::getTenantId, tenantId)
        .eq(UserIntentEntity::getOwnerUserId, ownerUserId)
        .eq(UserIntentEntity::getContactKey, contactKey)
        .last("limit 1"));
  }

  private LocalDateTime findLastChatTime(Long tenantId, Long ownerUserId, String contactKey) {
    return userIntentDailySnapshotMapper.findLatestChatTime(tenantId, ownerUserId, contactKey);
  }

  private List<TagView> loadTagsOfCustomer(Long tenantId, Long customerId) {
    Map<Long, List<TagView>> map = batchLoadTags(tenantId, List.of(customerId));
    return map.getOrDefault(customerId, List.of());
  }

  private Map<Long, List<TagView>> batchLoadTags(Long tenantId, List<Long> customerIds) {
    if (customerIds.isEmpty()) {
      return Collections.emptyMap();
    }
    List<CustomerTagProjection> projections = tagRelMapper.findTagsByCustomers(tenantId, customerIds);
    Map<Long, List<TagView>> result = new HashMap<>();
    for (CustomerTagProjection p : projections) {
      if (p.getCustomerId() == null || p.getTagId() == null) {
        continue;
      }
      TagView view = new TagView(p.getTagId(), p.getTagName(), p.getTagColor(), p.getTagCategory());
      result.computeIfAbsent(p.getCustomerId(), k -> new ArrayList<>()).add(view);
    }
    return result;
  }

  private List<FollowUpView> loadFollowUps(Long tenantId, Long customerId) {
    List<CrmFollowUpRecordEntity> entities = followUpMapper.selectList(
        new LambdaQueryWrapper<CrmFollowUpRecordEntity>()
            .eq(CrmFollowUpRecordEntity::getTenantId, tenantId)
            .eq(CrmFollowUpRecordEntity::getCustomerId, customerId)
            .orderByDesc(CrmFollowUpRecordEntity::getCreatedAt)
            .last("limit " + FOLLOW_UP_TIMELINE_LIMIT));
    return entities.stream()
        .map(e -> new FollowUpView(
            e.getId(),
            e.getContent(),
            e.getFollowUpType(),
            e.getAiSuggested(),
            e.getNextFollowUpAt(),
            e.getCreatedAt()))
        .toList();
  }

  private AiProfile parseAiProfile(CrmCustomerEntity customer) {
    if (!StringUtils.hasText(customer.getAiProfileJson())) {
      return null;
    }
    try {
      Map<String, Object> payload = objectMapper.readValue(
          customer.getAiProfileJson(), new TypeReference<Map<String, Object>>() {});
      String focus = asString(payload.get("communicationFocus"));
      List<String> interestTags = asStringList(payload.get("interestTags"));
      String action = asString(payload.get("suggestedNextAction"));
      if (!StringUtils.hasText(focus) && !StringUtils.hasText(action)
          && (interestTags == null || interestTags.isEmpty())) {
        return null;
      }
      return new AiProfile(focus, interestTags, action, customer.getAiProfileUpdatedAt());
    } catch (Exception ex) {
      log.warn("解析AI画像JSON失败，忽略 customer={} json={}",
          customer.getId(), customer.getAiProfileJson(), ex);
      return null;
    }
  }

  private void validateTagOwnership(Long tenantId, Long ownerUserId, Long tagId) {
    // 自定义标签必须归属当前用户；预设标签(category=PRESET)所有用户共享。
    CrmCustomerTagEntity tag = tagMapper.selectById(tagId);
    if (tag == null || !tenantId.equals(tag.getTenantId())) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "标签不存在");
    }
    boolean isPreset = "PRESET".equals(tag.getCategory());
    boolean ownedByUser = ownerUserId.equals(tag.getOwnerUserId());
    if (!isPreset && !ownedByUser) {
      throw new TransitException(ErrorCode.FORBIDDEN, "无权使用该标签");
    }
  }

  private void validateIntentLevel(Integer intentLevel) {
    if (intentLevel == null) {
      return;
    }
    if (intentLevel != 1 && intentLevel != 2 && intentLevel != 3) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "意向度参数不合法");
    }
  }

  private void validateStage(String stage) {
    if (!StringUtils.hasText(stage)) {
      return;
    }
    if (!STAGE_ORDER.contains(stage)) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "商机阶段不合法");
    }
  }

  private void validateSource(String source) {
    if (!StringUtils.hasText(source)) {
      return;
    }
    if (!VALID_SOURCES.contains(source)) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "客户来源不合法");
    }
  }

  private String resolveCustomerName(UserIntentEntity intent, CrmCustomerEntity customer, String contactKey) {
    if (customer != null && StringUtils.hasText(customer.getRemarkName())) {
      return customer.getRemarkName();
    }
    return contactKey;
  }

  private String toIntentLabel(Integer intentLevel) {
    if (intentLevel == null) {
      return "未知";
    }
    return switch (intentLevel) {
      case 3 -> "高意向";
      case 2 -> "中意向";
      case 1 -> "低意向";
      default -> "未知";
    };
  }

  private int toInt(Long value) {
    return value == null ? 0 : value.intValue();
  }

  private String asString(Object value) {
    if (value == null) {
      return null;
    }
    String text = String.valueOf(value).trim();
    return text.isEmpty() || "null".equals(text) ? null : text;
  }

  @SuppressWarnings("unchecked")
  private List<String> asStringList(Object value) {
    if (value instanceof List<?> list) {
      return list.stream()
          .filter(java.util.Objects::nonNull)
          .map(String::valueOf)
          .filter(s -> !s.isBlank())
          .collect(Collectors.toList());
    }
    return List.of();
  }

  // ===================== AI 跟进建议辅助 =====================

  private String followUpSystemPrompt() {
    return """
        你是销售跟进助手。请基于客户画像和最近沟通记录，生成一条合适的跟进话术建议。
        输出必须是 JSON，字段固定为：
        - suggestedContent：建议的跟进消息内容（可直接通过微信发送，语气自然亲切，50-150字）
        - reason：生成理由（简要说明为什么建议这样跟进，不超过80字）

        严格规则：
        1) 只基于提供的客户信息生成，禁止编造客户未提及的产品或服务
        2) 话术要具体、可操作，不要空泛的套话
        3) 根据客户意向等级调整话术力度（高意向可推进成交，低意向以维护关系为主）
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
      sb.append("需求强度：").append(safeLevel(intent.getDemandLevel())).append("\n");
      sb.append("预算：").append(safeLevel(intent.getBudgetLevel())).append("\n");
      sb.append("时间紧迫度：").append(safeLevel(intent.getTimeLevel())).append("\n");
      sb.append("最近事件：").append(safeLevel(intent.getLatestEvent())).append("\n");
      sb.append("当日总结：").append(safeLevel(intent.getDailySummary())).append("\n");
    } else {
      sb.append("暂无意向分析数据\n");
    }
    if (customer != null) {
      sb.append("商机阶段：").append(safeLevel(customer.getStage())).append("\n");
      sb.append("备注名：").append(safeLevel(customer.getRemarkName())).append("\n");
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

  private SmartSalesVo.FollowUpSuggestion parseFollowUpSuggestion(String raw) {
    try {
      String cleaned = stripJsonFence(raw);
      JsonNode node = objectMapper.readTree(cleaned);
      String content = text(node.path("suggestedContent"));
      if (!StringUtils.hasText(content)) {
        content = text(node.path("suggested_content"));
      }
      String reason = text(node.path("reason"));
      if (!StringUtils.hasText(content)) {
        // fallback: 把整个输出当作建议内容
        return new SmartSalesVo.FollowUpSuggestion(raw.trim(), "AI 返回格式非标准，请酌情参考");
      }
      return new SmartSalesVo.FollowUpSuggestion(content.trim(), reason.trim());
    } catch (Exception ex) {
      log.warn("解析AI跟进建议JSON失败，按纯文本处理", ex);
      return new SmartSalesVo.FollowUpSuggestion(raw.trim(), "AI 返回格式非标准，请酌情参考");
    }
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

  private String safeLevel(String value) {
    return StringUtils.hasText(value) ? value : "未知";
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
}
