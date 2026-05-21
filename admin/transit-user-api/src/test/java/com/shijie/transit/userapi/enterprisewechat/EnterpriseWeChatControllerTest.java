package com.shijie.transit.userapi.enterprisewechat;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

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
}
