package com.shijie.transit.userapi.enterprisewechat;

import com.shijie.transit.common.db.entity.EnterpriseWeChatMessageEntity;
import com.shijie.transit.common.db.entity.EnterpriseWeChatUserBindingEntity;
import com.shijie.transit.common.security.TransitPrincipal;
import com.shijie.transit.common.web.Result;
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
      @RequestParam("msg_signature") String msgSignature,
      @RequestParam("timestamp") String timestamp,
      @RequestParam("nonce") String nonce,
      @RequestParam("echostr") String echostr) {
    EnterpriseWeChatConfigService.EnterpriseWeChatRuntimeConfig runtime = configService.getRuntimeConfig();
    return crypto.decrypt(runtime.token(), runtime.encodingAesKey(), runtime.corpId(), msgSignature, timestamp, nonce, echostr);
  }

  @PostMapping(value = "/callback", produces = MediaType.TEXT_PLAIN_VALUE)
  public String receive(
      @RequestHeader(value = "X-Tenant-Id", required = false, defaultValue = "1") long tenantId,
      @RequestParam("msg_signature") String msgSignature,
      @RequestParam("timestamp") String timestamp,
      @RequestParam("nonce") String nonce,
      @RequestBody String body) {
    EnterpriseWeChatConfigService.EnterpriseWeChatRuntimeConfig runtime = configService.getRuntimeConfig();
    String plain = crypto.decrypt(runtime.token(), runtime.encodingAesKey(), runtime.corpId(), msgSignature, timestamp, nonce, extractEncrypted(body));
    EnterpriseWeChatCallbackMessage message = messageService.parseCallbackMessage(plain);
    messageService.enqueueIncoming(
        tenantId,
        message.enterpriseUserId(),
        message.openKfid(),
        message.customerId(),
        message.customerName(),
        message.content(),
        message.messageType(),
        plain);
    return "success";
  }

  @GetMapping("/messages/poll")
  public Result<Map<String, Object>> poll(
      @RequestHeader("X-Tenant-Id") long tenantId,
      Authentication authentication,
      @RequestParam(value = "limit", defaultValue = "20") int limit) {
    TransitPrincipal principal = (TransitPrincipal) authentication.getPrincipal();
    List<Map<String, Object>> messages = messageService.pollPending(tenantId, principal.subjectId(), limit).stream()
        .map(this::toBridgeMessage)
        .toList();
    Map<String, Object> payload = new HashMap<>();
    payload.put("ok", true);
    payload.put("messages", messages);
    return Result.success(payload);
  }

  @PostMapping("/messages/send")
  public Result<Map<String, Object>> send(
      @RequestHeader("X-Tenant-Id") long tenantId,
      Authentication authentication,
      @RequestBody SendRequest request) {
    TransitPrincipal principal = (TransitPrincipal) authentication.getPrincipal();
    EnterpriseWeChatConfigService.EnterpriseWeChatRuntimeConfig runtime = configService.getRuntimeConfig();
    EnterpriseWeChatMessageEntity pendingMessage = messageService.findPendingForReply(tenantId, principal.subjectId(), request.messageId());
    if (pendingMessage == null) {
      throw new IllegalArgumentException("企业微信待回复消息不存在或已处理");
    }
    try {
      client.sendCustomerMessage(runtime, pendingMessage.getOpenKfid(), pendingMessage.getCustomerId(), request.content());
      messageService.markReplied(tenantId, principal.subjectId(), request.messageId(), null);
    } catch (RuntimeException ex) {
      String reason = ex.getMessage();
      messageService.markReplied(tenantId, principal.subjectId(), request.messageId(),
          StringUtils.hasText(reason) ? reason : "企业微信消息发送失败");
      log.warn("企业微信消息发送失败，messageId={}", request.messageId(), ex);
      throw ex;
    }
    Map<String, Object> payload = new HashMap<>();
    payload.put("ok", true);
    return Result.success(payload);
  }

  @GetMapping("/bindings")
  public Result<List<EnterpriseWeChatUserBindingEntity>> bindings(@RequestHeader("X-Tenant-Id") long tenantId) {
    return Result.<List<EnterpriseWeChatUserBindingEntity>>success(messageService.listBindings(tenantId));
  }

  private String extractEncrypted(String body) {
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
    return trimmed.substring(start + "<Encrypt>".length(), end).trim();
  }

  public record SendRequest(String messageId, String customerId, String content) {
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
    message.put("is_self", false);
    message.put("trigger_reply", true);
    message.put("timestamp", entity.getReceivedAt() == null ? System.currentTimeMillis() : entity.getReceivedAt().toString());
    message.put("source", "enterprise");
    return message;
  }
}
