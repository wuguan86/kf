package com.shijie.transit.userapi.enterprisewechat;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.shijie.transit.common.db.entity.EnterpriseWeChatMessageEntity;
import com.shijie.transit.common.mapper.EnterpriseWeChatMessageMapper;
import com.shijie.transit.common.mapper.EnterpriseWeChatUserBindingMapper;
import java.time.Clock;
import java.util.List;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.apache.ibatis.session.Configuration;
import org.mockito.ArgumentCaptor;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;

class EnterpriseWeChatMessageServiceTest {
  @Test
  void parseWechatKfCallbackKeepsOpenKfidSeparateFromCustomerId() {
    EnterpriseWeChatMessageService service = new EnterpriseWeChatMessageService(null, null, Clock.systemUTC());
    String xml = """
        <xml>
          <ToUserName><![CDATA[ww-corp]]></ToUserName>
          <FromUserName><![CDATA[external-user-1]]></FromUserName>
          <OpenKfId><![CDATA[wk123]]></OpenKfId>
          <ServicerUserId><![CDATA[zhangsan]]></ServicerUserId>
          <MsgType><![CDATA[text]]></MsgType>
          <Content><![CDATA[你好]]></Content>
        </xml>
        """;

    EnterpriseWeChatCallbackMessage message = service.parseCallbackMessage(xml);

    assertEquals("zhangsan", message.enterpriseUserId());
    assertEquals("wk123", message.openKfid());
    assertEquals("external-user-1", message.customerId());
    assertEquals("你好", message.content());
  }

  @Test
  void parseWechatKfEventCallbackKeepsSyncTokenForPullingMessages() {
    EnterpriseWeChatMessageService service = new EnterpriseWeChatMessageService(null, null, Clock.systemUTC());
    String xml = """
        <xml>
          <ToUserName><![CDATA[ww-corp]]></ToUserName>
          <FromUserName><![CDATA[sys]]></FromUserName>
          <MsgType><![CDATA[event]]></MsgType>
          <Event><![CDATA[kf_msg_or_event]]></Event>
          <OpenKfId><![CDATA[wk123]]></OpenKfId>
          <Token><![CDATA[sync-token-1]]></Token>
        </xml>
        """;

    EnterpriseWeChatCallbackMessage message = service.parseCallbackMessage(xml);

    assertEquals("event", message.messageType());
    assertEquals("kf_msg_or_event", message.eventType());
    assertEquals("wk123", message.openKfid());
    assertEquals("sync-token-1", message.syncToken());
  }

  @Test
  void parseSyncedTextMessagesKeepsCustomerAndServicerIdentity() {
    EnterpriseWeChatMessageService service = new EnterpriseWeChatMessageService(null, null, Clock.systemUTC());
    String payload = """
        {
          "errcode": 0,
          "errmsg": "ok",
          "next_cursor": "cursor-2",
          "has_more": 0,
          "msg_list": [
            {
              "msgid": "msg-1",
              "open_kfid": "wk123",
              "external_userid": "external-user-1",
              "servicer_userid": "WuGuanZhong",
              "send_time": 1710000000,
              "origin": 3,
              "msgtype": "text",
              "text": { "content": "你好" }
            }
          ]
        }
        """;

    EnterpriseWeChatMessageService.SyncedMessageBatch batch = service.parseSyncedMessages(payload);

    assertEquals("cursor-2", batch.nextCursor());
    assertTrue(!batch.hasMore());
    List<EnterpriseWeChatMessageService.SyncedCustomerMessage> messages = batch.messages();
    assertEquals(1, messages.size());
    EnterpriseWeChatMessageService.SyncedCustomerMessage message = messages.get(0);
    assertEquals("msg-1", message.messageId());
    assertEquals("wk123", message.openKfid());
    assertEquals("external-user-1", message.customerId());
    assertEquals("WuGuanZhong", message.enterpriseUserId());
    assertEquals("text", message.messageType());
    assertEquals("你好", message.content());
  }

  @Test
  void parseSyncedMessagesKeepsServicerSentMessagesAsOutgoing() {
    EnterpriseWeChatMessageService service = new EnterpriseWeChatMessageService(null, null, Clock.systemUTC());
    String payload = """
        {
          "errcode": 0,
          "errmsg": "ok",
          "has_more": 0,
          "msg_list": [
            {
              "msgid": "customer-msg",
              "open_kfid": "wk123",
              "external_userid": "external-user-1",
              "servicer_userid": "WuGuanZhong",
              "origin": 3,
              "msgtype": "text",
              "text": { "content": "客户消息" }
            },
            {
              "msgid": "servicer-msg",
              "open_kfid": "wk123",
              "external_userid": "external-user-1",
              "servicer_userid": "WuGuanZhong",
              "origin": 4,
              "msgtype": "text",
              "text": { "content": "客服回复" }
            }
          ]
        }
        """;

    EnterpriseWeChatMessageService.SyncedMessageBatch batch = service.parseSyncedMessages(payload);

    assertEquals(2, batch.messages().size());
    assertEquals("customer-msg", batch.messages().get(0).messageId());
    assertEquals("IN", batch.messages().get(0).direction());
    assertEquals("servicer-msg", batch.messages().get(1).messageId());
    assertEquals("OUT", batch.messages().get(1).direction());
  }

  @Test
  void pollPendingAlsoQueriesProcessingInboundMessagesForRecovery() {
    TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new Configuration(), ""), EnterpriseWeChatMessageEntity.class);
    EnterpriseWeChatMessageMapper messageMapper = mock(EnterpriseWeChatMessageMapper.class);
    EnterpriseWeChatUserBindingMapper bindingMapper = mock(EnterpriseWeChatUserBindingMapper.class);
    when(messageMapper.selectList(any())).thenReturn(List.of());
    EnterpriseWeChatMessageService service = new EnterpriseWeChatMessageService(messageMapper, bindingMapper, Clock.systemUTC());

    service.pollPending(1L, 7L, 20);

    ArgumentCaptor<LambdaQueryWrapper<EnterpriseWeChatMessageEntity>> captor = ArgumentCaptor.forClass(LambdaQueryWrapper.class);
    verify(messageMapper).selectList(captor.capture());
    String sqlSegment = captor.getValue().getSqlSegment();
    String queryValues = captor.getValue().getParamNameValuePairs().values().toString();
    Assertions.assertTrue(sqlSegment.contains(" OR "), sqlSegment);
    Assertions.assertTrue(queryValues.contains("PROCESSING"), queryValues);
  }
}
