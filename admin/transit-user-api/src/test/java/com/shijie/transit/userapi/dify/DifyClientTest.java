package com.shijie.transit.userapi.dify;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.shijie.transit.common.web.TransitException;
import org.junit.jupiter.api.Test;

class DifyClientTest {

  @Test
  void resolveChatApiKeyUsesCustomerServiceKeyByDefault() {
    DifyProperties properties = new DifyProperties();
    properties.setChatApiKey(" customer-key ");
    properties.setSalesChatApiKey("sales-key");
    DifyClient client = new DifyClient(properties, new ObjectMapper());

    assertEquals("customer-key", client.resolveChatApiKey(null));
    assertEquals("customer-key", client.resolveChatApiKey("customer_service"));
  }

  @Test
  void resolveChatApiKeyUsesSalesKeyForSalesMode() {
    DifyProperties properties = new DifyProperties();
    properties.setChatApiKey("customer-key");
    properties.setSalesChatApiKey(" sales-key ");
    DifyClient client = new DifyClient(properties, new ObjectMapper());

    assertEquals("sales-key", client.resolveChatApiKey("sales"));
  }

  @Test
  void resolveChatApiKeyRejectsMissingSalesKey() {
    DifyProperties properties = new DifyProperties();
    properties.setChatApiKey("customer-key");
    DifyClient client = new DifyClient(properties, new ObjectMapper());

    TransitException ex = assertThrows(TransitException.class, () -> client.resolveChatApiKey("sales"));

    assertEquals("DIFY_SALES_CHAT_API_KEY 未配置", ex.getMessage());
  }

  @Test
  void uploadChatFileUsesSalesKeyForSalesMode() {
    DifyProperties properties = new DifyProperties();
    properties.setBaseUrl("http://127.0.0.1:1");
    properties.setChatApiKey("customer-key");
    DifyClient client = new DifyClient(properties, new ObjectMapper());

    TransitException ex = assertThrows(TransitException.class, () -> client.uploadChatFile(
        "user-1", "image.png", "image/png", new byte[] {1}, "sales"));

    assertEquals("DIFY_SALES_CHAT_API_KEY 未配置", ex.getMessage());
  }
}
