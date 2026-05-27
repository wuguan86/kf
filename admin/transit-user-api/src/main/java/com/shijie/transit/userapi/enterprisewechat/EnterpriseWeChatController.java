package com.shijie.transit.userapi.enterprisewechat;

import com.shijie.transit.common.db.entity.EnterpriseWeChatMessageEntity;
import com.shijie.transit.common.db.entity.EnterpriseWeChatUserBindingEntity;
import com.shijie.transit.common.security.TransitPrincipal;
import com.shijie.transit.common.web.ErrorCode;
import com.shijie.transit.common.web.Result;
import com.shijie.transit.common.web.TransitException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/user/enterprise-wechat")
public class EnterpriseWeChatController {
  private static final Logger log = LoggerFactory.getLogger(EnterpriseWeChatController.class);
  private final EnterpriseWeChatConfigService configService;
  private final EnterpriseWeChatCrypto crypto;
  private final EnterpriseWeChatMessageService messageService;
  private final EnterpriseWeChatClient client;

  public EnterpriseWeChatController(
      EnterpriseWeChatConfigService configService,
      EnterpriseWeChatCrypto crypto,
      EnterpriseWeChatMessageService messageService,
      EnterpriseWeChatClient client) {
    this.configService = configService;
    this.crypto = crypto;
    this.messageService = messageService;
    this.client = client;
  }

  @GetMapping("/channel")
  public Result<Map<String, String>> channel() {
    Map<String, String> payload = new HashMap<>();
    payload.put("channel", configService.getChannelConfig().channel());
    return Result.success(payload);
  }

  @GetMapping(value = "/callback", produces = MediaType.TEXT_PLAIN_VALUE)
  public String verify(
      @RequestHeader(value = "X-Tenant-Id", required = false, defaultValue = "1") long tenantId,
      @RequestParam("msg_signature") String msgSignature,
      @RequestParam("timestamp") String timestamp,
      @RequestParam("nonce") String nonce,
      @RequestParam("echostr") String echostr) {
    log.info("企业微信回调校验请求进入，tenantId={}，timestamp={}，nonceLength={}，echostrLength={}",
        tenantId, timestamp, safeLength(nonce), safeLength(echostr));
    EnterpriseWeChatConfigService.EnterpriseWeChatRuntimeConfig runtime = configService.getRuntimeConfig(tenantId);
    log.info("企业微信回调校验配置状态，tenantId={}，corpIdConfigured={}，tokenConfigured={}，aesKeyConfigured={}",
        tenantId, StringUtils.hasText(runtime.corpId()), StringUtils.hasText(runtime.token()), StringUtils.hasText(runtime.encodingAesKey()));
    String result = crypto.decrypt(runtime.token(), runtime.encodingAesKey(), runtime.corpId(), msgSignature, timestamp, nonce, echostr);
    log.info("企业微信回调校验成功，tenantId={}，resultLength={}", tenantId, safeLength(result));
    return result;
  }

  @PostMapping(value = "/callback", produces = MediaType.TEXT_PLAIN_VALUE)
  public String receive(
      @RequestHeader(value = "X-Tenant-Id", required = false, defaultValue = "1") long tenantId,
      @RequestParam("msg_signature") String msgSignature,
      @RequestParam("timestamp") String timestamp,
      @RequestParam("nonce") String nonce,
      @RequestBody String body) {
    log.info("企业微信消息回调进入，tenantId={}，timestamp={}，nonceLength={}，bodyLength={}",
        tenantId, timestamp, safeLength(nonce), safeLength(body));
    EnterpriseWeChatConfigService.EnterpriseWeChatRuntimeConfig runtime = configService.getRuntimeConfig(tenantId);
    log.info("企业微信消息回调配置状态，tenantId={}，corpIdConfigured={}，secretConfigured={}，tokenConfigured={}，aesKeyConfigured={}，apiBaseUrl={}",
        tenantId,
        StringUtils.hasText(runtime.corpId()),
        StringUtils.hasText(runtime.secret()),
        StringUtils.hasText(runtime.token()),
        StringUtils.hasText(runtime.encodingAesKey()),
        runtime.apiBaseUrl());
    String encrypted = extractEncrypted(body);
    log.info("企业微信消息回调密文已提取，tenantId={}，encryptedLength={}", tenantId, safeLength(encrypted));
    String plain = crypto.decrypt(runtime.token(), runtime.encodingAesKey(), runtime.corpId(), msgSignature, timestamp, nonce, encrypted);
    log.info("企业微信消息回调解密成功，tenantId={}，plainLength={}", tenantId, safeLength(plain));
    EnterpriseWeChatCallbackMessage message = messageService.parseCallbackMessage(plain);
    log.info("企业微信消息回调解析完成，tenantId={}，messageType={}，eventType={}，openKfid={}，enterpriseUserId={}，customerId={}，hasSyncToken={}，contentLength={}",
        tenantId,
        message.messageType(),
        message.eventType(),
        maskMiddle(message.openKfid()),
        message.enterpriseUserId(),
        maskMiddle(message.customerId()),
        StringUtils.hasText(message.syncToken()),
        safeLength(message.content()));
    if (isWechatKfSyncEvent(message)) {
      try {
        List<EnterpriseWeChatMessageEntity> syncedMessages = syncWechatKfMessages(tenantId, runtime, message);
        transferSessionsForSemiManagedMode(tenantId, configService.getManagedMode(tenantId), syncedMessages);
      } catch (RuntimeException ex) {
        log.error("企业微信客服消息同步异常，tenantId={}，openKfid={}，hasSyncToken={}，原因={}",
            tenantId, maskMiddle(message.openKfid()), StringUtils.hasText(message.syncToken()), ex.getMessage(), ex);
        throw ex;
      }
    } else {
      if ("event".equalsIgnoreCase(message.messageType())) {
        log.warn("企业微信事件回调未进入微信客服同步分支，tenantId={}，eventType={}，openKfidConfigured={}，syncTokenConfigured={}",
            tenantId, message.eventType(), StringUtils.hasText(message.openKfid()), StringUtils.hasText(message.syncToken()));
      }
      EnterpriseWeChatMessageEntity entity = messageService.enqueueIncoming(
          tenantId,
          message.enterpriseUserId(),
          message.openKfid(),
          message.customerId(),
          message.customerName(),
          message.content(),
          message.messageType(),
          plain);
      log.info("企业微信直推消息已入队，tenantId={}，messageId={}，status={}，ownerUserId={}",
          tenantId, entity.getMessageId(), entity.getStatus(), entity.getOwnerUserId());
    }
    return "success";
  }

  @GetMapping("/messages/poll")
  public Result<Map<String, Object>> poll(
      @RequestHeader("X-Tenant-Id") long tenantId,
      Authentication authentication,
      @RequestParam(value = "limit", defaultValue = "20") int limit,
      @RequestParam(value = "managedMode", defaultValue = "full") String managedMode) {
    TransitPrincipal principal = (TransitPrincipal) authentication.getPrincipal();
    log.info("企业微信前端轮询请求进入，tenantId={}，userId={}，limit={}", tenantId, principal.subjectId(), limit);
    List<EnterpriseWeChatMessageEntity> pendingMessages = messageService.pollPending(tenantId, principal.subjectId(), limit);
    transferSessionsForSemiManagedMode(tenantId, managedMode, pendingMessages);
    List<Map<String, Object>> messages = pendingMessages.stream()
        .map(this::toBridgeMessage)
        .toList();
    log.info("企业微信前端轮询完成，tenantId={}，userId={}，count={}", tenantId, principal.subjectId(), messages.size());
    Map<String, Object> payload = new HashMap<>();
    payload.put("ok", true);
    payload.put("messages", messages);
    return Result.success(payload);
  }

  private void transferSessionsForSemiManagedMode(
      long tenantId,
      String managedMode,
      List<EnterpriseWeChatMessageEntity> messages) {
    if (!"semi".equalsIgnoreCase(managedMode) || messages == null || messages.isEmpty()) {
      return;
    }
    for (EnterpriseWeChatMessageEntity message : messages) {
      Long ownerUserId = message.getOwnerUserId();
      if (ownerUserId == null) {
        log.warn("企业微信半托管转人工跳过，tenantId={}，messageId={}，原因=消息未映射到当前客服用户",
            tenantId, message.getMessageId());
        continue;
      }
      transferSessionsForSemiManagedMode(tenantId, ownerUserId, managedMode, List.of(message));
    }
  }

  private void transferSessionsForSemiManagedMode(
      long tenantId,
      long userId,
      String managedMode,
      List<EnterpriseWeChatMessageEntity> messages) {
    if (!"semi".equalsIgnoreCase(managedMode) || messages == null || messages.isEmpty()) {
      return;
    }
    EnterpriseWeChatUserBindingEntity binding = messageService.getMyBinding(tenantId, userId);
    if (binding == null || !"ENABLED".equalsIgnoreCase(binding.getStatus()) || !StringUtils.hasText(binding.getEnterpriseUserId())) {
      log.warn("企业微信半托管转人工跳过，tenantId={}，userId={}，原因=当前用户未配置启用的企业微信 userid", tenantId, userId);
      return;
    }
    EnterpriseWeChatConfigService.EnterpriseWeChatRuntimeConfig runtime = configService.getRuntimeConfig(tenantId);
    for (EnterpriseWeChatMessageEntity message : messages) {
      if (!"IN".equals(message.getDirection())) {
        continue;
      }
      if (!StringUtils.hasText(message.getOpenKfid()) || !StringUtils.hasText(message.getCustomerId())) {
        log.warn("企业微信半托管转人工跳过，tenantId={}，messageId={}，原因=openKfid或customerId为空",
            tenantId, message.getMessageId());
        continue;
      }
      try {
        client.transferCustomerServiceState(
            runtime,
            message.getOpenKfid(),
            message.getCustomerId(),
            binding.getEnterpriseUserId());
      } catch (RuntimeException ex) {
        log.warn("企业微信半托管转人工失败，tenantId={}，messageId={}，openKfid={}，customerId={}，原因={}",
            tenantId, message.getMessageId(), maskMiddle(message.getOpenKfid()), maskMiddle(message.getCustomerId()), ex.getMessage(), ex);
      }
    }
  }

  @PostMapping("/messages/send")
  public Result<Map<String, Object>> send(
      @RequestHeader("X-Tenant-Id") long tenantId,
      Authentication authentication,
      @RequestBody SendRequest request) {
    TransitPrincipal principal = (TransitPrincipal) authentication.getPrincipal();
    EnterpriseWeChatConfigService.EnterpriseWeChatRuntimeConfig runtime = configService.getRuntimeConfig(tenantId);
    EnterpriseWeChatMessageEntity pendingMessage = messageService.findPendingForReply(tenantId, principal.subjectId(), request.messageId());
    if (pendingMessage == null) {
      throw new IllegalArgumentException("企业微信待回复消息不存在或已处理");
    }
    try {
      EnterpriseWeChatClient.CustomerServiceState state = client.getCustomerServiceState(
          runtime,
          pendingMessage.getOpenKfid(),
          pendingMessage.getCustomerId());
      log.info("企业微信全托管发送前会话状态已查询，tenantId={}，userId={}，messageId={}，serviceState={}，openKfid={}，customerId={}",
          tenantId, principal.subjectId(), request.messageId(), state.serviceState(), maskMiddle(pendingMessage.getOpenKfid()), maskMiddle(pendingMessage.getCustomerId()));
      sendCustomerMessageWithSessionRecovery(
          runtime,
          state,
          pendingMessage,
          request.content(),
          tenantId,
          principal.subjectId(),
          request.messageId());
      messageService.markReplied(tenantId, principal.subjectId(), request.messageId(), null);
    } catch (RuntimeException ex) {
      String reason = resolveFailureReason(ex);
      messageService.markReplied(tenantId, principal.subjectId(), request.messageId(),
          StringUtils.hasText(reason) ? reason : "企业微信消息发送失败");
      log.warn("企业微信消息发送失败，messageId={}", request.messageId(), ex);
      throw new TransitException(ErrorCode.BAD_REQUEST, StringUtils.hasText(reason) ? reason : "企业微信消息发送失败", ex);
    }
    Map<String, Object> payload = new HashMap<>();
    payload.put("ok", true);
    return Result.success(payload);
  }

  private void sendCustomerMessageWithSessionRecovery(
      EnterpriseWeChatConfigService.EnterpriseWeChatRuntimeConfig runtime,
      EnterpriseWeChatClient.CustomerServiceState state,
      EnterpriseWeChatMessageEntity pendingMessage,
      String content,
      long tenantId,
      long userId,
      String messageId) {
    try {
      client.sendCustomerMessage(runtime, pendingMessage.getOpenKfid(), pendingMessage.getCustomerId(), content);
      return;
    } catch (RuntimeException ex) {
      String reason = resolveFailureReason(ex);
      if (!isSessionStatusInvalidFailure(reason)) {
        throw ex;
      }
      if (state.serviceState() != 3) {
        throw ex;
      }
      log.warn("企业微信发送遇到人工接待会话状态无效，准备结束人工接待并用事件响应发送，tenantId={}，userId={}，messageId={}，openKfid={}，customerId={}，reason={}",
          tenantId, userId, messageId, maskMiddle(pendingMessage.getOpenKfid()), maskMiddle(pendingMessage.getCustomerId()), reason, ex);
      String messageCode = client.transferCustomerServiceStateAndGetMessageCode(
          runtime,
          pendingMessage.getOpenKfid(),
          pendingMessage.getCustomerId(),
          4,
          null);
      if (!StringUtils.hasText(messageCode)) {
        throw new IllegalStateException("企业微信会话状态切换失败: 未返回事件响应 msg_code", ex);
      }
      client.sendCustomerEventMessage(runtime, messageCode, content);
    }
  }

  private String resolveFailureReason(Throwable throwable) {
    Throwable current = throwable;
    String fallback = "";
    while (current != null) {
      String message = current.getMessage();
      if (StringUtils.hasText(message)) {
        fallback = message;
        if (message.contains("errcode") || message.contains("errmsg") || message.contains("企业微信")) {
          return message;
        }
      }
      current = current.getCause();
    }
    return fallback;
  }

  private boolean isSessionStatusInvalidFailure(String reason) {
    if (!StringUtils.hasText(reason)) {
      return false;
    }
    return reason.contains("95018") || reason.contains("send msg session status invalid");
  }

  @PostMapping("/sessions/release-manual")
  public Result<Map<String, Object>> releaseManualSessions(
      @RequestHeader("X-Tenant-Id") long tenantId,
      Authentication authentication,
      @RequestBody ReleaseManualSessionsRequest request) {
    TransitPrincipal principal = (TransitPrincipal) authentication.getPrincipal();
    EnterpriseWeChatConfigService.EnterpriseWeChatRuntimeConfig runtime = configService.getRuntimeConfig(tenantId);
    List<EnterpriseWeChatMessageEntity> sessions = messageService.listRecentSessionsForModeSwitch(
        tenantId,
        principal.subjectId(),
        request == null ? List.of() : request.customerIds(),
        50);
    int releasedCount = 0;
    int skippedCount = 0;
    int failedCount = 0;
    for (EnterpriseWeChatMessageEntity session : sessions) {
      try {
        EnterpriseWeChatClient.CustomerServiceState state = client.getCustomerServiceState(
            runtime,
            session.getOpenKfid(),
            session.getCustomerId());
        if (state.serviceState() == 3) {
          client.transferCustomerServiceState(runtime, session.getOpenKfid(), session.getCustomerId(), 4, null);
          releasedCount++;
          log.info("企业微信全托管切换已结束人工接待，tenantId={}，userId={}，openKfid={}，customerId={}，servicerUserId={}",
              tenantId, principal.subjectId(), maskMiddle(session.getOpenKfid()), maskMiddle(session.getCustomerId()), maskMiddle(state.servicerUserId()));
        } else {
          skippedCount++;
          log.info("企业微信全托管切换跳过非人工接待会话，tenantId={}，userId={}，serviceState={}，openKfid={}，customerId={}",
              tenantId, principal.subjectId(), state.serviceState(), maskMiddle(session.getOpenKfid()), maskMiddle(session.getCustomerId()));
        }
      } catch (RuntimeException ex) {
        failedCount++;
        log.warn("企业微信全托管切换释放人工接待失败，tenantId={}，userId={}，openKfid={}，customerId={}，原因={}",
            tenantId, principal.subjectId(), maskMiddle(session.getOpenKfid()), maskMiddle(session.getCustomerId()), ex.getMessage(), ex);
      }
    }
    Map<String, Object> payload = new HashMap<>();
    payload.put("ok", failedCount == 0);
    payload.put("totalCount", sessions.size());
    payload.put("releasedCount", releasedCount);
    payload.put("skippedCount", skippedCount);
    payload.put("failedCount", failedCount);
    if (failedCount > 0) {
      throw new IllegalStateException("企业微信全托管切换失败，部分人工接待未能释放");
    }
    return Result.success(payload);
  }

  @GetMapping("/bindings")
  public Result<List<EnterpriseWeChatUserBindingEntity>> bindings(@RequestHeader("X-Tenant-Id") long tenantId) {
    return Result.<List<EnterpriseWeChatUserBindingEntity>>success(messageService.listBindings(tenantId));
  }

  @GetMapping("/my-binding")
  public Result<EnterpriseWeChatUserBindingEntity> myBinding(
      @RequestHeader("X-Tenant-Id") long tenantId,
      Authentication authentication) {
    TransitPrincipal principal = (TransitPrincipal) authentication.getPrincipal();
    return Result.success(messageService.getMyBinding(tenantId, principal.subjectId()));
  }

  @PostMapping("/my-binding")
  public Result<EnterpriseWeChatUserBindingEntity> saveMyBinding(
      @RequestHeader("X-Tenant-Id") long tenantId,
      Authentication authentication,
      @RequestBody EnterpriseWeChatMessageService.MyBindingCommand request) {
    TransitPrincipal principal = (TransitPrincipal) authentication.getPrincipal();
    return Result.success(messageService.saveMyBinding(tenantId, principal.subjectId(), request));
  }

  String extractEncrypted(String body) {
    if (body == null) {
      return "";
    }
    String trimmed = body.trim();
    if (!trimmed.startsWith("<")) {
      return trimmed;
    }
    int start = trimmed.indexOf("<Encrypt>");
    int end = trimmed.indexOf("</Encrypt>");
    if (start < 0 || end < 0 || end <= start) {
      return trimmed;
    }
    return unwrapCdata(trimmed.substring(start + "<Encrypt>".length(), end).trim());
  }

  private String unwrapCdata(String value) {
    if (!StringUtils.hasText(value)) {
      return "";
    }
    String trimmed = value.trim();
    if (trimmed.startsWith("<![CDATA[") && trimmed.endsWith("]]>")) {
      return trimmed.substring("<![CDATA[".length(), trimmed.length() - "]]>".length()).trim();
    }
    return trimmed;
  }

  public record SendRequest(String messageId, String customerId, String content) {
  }

  public record ReleaseManualSessionsRequest(List<String> customerIds) {
  }

  private boolean isWechatKfSyncEvent(EnterpriseWeChatCallbackMessage message) {
    return "event".equalsIgnoreCase(message.messageType())
        && "kf_msg_or_event".equalsIgnoreCase(message.eventType())
        && StringUtils.hasText(message.syncToken())
        && StringUtils.hasText(message.openKfid());
  }

  private List<EnterpriseWeChatMessageEntity> syncWechatKfMessages(
      long tenantId,
      EnterpriseWeChatConfigService.EnterpriseWeChatRuntimeConfig runtime,
      EnterpriseWeChatCallbackMessage message) {
    String cursor = "";
    int totalInserted = 0;
    List<EnterpriseWeChatMessageEntity> allInserted = new java.util.ArrayList<>();
    for (int i = 0; i < 5; i++) {
      log.info("企业微信客服消息开始同步，tenantId={}，openKfid={}，page={}，cursorConfigured={}，syncTokenConfigured={}",
          tenantId, maskMiddle(message.openKfid()), i + 1, StringUtils.hasText(cursor), StringUtils.hasText(message.syncToken()));
      String payload = client.syncCustomerMessages(runtime, message.openKfid(), message.syncToken(), cursor, 100);
      EnterpriseWeChatMessageService.SyncedMessageBatch batch = messageService.parseSyncedMessages(payload);
      List<EnterpriseWeChatMessageService.SyncedCustomerMessage> enrichedMessages =
          enrichCustomerNames(runtime, batch.messages());
      List<EnterpriseWeChatMessageEntity> inserted = messageService.enqueueSyncedMessages(tenantId, enrichedMessages);
      allInserted.addAll(inserted);
      totalInserted += inserted.size();
      log.info("企业微信客服消息同步页完成，tenantId={}，openKfid={}，page={}，parsedCount={}，insertedCount={}，hasMore={}，nextCursorConfigured={}",
          tenantId, maskMiddle(message.openKfid()), i + 1, batch.messages().size(), inserted.size(), batch.hasMore(), StringUtils.hasText(batch.nextCursor()));
      cursor = batch.nextCursor();
      if (!batch.hasMore() || !StringUtils.hasText(cursor)) {
        break;
      }
    }
    log.info("企业微信客服消息同步完成，tenantId={}，openKfid={}，新增消息数={}",
        tenantId, maskMiddle(message.openKfid()), totalInserted);
    return allInserted;
  }

  private List<EnterpriseWeChatMessageService.SyncedCustomerMessage> enrichCustomerNames(
      EnterpriseWeChatConfigService.EnterpriseWeChatRuntimeConfig runtime,
      List<EnterpriseWeChatMessageService.SyncedCustomerMessage> messages) {
    if (messages == null || messages.isEmpty()) {
      return List.of();
    }
    try {
      Map<String, String> displayNames = client.fetchCustomerDisplayNames(
          runtime,
          messages.stream()
              .map(EnterpriseWeChatMessageService.SyncedCustomerMessage::customerId)
              .toList());
      if (displayNames.isEmpty()) {
        return messages;
      }
      return messages.stream()
          .map(message -> enrichCustomerName(message, displayNames))
          .toList();
    } catch (RuntimeException ex) {
      log.warn("企业微信客户名称查询失败，继续使用客户ID展示，原因={}", ex.getMessage(), ex);
      return messages;
    }
  }

  private EnterpriseWeChatMessageService.SyncedCustomerMessage enrichCustomerName(
      EnterpriseWeChatMessageService.SyncedCustomerMessage message,
      Map<String, String> displayNames) {
    String displayName = displayNames.get(message.customerId());
    if (!StringUtils.hasText(displayName)) {
      return message;
    }
    return new EnterpriseWeChatMessageService.SyncedCustomerMessage(
        message.messageId(),
        message.openKfid(),
        message.enterpriseUserId(),
        message.customerId(),
        displayName,
        message.messageType(),
        message.direction(),
        message.content(),
        message.receivedAt(),
        message.rawPayload());
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

  private Map<String, Object> toBridgeMessage(EnterpriseWeChatMessageEntity entity) {
    Map<String, Object> message = new HashMap<>();
    String contact = entity.getCustomerName() != null && !entity.getCustomerName().isBlank()
        ? entity.getCustomerName()
        : entity.getCustomerId();
    message.put("id", entity.getMessageId());
    message.put("messageId", entity.getMessageId());
    message.put("customerId", entity.getCustomerId());
    message.put("contact", contact);
    message.put("content", entity.getContent());
    message.put("type", entity.getMessageType());
    boolean isSelf = "OUT".equals(entity.getDirection());
    message.put("is_self", isSelf);
    message.put("trigger_reply", !isSelf);
    message.put("timestamp", entity.getReceivedAt() == null ? System.currentTimeMillis() : entity.getReceivedAt().toString());
    message.put("source", "enterprise");
    return message;
  }
}
