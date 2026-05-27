package com.shijie.transit.userapi.enterprisewechat;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.shijie.transit.common.db.entity.EnterpriseWeChatMessageEntity;
import com.shijie.transit.common.db.entity.EnterpriseWeChatUserBindingEntity;
import com.shijie.transit.common.mapper.EnterpriseWeChatMessageMapper;
import com.shijie.transit.common.mapper.EnterpriseWeChatUserBindingMapper;
import com.shijie.transit.common.tenant.TenantContext;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class EnterpriseWeChatMessageService {
  private static final Logger log = LoggerFactory.getLogger(EnterpriseWeChatMessageService.class);
  private static final Pattern XML_TAG_PATTERN = Pattern.compile("<%s><!\\[CDATA\\[([\\s\\S]*?)]]></%s>|<%s>([\\s\\S]*?)</%s>");
  private final EnterpriseWeChatMessageMapper messageMapper;
  private final EnterpriseWeChatUserBindingMapper bindingMapper;
  private final Clock clock;
  private final ObjectMapper objectMapper;

  public EnterpriseWeChatMessageService(
      EnterpriseWeChatMessageMapper messageMapper,
      EnterpriseWeChatUserBindingMapper bindingMapper,
      Clock clock) {
    this(messageMapper, bindingMapper, clock, new ObjectMapper());
  }

  @Autowired
  public EnterpriseWeChatMessageService(
      EnterpriseWeChatMessageMapper messageMapper,
      EnterpriseWeChatUserBindingMapper bindingMapper,
      Clock clock,
      ObjectMapper objectMapper) {
    this.messageMapper = messageMapper;
    this.bindingMapper = bindingMapper;
    this.clock = clock;
    this.objectMapper = objectMapper;
  }

  @Transactional
  public EnterpriseWeChatMessageEntity enqueueIncoming(
      long tenantId,
      String enterpriseUserId,
      String openKfid,
      String customerId,
      String customerName,
      String content,
      String messageType,
      String rawPayload) {
    TenantContext.setTenantId(tenantId);
    try {
      Long ownerUserId = resolveOwnerUserId(tenantId, enterpriseUserId);
      EnterpriseWeChatMessageEntity entity = new EnterpriseWeChatMessageEntity();
      entity.setTenantId(tenantId);
      entity.setMessageId(generateMessageId(tenantId, enterpriseUserId, customerId, content));
      entity.setEnterpriseUserId(defaultString(enterpriseUserId));
      entity.setOpenKfid(defaultString(openKfid));
      entity.setOwnerUserId(ownerUserId);
      entity.setCustomerId(defaultString(customerId));
      entity.setCustomerName(defaultString(customerName));
      entity.setContent(defaultString(content));
      entity.setMessageType(StringUtils.hasText(messageType) ? messageType.trim() : "text");
      entity.setDirection("IN");
      entity.setStatus(ownerUserId == null ? "UNMAPPED" : "PENDING");
      entity.setRawPayload(rawPayload);
      entity.setReceivedAt(LocalDateTime.now(clock));
      boolean inserted = insertIgnoringDuplicate(entity);
      log.info("企业微信直推消息入队结果，tenantId={}，messageId={}，enterpriseUserId={}，ownerUserId={}，status={}，inserted={}，contentLength={}",
          tenantId, entity.getMessageId(), entity.getEnterpriseUserId(), ownerUserId, entity.getStatus(), inserted, safeLength(entity.getContent()));
      return entity;
    } finally {
      TenantContext.clear();
    }
  }

  @Transactional
  public List<EnterpriseWeChatMessageEntity> enqueueSyncedMessages(long tenantId, List<SyncedCustomerMessage> messages) {
    if (messages == null || messages.isEmpty()) {
      return List.of();
    }
    TenantContext.setTenantId(tenantId);
    try {
      List<EnterpriseWeChatMessageEntity> inserted = new ArrayList<>();
      for (SyncedCustomerMessage message : messages) {
        if (!StringUtils.hasText(message.content())) {
          log.info("企业微信同步消息跳过非文本或空内容，tenantId={}，messageId={}，messageType={}",
              tenantId, message.messageId(), message.messageType());
          continue;
        }
        Long ownerUserId = resolveOwnerUserId(tenantId, message.enterpriseUserId());
        EnterpriseWeChatMessageEntity entity = new EnterpriseWeChatMessageEntity();
        entity.setTenantId(tenantId);
        entity.setMessageId(firstText(message.messageId(), generateMessageId(tenantId, message.enterpriseUserId(), message.customerId(), message.content())));
        entity.setEnterpriseUserId(defaultString(message.enterpriseUserId()));
        entity.setOpenKfid(defaultString(message.openKfid()));
        entity.setOwnerUserId(ownerUserId);
        entity.setCustomerId(defaultString(message.customerId()));
        entity.setCustomerName(defaultString(message.customerName()));
        entity.setContent(defaultString(message.content()));
        entity.setMessageType(StringUtils.hasText(message.messageType()) ? message.messageType().trim() : "text");
        entity.setDirection(message.direction());
        entity.setStatus(resolveInitialMessageStatus(ownerUserId, message.direction()));
        entity.setRawPayload(message.rawPayload());
        entity.setReceivedAt(message.receivedAt() == null ? LocalDateTime.now(clock) : message.receivedAt());
        if (insertIgnoringDuplicate(entity)) {
          inserted.add(entity);
          log.info("企业微信同步消息已入队，tenantId={}，messageId={}，enterpriseUserId={}，ownerUserId={}，status={}，openKfid={}，customerId={}，contentLength={}",
              tenantId,
              entity.getMessageId(),
              entity.getEnterpriseUserId(),
              ownerUserId,
              entity.getStatus(),
              maskMiddle(entity.getOpenKfid()),
              maskMiddle(entity.getCustomerId()),
              safeLength(entity.getContent()));
        } else {
          log.info("企业微信同步消息重复跳过，tenantId={}，messageId={}", tenantId, entity.getMessageId());
        }
      }
      return inserted;
    } finally {
      TenantContext.clear();
    }
  }

  public EnterpriseWeChatMessageEntity findPendingForReply(long tenantId, long userId, String messageId) {
    if (!StringUtils.hasText(messageId)) {
      return null;
    }
    TenantContext.setTenantId(tenantId);
    try {
      return messageMapper.selectOne(
          new LambdaQueryWrapper<EnterpriseWeChatMessageEntity>()
              .eq(EnterpriseWeChatMessageEntity::getTenantId, tenantId)
              .eq(EnterpriseWeChatMessageEntity::getOwnerUserId, userId)
              .eq(EnterpriseWeChatMessageEntity::getMessageId, messageId)
              .eq(EnterpriseWeChatMessageEntity::getDirection, "IN")
              .in(EnterpriseWeChatMessageEntity::getStatus, List.of("PENDING", "PROCESSING")));
    } finally {
      TenantContext.clear();
    }
  }

  @Transactional
  public void markReplied(long tenantId, long userId, String messageId, String failReason) {
    TenantContext.setTenantId(tenantId);
    try {
      EnterpriseWeChatMessageEntity entity = messageMapper.selectOne(
          new LambdaQueryWrapper<EnterpriseWeChatMessageEntity>()
              .eq(EnterpriseWeChatMessageEntity::getTenantId, tenantId)
              .eq(EnterpriseWeChatMessageEntity::getOwnerUserId, userId)
              .eq(EnterpriseWeChatMessageEntity::getMessageId, messageId));
      if (entity == null) {
        return;
      }
      entity.setStatus(StringUtils.hasText(failReason) ? "FAILED" : "REPLIED");
      entity.setFailReason(failReason);
      entity.setRepliedAt(LocalDateTime.now(clock));
      messageMapper.updateById(entity);
    } finally {
      TenantContext.clear();
    }
  }

  @Transactional
  public List<EnterpriseWeChatMessageEntity> pollPending(long tenantId, long userId, int limit) {
    TenantContext.setTenantId(tenantId);
    try {
      int safeLimit = Math.max(1, Math.min(limit, 50));
      LocalDateTime processingRecoveryTime = LocalDateTime.now(clock).minusMinutes(30);
      List<EnterpriseWeChatMessageEntity> list = messageMapper.selectList(
          new LambdaQueryWrapper<EnterpriseWeChatMessageEntity>()
              .eq(EnterpriseWeChatMessageEntity::getTenantId, tenantId)
              .eq(EnterpriseWeChatMessageEntity::getOwnerUserId, userId)
              .and(wrapper -> wrapper
                  .in(EnterpriseWeChatMessageEntity::getStatus, List.of("PENDING", "DISPLAY_ONLY"))
                  .or(recovery -> recovery
                      .eq(EnterpriseWeChatMessageEntity::getStatus, "PROCESSING")
                      .eq(EnterpriseWeChatMessageEntity::getDirection, "IN")
                      .ge(EnterpriseWeChatMessageEntity::getReceivedAt, processingRecoveryTime)))
              .orderByAsc(EnterpriseWeChatMessageEntity::getReceivedAt)
              .last("LIMIT " + safeLimit));
      log.info("企业微信待回复消息查询完成，tenantId={}，userId={}，limit={}，count={}",
          tenantId, userId, safeLimit, list == null ? 0 : list.size());
      if (list == null || list.isEmpty()) {
        return List.of();
      }
      for (EnterpriseWeChatMessageEntity entity : list) {
        entity.setStatus("IN".equals(entity.getDirection()) ? "PROCESSING" : "DISPLAYED");
        messageMapper.updateById(entity);
      }
      log.info("企业微信待回复消息已标记处理中，tenantId={}，userId={}，count={}", tenantId, userId, list.size());
      return new ArrayList<>(list);
    } finally {
      TenantContext.clear();
    }
  }

  public Long resolveOwnerUserId(long tenantId, String enterpriseUserId) {
    if (!StringUtils.hasText(enterpriseUserId)) {
      return resolveSingleEnabledOwnerUserId(tenantId);
    }
    EnterpriseWeChatUserBindingEntity binding = bindingMapper.selectOne(
        new LambdaQueryWrapper<EnterpriseWeChatUserBindingEntity>()
            .eq(EnterpriseWeChatUserBindingEntity::getTenantId, tenantId)
            .eq(EnterpriseWeChatUserBindingEntity::getEnterpriseUserId, enterpriseUserId.trim())
            .eq(EnterpriseWeChatUserBindingEntity::getStatus, "ENABLED"));
    if (binding == null) {
      log.warn("企业微信客服映射未命中，tenantId={}，enterpriseUserId={}", tenantId, maskMiddle(enterpriseUserId));
      return null;
    }
    log.info("企业微信客服映射命中，tenantId={}，enterpriseUserId={}，userId={}",
        tenantId, maskMiddle(enterpriseUserId), binding.getUserId());
    return binding.getUserId();
  }

  private Long resolveSingleEnabledOwnerUserId(long tenantId) {
    List<EnterpriseWeChatUserBindingEntity> bindings = bindingMapper.selectList(
        new LambdaQueryWrapper<EnterpriseWeChatUserBindingEntity>()
            .eq(EnterpriseWeChatUserBindingEntity::getTenantId, tenantId)
            .eq(EnterpriseWeChatUserBindingEntity::getStatus, "ENABLED"));
    if (bindings == null || bindings.isEmpty()) {
      log.warn("企业微信客服映射失败，tenantId={}，原因=enterpriseUserId为空且没有启用映射", tenantId);
      return null;
    }
    if (bindings.size() > 1) {
      log.warn("企业微信客服映射失败，tenantId={}，原因=enterpriseUserId为空且启用映射数量={}", tenantId, bindings.size());
      return null;
    }
    EnterpriseWeChatUserBindingEntity binding = bindings.get(0);
    log.info("企业微信客服映射使用唯一启用映射兜底，tenantId={}，enterpriseUserId={}，userId={}",
        tenantId, maskMiddle(binding.getEnterpriseUserId()), binding.getUserId());
    return binding.getUserId();
  }

  public EnterpriseWeChatUserBindingEntity upsertBinding(EnterpriseWeChatUserBindingEntity entity) {
    if (entity.getId() == null) {
      bindingMapper.insert(entity);
      return entity;
    }
    bindingMapper.updateById(entity);
    return entity;
  }

  @Transactional
  public EnterpriseWeChatUserBindingEntity saveMyBinding(long tenantId, long userId, MyBindingCommand command) {
    TenantContext.setTenantId(tenantId);
    try {
      EnterpriseWeChatUserBindingEntity entity = bindingMapper.selectOne(
          new LambdaQueryWrapper<EnterpriseWeChatUserBindingEntity>()
              .eq(EnterpriseWeChatUserBindingEntity::getTenantId, tenantId)
              .eq(EnterpriseWeChatUserBindingEntity::getUserId, userId));
      if (entity == null) {
        entity = new EnterpriseWeChatUserBindingEntity();
        entity.setTenantId(tenantId);
        entity.setUserId(userId);
      }
      normalizeMyBinding(entity, command);
      if (entity.getId() == null) {
        bindingMapper.insert(entity);
      } else {
        bindingMapper.updateById(entity);
      }
      return entity;
    } finally {
      TenantContext.clear();
    }
  }

  public EnterpriseWeChatUserBindingEntity getMyBinding(long tenantId, long userId) {
    TenantContext.setTenantId(tenantId);
    try {
      return bindingMapper.selectOne(
          new LambdaQueryWrapper<EnterpriseWeChatUserBindingEntity>()
              .eq(EnterpriseWeChatUserBindingEntity::getTenantId, tenantId)
              .eq(EnterpriseWeChatUserBindingEntity::getUserId, userId));
    } finally {
      TenantContext.clear();
    }
  }

  public List<EnterpriseWeChatMessageEntity> listRecentSessionsForModeSwitch(
      long tenantId,
      long userId,
      List<String> customerIds,
      int limit) {
    TenantContext.setTenantId(tenantId);
    try {
      int safeLimit = Math.max(1, Math.min(limit, 50));
      List<String> safeCustomerIds = customerIds == null ? List.of() : customerIds.stream()
          .filter(StringUtils::hasText)
          .map(String::trim)
          .distinct()
          .limit(50)
          .toList();
      LambdaQueryWrapper<EnterpriseWeChatMessageEntity> wrapper = new LambdaQueryWrapper<EnterpriseWeChatMessageEntity>()
          .eq(EnterpriseWeChatMessageEntity::getTenantId, tenantId)
          .eq(EnterpriseWeChatMessageEntity::getOwnerUserId, userId)
          .isNotNull(EnterpriseWeChatMessageEntity::getOpenKfid)
          .isNotNull(EnterpriseWeChatMessageEntity::getCustomerId)
          .orderByDesc(EnterpriseWeChatMessageEntity::getReceivedAt)
          .last("LIMIT " + safeLimit);
      if (!safeCustomerIds.isEmpty()) {
        wrapper.in(EnterpriseWeChatMessageEntity::getCustomerId, safeCustomerIds);
      }
      List<EnterpriseWeChatMessageEntity> rows = messageMapper.selectList(wrapper);
      if (rows == null || rows.isEmpty()) {
        return List.of();
      }
      List<EnterpriseWeChatMessageEntity> sessions = new ArrayList<>();
      List<String> seenKeys = new ArrayList<>();
      for (EnterpriseWeChatMessageEntity row : rows) {
        String key = row.getOpenKfid() + "\n" + row.getCustomerId();
        if (seenKeys.contains(key)) {
          continue;
        }
        seenKeys.add(key);
        sessions.add(row);
      }
      log.info("企业微信托管模式切换会话查询完成，tenantId={}，userId={}，customerIdCount={}，sessionCount={}",
          tenantId, userId, safeCustomerIds.size(), sessions.size());
      return sessions;
    } finally {
      TenantContext.clear();
    }
  }

  public EnterpriseWeChatCallbackMessage parseCallbackMessage(String plainText) {
    String messageType = firstText(readXml(plainText, "MsgType"), "text");
    String eventType = readXml(plainText, "Event");
    String enterpriseUserId = firstText(
        readXml(plainText, "ServicerUserId"),
        readXml(plainText, "UserID"),
        readXml(plainText, "ToUserName"));
    String openKfid = firstText(
        readXml(plainText, "OpenKfId"),
        readXml(plainText, "OpenKfID"),
        readXml(plainText, "open_kfid"));
    String customerId = firstText(
        readXml(plainText, "ExternalUserID"),
        readXml(plainText, "ExternalUserId"),
        readXml(plainText, "FromUserName"));
    String customerName = firstText(readXml(plainText, "ExternalUserName"), customerId);
    String content = firstText(readXml(plainText, "Content"), readXml(plainText, "Text"), "");
    String syncToken = firstText(readXml(plainText, "Token"), readXml(plainText, "SyncToken"));
    return new EnterpriseWeChatCallbackMessage(enterpriseUserId, openKfid, customerId, customerName, content, messageType, eventType, syncToken);
  }

  public SyncedMessageBatch parseSyncedMessages(String payload) {
    if (!StringUtils.hasText(payload)) {
      return new SyncedMessageBatch("", false, List.of());
    }
    try {
      JsonNode root = objectMapper.readTree(payload);
      int errCode = root.path("errcode").asInt(0);
      if (errCode != 0) {
        throw new IllegalStateException("企业微信同步消息失败: " + payload);
      }
      String nextCursor = text(root, "next_cursor");
      boolean hasMore = root.path("has_more").asInt(0) == 1;
      List<SyncedCustomerMessage> messages = new ArrayList<>();
      JsonNode listNode = root.path("msg_list");
      if (listNode.isArray()) {
        for (JsonNode item : listNode) {
          SyncedCustomerMessage message = toSyncedCustomerMessage(item);
          if (message != null) {
            messages.add(message);
          }
        }
      }
      log.info("企业微信同步消息解析完成，errcode={}，rawCount={}，textCount={}，hasMore={}，nextCursorConfigured={}",
          errCode, listNode.isArray() ? listNode.size() : 0, messages.size(), hasMore, StringUtils.hasText(nextCursor));
      return new SyncedMessageBatch(nextCursor, hasMore, messages);
    } catch (RuntimeException ex) {
      throw ex;
    } catch (Exception ex) {
      throw new IllegalArgumentException("企业微信同步消息解析失败", ex);
    }
  }

  public List<EnterpriseWeChatUserBindingEntity> listBindings(long tenantId) {
    return bindingMapper.selectList(
        new LambdaQueryWrapper<EnterpriseWeChatUserBindingEntity>()
            .eq(EnterpriseWeChatUserBindingEntity::getTenantId, tenantId)
            .orderByDesc(EnterpriseWeChatUserBindingEntity::getUpdatedAt));
  }

  private String generateMessageId(long tenantId, String enterpriseUserId, String customerId, String content) {
    String base = tenantId + "|" + enterpriseUserId + "|" + customerId + "|" + content + "|" + LocalDateTime.now(clock);
    return Long.toHexString(base.hashCode()) + "-" + Long.toUnsignedString(System.currentTimeMillis());
  }

  private String readXml(String xml, String tag) {
    if (!StringUtils.hasText(xml) || !StringUtils.hasText(tag)) {
      return "";
    }
    Pattern pattern = Pattern.compile(String.format(XML_TAG_PATTERN.pattern(), tag, tag, tag, tag));
    Matcher matcher = pattern.matcher(xml);
    if (!matcher.find()) {
      return "";
    }
    String value = matcher.group(1) != null ? matcher.group(1) : matcher.group(2);
    return value == null ? "" : value.trim();
  }

  private String firstText(String... values) {
    for (String value : values) {
      if (StringUtils.hasText(value)) {
        return value.trim();
      }
    }
    return "";
  }

  private String defaultString(String value) {
    return value == null ? "" : value.trim();
  }

  private String resolveInitialMessageStatus(Long ownerUserId, String direction) {
    if (ownerUserId == null) {
      return "UNMAPPED";
    }
    return "OUT".equals(direction) ? "DISPLAY_ONLY" : "PENDING";
  }

  private SyncedCustomerMessage toSyncedCustomerMessage(JsonNode item) {
    String messageType = firstText(text(item, "msgtype"), "text");
    int origin = item.path("origin").asInt(0);
    String direction = origin > 0 && origin != 3 ? "OUT" : "IN";
    String content = "";
    if ("text".equals(messageType)) {
      content = text(item.path("text"), "content");
    }
    if (!StringUtils.hasText(content)) {
      log.info("企业微信同步消息解析跳过，messageId={}，messageType={}，原因=非文本或内容为空",
          text(item, "msgid"), messageType);
      return null;
    }
    LocalDateTime receivedAt = null;
    if (item.has("send_time")) {
      receivedAt = LocalDateTime.ofInstant(Instant.ofEpochSecond(item.path("send_time").asLong()), ZoneId.systemDefault());
    }
    return new SyncedCustomerMessage(
        text(item, "msgid"),
        firstText(text(item, "open_kfid"), text(item, "openKfid")),
        firstText(text(item, "servicer_userid"), text(item, "servicerUserId"), text(item, "userid")),
        firstText(text(item, "external_userid"), text(item, "externalUserId"), text(item, "from_userid")),
        firstText(text(item, "external_username"), text(item, "customer_name"), text(item, "external_userid")),
        messageType,
        direction,
        content,
        receivedAt,
        item.toString());
  }

  private String text(JsonNode node, String field) {
    JsonNode value = node == null ? null : node.get(field);
    if (value == null || value.isNull()) {
      return "";
    }
    return value.asText("");
  }

  private boolean insertIgnoringDuplicate(EnterpriseWeChatMessageEntity entity) {
    try {
      messageMapper.insert(entity);
      return true;
    } catch (DuplicateKeyException ex) {
      log.info("企业微信消息已存在，跳过重复入库，tenantId={}，messageId={}", entity.getTenantId(), entity.getMessageId());
      return false;
    }
  }

  private int safeLength(String value) {
    return value == null ? 0 : value.length();
  }

  private String maskMiddle(String value) {
    if (!StringUtils.hasText(value)) {
      return "";
    }
    String trimmed = value.trim();
    if (trimmed.length() <= 8) {
      return "***";
    }
    return trimmed.substring(0, 4) + "***" + trimmed.substring(trimmed.length() - 4);
  }

  private void normalizeMyBinding(EnterpriseWeChatUserBindingEntity entity, MyBindingCommand command) {
    if (!StringUtils.hasText(command.enterpriseUserId())) {
      throw new IllegalArgumentException("企业微信 userid 不能为空");
    }
    entity.setEnterpriseUserId(command.enterpriseUserId().trim());
    entity.setEnterpriseUserName(defaultString(command.enterpriseUserName()));
    entity.setRemark(defaultString(command.remark()));
    entity.setStatus("DISABLED".equalsIgnoreCase(command.status()) ? "DISABLED" : "ENABLED");
  }

  public record MyBindingCommand(
      String enterpriseUserId,
      String enterpriseUserName,
      String remark,
      String status) {
  }

  public record SyncedMessageBatch(
      String nextCursor,
      boolean hasMore,
      List<SyncedCustomerMessage> messages) {
  }

  public record SyncedCustomerMessage(
      String messageId,
      String openKfid,
      String enterpriseUserId,
      String customerId,
      String customerName,
      String messageType,
      String direction,
      String content,
      LocalDateTime receivedAt,
      String rawPayload) {
  }
}
