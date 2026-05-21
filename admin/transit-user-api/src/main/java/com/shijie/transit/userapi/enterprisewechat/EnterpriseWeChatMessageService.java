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
      insertIgnoringDuplicate(entity);
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
        entity.setDirection("IN");
        entity.setStatus(ownerUserId == null ? "UNMAPPED" : "PENDING");
        entity.setRawPayload(message.rawPayload());
        entity.setReceivedAt(message.receivedAt() == null ? LocalDateTime.now(clock) : message.receivedAt());
        if (insertIgnoringDuplicate(entity)) {
          inserted.add(entity);
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
              .eq(EnterpriseWeChatMessageEntity::getStatus, "PENDING"));
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

  public List<EnterpriseWeChatMessageEntity> pollPending(long tenantId, long userId, int limit) {
    TenantContext.setTenantId(tenantId);
    try {
      List<EnterpriseWeChatMessageEntity> list = messageMapper.selectList(
          new LambdaQueryWrapper<EnterpriseWeChatMessageEntity>()
              .eq(EnterpriseWeChatMessageEntity::getTenantId, tenantId)
              .eq(EnterpriseWeChatMessageEntity::getOwnerUserId, userId)
              .eq(EnterpriseWeChatMessageEntity::getDirection, "IN")
              .eq(EnterpriseWeChatMessageEntity::getStatus, "PENDING")
              .orderByAsc(EnterpriseWeChatMessageEntity::getReceivedAt)
              .last("LIMIT " + Math.max(1, Math.min(limit, 50))));
      if (list == null) {
        return List.of();
      }
      return new ArrayList<>(list);
    } finally {
      TenantContext.clear();
    }
  }

  public Long resolveOwnerUserId(long tenantId, String enterpriseUserId) {
    if (!StringUtils.hasText(enterpriseUserId)) {
      return null;
    }
    EnterpriseWeChatUserBindingEntity binding = bindingMapper.selectOne(
        new LambdaQueryWrapper<EnterpriseWeChatUserBindingEntity>()
            .eq(EnterpriseWeChatUserBindingEntity::getTenantId, tenantId)
            .eq(EnterpriseWeChatUserBindingEntity::getEnterpriseUserId, enterpriseUserId.trim())
            .eq(EnterpriseWeChatUserBindingEntity::getStatus, "ENABLED"));
    return binding == null ? null : binding.getUserId();
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

  private SyncedCustomerMessage toSyncedCustomerMessage(JsonNode item) {
    String messageType = firstText(text(item, "msgtype"), "text");
    String content = "";
    if ("text".equals(messageType)) {
      content = text(item.path("text"), "content");
    }
    if (!StringUtils.hasText(content)) {
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
      String content,
      LocalDateTime receivedAt,
      String rawPayload) {
  }
}
