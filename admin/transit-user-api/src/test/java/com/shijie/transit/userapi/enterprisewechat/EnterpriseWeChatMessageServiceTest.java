package com.shijie.transit.userapi.enterprisewechat;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.time.Clock;
import org.junit.jupiter.api.Test;

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
}
