package com.shijie.transit.userapi.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.shijie.transit.common.db.entity.CrmCustomerEntity;
import com.shijie.transit.common.db.entity.UserIntentEntity;
import com.shijie.transit.common.tenant.TenantContext;
import com.shijie.transit.common.web.ErrorCode;
import com.shijie.transit.common.web.TransitException;
import com.shijie.transit.userapi.dto.SmartSalesDto;
import com.shijie.transit.userapi.mapper.CrmCustomerMapper;
import com.shijie.transit.userapi.vo.SmartSalesVo.AiProfile;
import com.shijie.transit.userapi.vo.SmartSalesVo.CustomerListItem;
import com.shijie.transit.userapi.vo.SmartSalesVo.CustomerListResponse;
import com.shijie.transit.userapi.vo.SmartSalesVo.CustomerProfile;
import com.shijie.transit.userapi.vo.SmartSalesVo.FollowUpView;
import com.shijie.transit.userapi.vo.SmartSalesVo.TagView;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

/**
 * 智能销售客户画像服务。列表和画像以微信消息意向分析为主，CRM 字段只做人工补充。
 */
@Service
public class SmartSalesCustomerService {
  private static final Logger log = LoggerFactory.getLogger(SmartSalesCustomerService.class);

  private final CrmCustomerMapper customerMapper;
  private final ObjectMapper objectMapper;
  private final Clock clock;
  private final SmartSalesCustomerAccess customerAccess;
  private final SmartSalesTagService tagService;
  private final SmartSalesFollowUpService followUpService;

  public SmartSalesCustomerService(
      CrmCustomerMapper customerMapper,
      ObjectMapper objectMapper,
      Clock clock,
      SmartSalesCustomerAccess customerAccess,
      SmartSalesTagService tagService,
      SmartSalesFollowUpService followUpService) {
    this.customerMapper = customerMapper;
    this.objectMapper = objectMapper;
    this.clock = clock;
    this.customerAccess = customerAccess;
    this.tagService = tagService;
    this.followUpService = followUpService;
  }

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
    customerAccess.validateIntentLevel(intentLevel);
    customerAccess.validateStage(stage);

    Long total = customerMapper.countCustomers(
        tenantId, ownerUserId, intentLevel, stage, starred, normalizedKeyword);
    if (total == null || total == 0) {
      return new CustomerListResponse(0L, List.of());
    }
    List<CrmCustomerMapper.CustomerListItem> rawItems = customerMapper.listCustomers(
        tenantId, ownerUserId, intentLevel, stage, starred, normalizedKeyword,
        offset, normalizedPageSize);
    List<Long> customerIds = rawItems.stream()
        .map(CrmCustomerMapper.CustomerListItem::getCustomerId)
        .filter(java.util.Objects::nonNull)
        .distinct()
        .toList();
    Map<Long, List<TagView>> tagMap = tagService.batchLoadTags(tenantId, customerIds);
    List<CustomerListItem> list = rawItems.stream()
        .map(item -> new CustomerListItem(
            item.getContactKey(),
            item.getCustomerName(),
            item.getIntentLevel(),
            customerAccess.toIntentLabel(item.getIntentLevel()),
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
            item.getCustomerId() == null ? List.of() : tagMap.getOrDefault(item.getCustomerId(), List.of())))
        .toList();
    log.info("查询智能销售客户列表 tenantId={} userId={} total={} returned={}",
        tenantId, ownerUserId, total, list.size());
    return new CustomerListResponse(total, list);
  }

  @Transactional
  public CustomerProfile saveCustomer(Long ownerUserId, SmartSalesDto.SaveCustomerRequest req) {
    if (req == null || !StringUtils.hasText(req.contactKey())) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "contactKey 不能为空");
    }
    customerAccess.validateStage(req.stage());
    customerAccess.validateSource(req.source());
    Long tenantId = TenantContext.getTenantId();
    String contactKey = req.contactKey().trim();
    CrmCustomerEntity existing = customerAccess.findCustomer(tenantId, ownerUserId, contactKey);
    CrmCustomerEntity entity = existing != null ? existing : new CrmCustomerEntity();
    if (existing == null) {
      entity.setTenantId(tenantId);
      entity.setOwnerUserId(ownerUserId);
      entity.setContactKey(contactKey);
      entity.setStarred(req.starred() == null ? 0 : (req.starred() == 1 ? 1 : 0));
      entity.setStage(StringUtils.hasText(req.stage()) ? req.stage() : "LEAD");
      entity.setSource(StringUtils.hasText(req.source()) ? req.source() : "UNKNOWN");
    }
    if (req.remarkName() != null) entity.setRemarkName(req.remarkName());
    if (req.phone() != null) entity.setPhone(req.phone());
    if (StringUtils.hasText(req.source())) entity.setSource(req.source());
    if (StringUtils.hasText(req.stage())) entity.setStage(req.stage());
    entity.setAssignedRoleId(req.assignedRoleId());
    entity.setRemark(req.remark());
    entity.setNextFollowUpAt(req.nextFollowUpAt());
    if (req.starred() != null) entity.setStarred(req.starred() == 1 ? 1 : 0);

    if (existing == null) {
      customerMapper.insert(entity);
      log.info("新建智能销售客户档案 tenantId={} userId={} contactKey={} customerId={}",
          tenantId, ownerUserId, contactKey, entity.getId());
    } else {
      customerMapper.updateById(entity);
      log.info("更新智能销售客户档案 tenantId={} userId={} contactKey={} customerId={}",
          tenantId, ownerUserId, contactKey, entity.getId());
    }
    return getProfile(ownerUserId, contactKey);
  }

  @Transactional
  public CustomerProfile updateStage(Long ownerUserId, String contactKey, String stage) {
    if (!StringUtils.hasText(contactKey)) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "contactKey 不能为空");
    }
    customerAccess.validateStage(stage);
    Long tenantId = TenantContext.getTenantId();
    CrmCustomerEntity entity = customerAccess.ensureCustomer(tenantId, ownerUserId, contactKey.trim());
    entity.setStage(stage);
    customerMapper.updateById(entity);
    log.info("智能销售阶段流转 tenantId={} userId={} contactKey={} stage={}",
        tenantId, ownerUserId, contactKey, stage);
    return getProfile(ownerUserId, contactKey);
  }

  @Transactional
  public CustomerProfile updateStarred(Long ownerUserId, String contactKey, Integer starred) {
    if (!StringUtils.hasText(contactKey)) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "contactKey 不能为空");
    }
    Long tenantId = TenantContext.getTenantId();
    CrmCustomerEntity entity = customerAccess.ensureCustomer(tenantId, ownerUserId, contactKey.trim());
    entity.setStarred(starred != null && starred == 1 ? 1 : 0);
    customerMapper.updateById(entity);
    return getProfile(ownerUserId, contactKey);
  }

  public CustomerProfile getProfile(Long ownerUserId, String contactKey) {
    if (!StringUtils.hasText(contactKey)) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "contactKey 不能为空");
    }
    Long tenantId = TenantContext.getTenantId();
    String normalizedKey = contactKey.trim();
    UserIntentEntity intent = customerAccess.getIntent(tenantId, ownerUserId, normalizedKey);
    CrmCustomerEntity customer = customerAccess.findCustomer(tenantId, ownerUserId, normalizedKey);
    if (intent == null && customer == null) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "客户不存在或暂无沟通记录");
    }
    List<TagView> tags = customer == null ? List.of() : tagService.loadTagsOfCustomer(tenantId, customer.getId());
    List<FollowUpView> followUps = customer == null ? List.of() : followUpService.loadFollowUps(tenantId, customer.getId());
    AiProfile aiProfile = customer == null ? null : parseAiProfile(customer);
    Integer intentLevel = intent == null ? null : intent.getIntentLevel();
    LocalDateTime lastChatTime = customerAccess.findLastChatTime(tenantId, ownerUserId, normalizedKey);
    return new CustomerProfile(
        normalizedKey,
        resolveCustomerName(customer, normalizedKey),
        intentLevel,
        customerAccess.toIntentLabel(intentLevel),
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

  @Transactional
  public void updateAiProfile(Long ownerUserId, String contactKey, AiProfile aiProfile) {
    Long tenantId = TenantContext.getTenantId();
    CrmCustomerEntity entity = customerAccess.ensureCustomer(tenantId, ownerUserId, contactKey);
    try {
      Map<String, Object> payload = new LinkedHashMap<>();
      payload.put("communicationFocus", aiProfile.communicationFocus());
      payload.put("interestTags", aiProfile.interestTags());
      payload.put("suggestedNextAction", aiProfile.suggestedNextAction());
      entity.setAiProfileJson(objectMapper.writeValueAsString(payload));
      entity.setAiProfileUpdatedAt(LocalDateTime.now(clock));
      customerMapper.updateById(entity);
    } catch (Exception ex) {
      log.error("写入智能销售AI画像失败 tenantId={} userId={} contactKey={}",
          tenantId, ownerUserId, contactKey, ex);
      throw new TransitException(ErrorCode.INTERNAL_ERROR, "AI画像保存失败");
    }
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
      log.warn("解析智能销售AI画像JSON失败，忽略 customer={} json={}",
          customer.getId(), customer.getAiProfileJson(), ex);
      return null;
    }
  }

  private String resolveCustomerName(CrmCustomerEntity customer, String contactKey) {
    if (customer != null && StringUtils.hasText(customer.getRemarkName())) {
      return customer.getRemarkName();
    }
    return contactKey;
  }

  private String asString(Object value) {
    if (value == null) {
      return null;
    }
    String text = String.valueOf(value).trim();
    return text.isEmpty() || "null".equals(text) ? null : text;
  }

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
}
