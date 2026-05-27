package com.shijie.transit.userapi.enterprisewechat;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.shijie.transit.common.db.entity.EnterpriseWeChatMessageEntity;
import com.shijie.transit.common.db.entity.EnterpriseWeChatUserBindingEntity;
import com.shijie.transit.common.security.TransitPrincipal;
import com.shijie.transit.common.web.TransitException;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;

class EnterpriseWeChatControllerTest {

  @Test
  void extractEncryptedRemovesXmlCdataWrapper() {
    EnterpriseWeChatController controller = new EnterpriseWeChatController(null, null, null, null);
    String body = """
        <xml>
          <ToUserName><![CDATA[ww-test]]></ToUserName>
          <Encrypt><![CDATA[encrypted-payload]]></Encrypt>
          <AgentID><![CDATA[1000002]]></AgentID>
        </xml>
        """;

    String encrypted = controller.extractEncrypted(body);

    assertEquals("encrypted-payload", encrypted);
  }

  @Test
  void pollTransfersEnterpriseWechatSessionToManualServicerInSemiManagedMode() {
    FakeEnterpriseWeChatConfigService configService = new FakeEnterpriseWeChatConfigService();
    FakeEnterpriseWeChatMessageService messageService = new FakeEnterpriseWeChatMessageService();
    RecordingEnterpriseWeChatClient client = new RecordingEnterpriseWeChatClient();
    EnterpriseWeChatController controller = new EnterpriseWeChatController(configService, null, messageService, client);
    EnterpriseWeChatMessageEntity message = new EnterpriseWeChatMessageEntity();
    message.setMessageId("msg-1");
    message.setOwnerUserId(7L);
    message.setDirection("IN");
    message.setOpenKfid("wk123");
    message.setCustomerId("external-user-1");
    message.setContent("你好");
    message.setMessageType("text");
    EnterpriseWeChatUserBindingEntity binding = new EnterpriseWeChatUserBindingEntity();
    binding.setEnterpriseUserId("servicer-1");
    binding.setStatus("ENABLED");
    messageService.messages = List.of(message);
    messageService.binding = binding;
    UsernamePasswordAuthenticationToken authentication =
        new UsernamePasswordAuthenticationToken(new TransitPrincipal(7L, 1L, "USER"), null);

    controller.poll(1L, authentication, 20, "semi");

    assertEquals(configService.runtime, client.runtime);
    assertEquals("wk123", client.openKfid);
    assertEquals("external-user-1", client.externalUserId);
    assertEquals("servicer-1", client.servicerUserId);
  }

  @Test
  void pollDoesNotTransferEnterpriseWechatSessionInFullManagedMode() {
    FakeEnterpriseWeChatConfigService configService = new FakeEnterpriseWeChatConfigService();
    FakeEnterpriseWeChatMessageService messageService = new FakeEnterpriseWeChatMessageService();
    RecordingEnterpriseWeChatClient client = new RecordingEnterpriseWeChatClient();
    EnterpriseWeChatController controller = new EnterpriseWeChatController(configService, null, messageService, client);
    EnterpriseWeChatMessageEntity message = new EnterpriseWeChatMessageEntity();
    message.setMessageId("msg-1");
    message.setOwnerUserId(7L);
    message.setDirection("IN");
    message.setOpenKfid("wk123");
    message.setCustomerId("external-user-1");
    message.setContent("你好");
    message.setMessageType("text");
    messageService.messages = List.of(message);
    UsernamePasswordAuthenticationToken authentication =
        new UsernamePasswordAuthenticationToken(new TransitPrincipal(7L, 1L, "USER"), null);

    controller.poll(1L, authentication, 20, "full");

    assertNull(client.openKfid);
  }

  @Test
  void pollReturnsProcessingCustomerMessageToAvoidLosingFirstSemiManagedMessage() {
    FakeEnterpriseWeChatConfigService configService = new FakeEnterpriseWeChatConfigService();
    FakeEnterpriseWeChatMessageService messageService = new FakeEnterpriseWeChatMessageService();
    RecordingEnterpriseWeChatClient client = new RecordingEnterpriseWeChatClient();
    EnterpriseWeChatController controller = new EnterpriseWeChatController(configService, null, messageService, client);
    EnterpriseWeChatMessageEntity message = new EnterpriseWeChatMessageEntity();
    message.setMessageId("msg-processing");
    message.setOwnerUserId(7L);
    message.setDirection("IN");
    message.setStatus("PROCESSING");
    message.setOpenKfid("wk123");
    message.setCustomerId("external-user-1");
    message.setCustomerName("暗夜");
    message.setContent("付费的");
    message.setMessageType("text");
    messageService.messages = List.of(message);
    EnterpriseWeChatUserBindingEntity binding = new EnterpriseWeChatUserBindingEntity();
    binding.setEnterpriseUserId("servicer-1");
    binding.setStatus("ENABLED");
    messageService.binding = binding;
    UsernamePasswordAuthenticationToken authentication =
        new UsernamePasswordAuthenticationToken(new TransitPrincipal(7L, 1L, "USER"), null);

    Map<String, Object> payload = controller.poll(1L, authentication, 20, "semi").getData();
    List<?> messages = (List<?>) payload.get("messages");
    Map<?, ?> bridgeMessage = (Map<?, ?>) messages.get(0);

    assertEquals("付费的", bridgeMessage.get("content"));
    assertEquals("暗夜", bridgeMessage.get("contact"));
  }

  @Test
  void callbackTransfersFirstSyncedCustomerMessageWhenSemiManagedModeIsEnabled() {
    FakeEnterpriseWeChatConfigService configService = new FakeEnterpriseWeChatConfigService();
    configService.managedMode = "semi";
    FakeEnterpriseWeChatMessageService messageService = new FakeEnterpriseWeChatMessageService();
    RecordingEnterpriseWeChatClient client = new RecordingEnterpriseWeChatClient();
    EnterpriseWeChatController controller =
        new EnterpriseWeChatController(configService, new PassthroughEnterpriseWeChatCrypto(), messageService, client);
    EnterpriseWeChatUserBindingEntity binding = new EnterpriseWeChatUserBindingEntity();
    binding.setEnterpriseUserId("servicer-1");
    binding.setStatus("ENABLED");
    messageService.binding = binding;
    client.syncPayload = """
        {
          "errcode": 0,
          "errmsg": "ok",
          "has_more": 0,
          "msg_list": [
            {
              "msgid": "customer-msg-1",
              "open_kfid": "wk123",
              "external_userid": "external-user-1",
              "servicer_userid": "servicer-1",
              "origin": 3,
              "msgtype": "text",
              "text": { "content": "在不在" }
            }
          ]
        }
        """;
    client.customerDisplayNames = Map.of("external-user-1", "暗夜");
    String callbackPlainText = """
        <xml>
          <MsgType><![CDATA[event]]></MsgType>
          <Event><![CDATA[kf_msg_or_event]]></Event>
          <OpenKfId><![CDATA[wk123]]></OpenKfId>
          <Token><![CDATA[sync-token-1]]></Token>
        </xml>
        """;

    controller.receive(1L, "signature", "1", "nonce", callbackPlainText);

    assertEquals(configService.runtime, client.runtime);
    assertEquals("wk123", client.openKfid);
    assertEquals("external-user-1", client.externalUserId);
    assertEquals("servicer-1", client.servicerUserId);
    assertEquals("暗夜", messageService.insertedMessages.get(0).getCustomerName());
  }

  @Test
  void sendAutoReplyWhenEnterpriseWechatSessionAllowsApiReply() {
    FakeEnterpriseWeChatConfigService configService = new FakeEnterpriseWeChatConfigService();
    FakeEnterpriseWeChatMessageService messageService = new FakeEnterpriseWeChatMessageService();
    RecordingEnterpriseWeChatClient client = new RecordingEnterpriseWeChatClient();
    EnterpriseWeChatController controller = new EnterpriseWeChatController(configService, null, messageService, client);
    EnterpriseWeChatMessageEntity message = new EnterpriseWeChatMessageEntity();
    message.setMessageId("msg-1");
    message.setOwnerUserId(7L);
    message.setDirection("IN");
    message.setOpenKfid("wk123");
    message.setCustomerId("external-user-1");
    message.setContent("在不在");
    message.setMessageType("text");
    messageService.repliableMessage = message;
    UsernamePasswordAuthenticationToken authentication =
        new UsernamePasswordAuthenticationToken(new TransitPrincipal(7L, 1L, "USER"), null);

    controller.send(1L, authentication, new EnterpriseWeChatController.SendRequest("msg-1", "external-user-1", "AI回复"));

    assertEquals(configService.runtime, client.runtime);
    assertEquals("wk123", client.openKfid);
    assertEquals("external-user-1", client.externalUserId);
    assertEquals(1, client.lastReadServiceState);
    assertNull(client.servicerUserId);
    assertEquals("AI回复", client.sentText);
    assertEquals("msg-1", messageService.repliedMessageId);
    assertNull(messageService.failReason);
  }

  @Test
  void sendAutoReplyUsesSendApiEvenWhenServiceStateLooksManual() {
    FakeEnterpriseWeChatConfigService configService = new FakeEnterpriseWeChatConfigService();
    FakeEnterpriseWeChatMessageService messageService = new FakeEnterpriseWeChatMessageService();
    RecordingEnterpriseWeChatClient client = new RecordingEnterpriseWeChatClient();
    client.currentServiceState = 3;
    client.currentServicerUserId = "servicer-1";
    EnterpriseWeChatController controller = new EnterpriseWeChatController(configService, null, messageService, client);
    EnterpriseWeChatMessageEntity message = new EnterpriseWeChatMessageEntity();
    message.setMessageId("msg-1");
    message.setOwnerUserId(7L);
    message.setDirection("IN");
    message.setOpenKfid("wk123");
    message.setCustomerId("external-user-1");
    messageService.repliableMessage = message;
    UsernamePasswordAuthenticationToken authentication =
        new UsernamePasswordAuthenticationToken(new TransitPrincipal(7L, 1L, "USER"), null);

    controller.send(1L, authentication, new EnterpriseWeChatController.SendRequest("msg-1", "external-user-1", "AI回复"));

    assertEquals("AI回复", client.sentText);
    assertEquals("msg-1", messageService.repliedMessageId);
    assertNull(messageService.failReason);
  }

  @Test
  void sendAutoReplyReturnsEnterpriseWechatFailureReason() {
    FakeEnterpriseWeChatConfigService configService = new FakeEnterpriseWeChatConfigService();
    FakeEnterpriseWeChatMessageService messageService = new FakeEnterpriseWeChatMessageService();
    RecordingEnterpriseWeChatClient client = new RecordingEnterpriseWeChatClient();
    client.sendFailureReason = "企业微信消息发送失败: {errcode=95000, errmsg=invalid open_kfid}";
    EnterpriseWeChatController controller = new EnterpriseWeChatController(configService, null, messageService, client);
    EnterpriseWeChatMessageEntity message = new EnterpriseWeChatMessageEntity();
    message.setMessageId("msg-1");
    message.setOwnerUserId(7L);
    message.setDirection("IN");
    message.setOpenKfid("wk123");
    message.setCustomerId("external-user-1");
    messageService.repliableMessage = message;
    UsernamePasswordAuthenticationToken authentication =
        new UsernamePasswordAuthenticationToken(new TransitPrincipal(7L, 1L, "USER"), null);

    TransitException ex = assertThrows(
        TransitException.class,
        () -> controller.send(1L, authentication, new EnterpriseWeChatController.SendRequest("msg-1", "external-user-1", "AI回复")));

    assertTrue(ex.getMessage().contains("errcode=95000"));
    assertEquals("msg-1", messageService.repliedMessageId);
    assertTrue(messageService.failReason.contains("errcode=95000"));
  }

  @Test
  void sendAutoReplyRetriesAfterTransferringToSmartReceptionWhenSessionStatusInvalid() {
    FakeEnterpriseWeChatConfigService configService = new FakeEnterpriseWeChatConfigService();
    FakeEnterpriseWeChatMessageService messageService = new FakeEnterpriseWeChatMessageService();
    RecordingEnterpriseWeChatClient client = new RecordingEnterpriseWeChatClient();
    client.currentServiceState = 3;
    client.currentServicerUserId = "servicer-1";
    client.firstSendFailureReason = "企业微信消息发送失败: {errcode=95018, errmsg=send msg session status invalid}";
    client.nextTransferMessageCode = "MSG_CODE_END";
    EnterpriseWeChatController controller = new EnterpriseWeChatController(configService, null, messageService, client);
    EnterpriseWeChatMessageEntity message = new EnterpriseWeChatMessageEntity();
    message.setMessageId("msg-1");
    message.setOwnerUserId(7L);
    message.setDirection("IN");
    message.setOpenKfid("wk123");
    message.setCustomerId("external-user-1");
    messageService.repliableMessage = message;
    UsernamePasswordAuthenticationToken authentication =
        new UsernamePasswordAuthenticationToken(new TransitPrincipal(7L, 1L, "USER"), null);

    controller.send(1L, authentication, new EnterpriseWeChatController.SendRequest("msg-1", "external-user-1", "AI回复"));

    assertEquals(1, client.sendAttempts);
    assertEquals(4, client.serviceState);
    assertEquals("MSG_CODE_END", client.eventMessageCode);
    assertEquals("AI回复", client.sentEventText);
    assertEquals("msg-1", messageService.repliedMessageId);
    assertNull(messageService.failReason);
  }

  @Test
  void releaseManualSessionsEndsManualReceptionWhenSwitchingToFullManagedMode() {
    FakeEnterpriseWeChatConfigService configService = new FakeEnterpriseWeChatConfigService();
    FakeEnterpriseWeChatMessageService messageService = new FakeEnterpriseWeChatMessageService();
    RecordingEnterpriseWeChatClient client = new RecordingEnterpriseWeChatClient();
    client.currentServiceState = 3;
    client.currentServicerUserId = "servicer-1";
    EnterpriseWeChatController controller = new EnterpriseWeChatController(configService, null, messageService, client);
    EnterpriseWeChatMessageEntity message = new EnterpriseWeChatMessageEntity();
    message.setMessageId("msg-1");
    message.setOwnerUserId(7L);
    message.setDirection("IN");
    message.setOpenKfid("wk123");
    message.setCustomerId("external-user-1");
    message.setReceivedAt(LocalDateTime.now());
    messageService.sessionsForRelease = List.of(message);
    UsernamePasswordAuthenticationToken authentication =
        new UsernamePasswordAuthenticationToken(new TransitPrincipal(7L, 1L, "USER"), null);

    Map<String, Object> payload = controller.releaseManualSessions(
        1L,
        authentication,
        new EnterpriseWeChatController.ReleaseManualSessionsRequest(List.of("external-user-1"))).getData();

    assertEquals(1, payload.get("releasedCount"));
    assertEquals("wk123", client.openKfid);
    assertEquals("external-user-1", client.externalUserId);
    assertEquals(4, client.serviceState);
    assertNull(client.servicerUserId);
  }

  private static class FakeEnterpriseWeChatConfigService extends EnterpriseWeChatConfigService {
    private final EnterpriseWeChatRuntimeConfig runtime =
        new EnterpriseWeChatRuntimeConfig("corp", "secret", "token", "aes", "https://qyapi.weixin.qq.com");
    private String managedMode = "full";

    FakeEnterpriseWeChatConfigService() {
      super(null, null);
    }

    @Override
    public EnterpriseWeChatRuntimeConfig getRuntimeConfig(long tenantId) {
      return runtime;
    }

    @Override
    public String getManagedMode(long tenantId) {
      return managedMode;
    }
  }

  private static class FakeEnterpriseWeChatMessageService extends EnterpriseWeChatMessageService {
    private List<EnterpriseWeChatMessageEntity> messages = List.of();
    private List<EnterpriseWeChatMessageEntity> insertedMessages = List.of();
    private List<EnterpriseWeChatMessageEntity> sessionsForRelease = List.of();
    private EnterpriseWeChatMessageEntity repliableMessage;
    private EnterpriseWeChatUserBindingEntity binding;
    private String repliedMessageId;
    private String failReason;

    FakeEnterpriseWeChatMessageService() {
      super(null, null, Clock.systemUTC());
    }

    @Override
    public List<EnterpriseWeChatMessageEntity> pollPending(long tenantId, long userId, int limit) {
      return messages;
    }

    @Override
    public EnterpriseWeChatUserBindingEntity getMyBinding(long tenantId, long userId) {
      return binding;
    }

    @Override
    public List<EnterpriseWeChatMessageEntity> enqueueSyncedMessages(long tenantId, List<SyncedCustomerMessage> messages) {
      insertedMessages = messages.stream().map(message -> {
        EnterpriseWeChatMessageEntity entity = new EnterpriseWeChatMessageEntity();
        entity.setTenantId(tenantId);
        entity.setMessageId(message.messageId());
        entity.setOwnerUserId(7L);
        entity.setDirection(message.direction());
        entity.setOpenKfid(message.openKfid());
        entity.setCustomerId(message.customerId());
        entity.setCustomerName(message.customerName());
        entity.setContent(message.content());
        entity.setMessageType(message.messageType());
        return entity;
      }).toList();
      return insertedMessages;
    }

    @Override
    public EnterpriseWeChatMessageEntity findPendingForReply(long tenantId, long userId, String messageId) {
      if (repliableMessage != null && repliableMessage.getMessageId().equals(messageId)) {
        return repliableMessage;
      }
      return null;
    }

    @Override
    public void markReplied(long tenantId, long userId, String messageId, String failReason) {
      this.repliedMessageId = messageId;
      this.failReason = failReason;
    }

    @Override
    public List<EnterpriseWeChatMessageEntity> listRecentSessionsForModeSwitch(
        long tenantId,
        long userId,
        List<String> customerIds,
        int limit) {
      return sessionsForRelease;
    }
  }

  private static class RecordingEnterpriseWeChatClient extends EnterpriseWeChatClient {
    private EnterpriseWeChatConfigService.EnterpriseWeChatRuntimeConfig runtime;
    private String openKfid;
    private String externalUserId;
    private String servicerUserId;
    private Integer serviceState;
    private int currentServiceState = 1;
    private int lastReadServiceState;
    private String currentServicerUserId = "";
    private String sentText;
    private String sentEventText;
    private String eventMessageCode;
    private String sendFailureReason;
    private String firstSendFailureReason;
    private String nextTransferMessageCode = "";
    private int sendAttempts;
    private Map<String, String> customerDisplayNames = Map.of();
    private String syncPayload = """
        {
          "errcode": 0,
          "errmsg": "ok",
          "has_more": 0,
          "msg_list": []
        }
        """;

    RecordingEnterpriseWeChatClient() {
      super(new ObjectMapper(), Clock.systemUTC());
    }

    @Override
    public void transferCustomerServiceState(
        EnterpriseWeChatConfigService.EnterpriseWeChatRuntimeConfig config,
        String openKfid,
        String externalUserId,
        String servicerUserId) {
      this.runtime = config;
      this.openKfid = openKfid;
      this.externalUserId = externalUserId;
      this.servicerUserId = servicerUserId;
      this.serviceState = 3;
    }

    @Override
    public void transferCustomerServiceState(
        EnterpriseWeChatConfigService.EnterpriseWeChatRuntimeConfig config,
        String openKfid,
        String externalUserId,
        int serviceState,
        String servicerUserId) {
      this.runtime = config;
      this.openKfid = openKfid;
      this.externalUserId = externalUserId;
      this.serviceState = serviceState;
      this.servicerUserId = servicerUserId;
    }

    @Override
    public String transferCustomerServiceStateAndGetMessageCode(
        EnterpriseWeChatConfigService.EnterpriseWeChatRuntimeConfig config,
        String openKfid,
        String externalUserId,
        int serviceState,
        String servicerUserId) {
      transferCustomerServiceState(config, openKfid, externalUserId, serviceState, servicerUserId);
      return nextTransferMessageCode;
    }

    @Override
    public EnterpriseWeChatClient.CustomerServiceState getCustomerServiceState(
        EnterpriseWeChatConfigService.EnterpriseWeChatRuntimeConfig config,
        String openKfid,
        String externalUserId) {
      this.runtime = config;
      this.openKfid = openKfid;
      this.externalUserId = externalUserId;
      this.lastReadServiceState = currentServiceState;
      return new EnterpriseWeChatClient.CustomerServiceState(currentServiceState, currentServicerUserId);
    }

    @Override
    public void sendCustomerMessage(
        EnterpriseWeChatConfigService.EnterpriseWeChatRuntimeConfig config,
        String openKfid,
        String externalUserId,
        String text) {
      sendAttempts++;
      if (sendAttempts == 1 && firstSendFailureReason != null) {
        throw new IllegalStateException(firstSendFailureReason);
      }
      if (sendFailureReason != null) {
        throw new IllegalStateException(sendFailureReason);
      }
      this.runtime = config;
      this.openKfid = openKfid;
      this.externalUserId = externalUserId;
      this.sentText = text;
    }

    @Override
    public void sendCustomerEventMessage(
        EnterpriseWeChatConfigService.EnterpriseWeChatRuntimeConfig config,
        String messageCode,
        String text) {
      this.runtime = config;
      this.eventMessageCode = messageCode;
      this.sentEventText = text;
    }

    @Override
    public String syncCustomerMessages(
        EnterpriseWeChatConfigService.EnterpriseWeChatRuntimeConfig config,
        String openKfid,
        String syncToken,
        String cursor,
        int limit) {
      return syncPayload;
    }

    @Override
    public Map<String, String> fetchCustomerDisplayNames(
        EnterpriseWeChatConfigService.EnterpriseWeChatRuntimeConfig config,
        List<String> externalUserIds) {
      return customerDisplayNames;
    }
  }

  private static class PassthroughEnterpriseWeChatCrypto extends EnterpriseWeChatCrypto {
    PassthroughEnterpriseWeChatCrypto() {
      super(Clock.systemUTC());
    }

    @Override
    public String decrypt(
        String token,
        String encodingAesKey,
        String corpId,
        String signature,
        String timestamp,
        String nonce,
        String encrypted) {
      return encrypted;
    }
  }
}
