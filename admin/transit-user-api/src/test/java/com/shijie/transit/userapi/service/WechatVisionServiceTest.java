package com.shijie.transit.userapi.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.shijie.transit.userapi.wechatvision.WechatVisionParseRequest;
import com.shijie.transit.userapi.wechatvision.WechatVisionParseResponse;
import com.shijie.transit.userapi.wechatvision.WechatVisionService;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class WechatVisionServiceTest {

  private final ObjectMapper objectMapper = new ObjectMapper();

  @Test
  void parseRejectsMissingDashScopeKeyBeforeCallingModel() {
    WechatVisionService service = createService(RestClient.builder(), "", "qwen-vl-plus");
    WechatVisionParseRequest request = new WechatVisionParseRequest(
        "data:image/png;base64,AAAA",
        "微信",
        "",
        "native");

    IllegalStateException error = assertThrows(IllegalStateException.class, () -> service.parse(request));

    assertEquals("微信视觉解析模型未配置", error.getMessage());
  }

  @Test
  void parseCallsDashScopeVisionModelAndReturnsMessages() {
    RestClient.Builder builder = RestClient.builder();
    MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
    server.expect(requestTo("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"))
        .andExpect(method(HttpMethod.POST))
        .andExpect(header("Authorization", "Bearer sk-test"))
        .andExpect(content().string(Matchers.containsString("\"model\":\"qwen-vl-plus\"")))
        .andExpect(content().string(Matchers.containsString("\"enable_thinking\":false")))
        .andExpect(content().string(Matchers.containsString("data:image/png;base64,AAAA")))
        .andRespond(withSuccess("""
            {
              "choices": [
                {
                  "message": {
                    "content": "{\\"contact\\":\\"张三\\",\\"messages\\":[{\\"content\\":\\"你好\\",\\"isSelf\\":false,\\"uiId\\":\\"msg-1\\",\\"type\\":\\"text\\",\\"confidence\\":0.92}],\\"changed\\":true}"
                  }
                }
              ]
            }
            """, MediaType.APPLICATION_JSON));
    WechatVisionService service = createService(builder, "sk-test", "qwen-vl-plus");

    WechatVisionParseResponse response = service.parse(new WechatVisionParseRequest(
        "data:image/png;base64,AAAA",
        "微信",
        "",
        "native"));

    assertEquals("张三", response.contact());
    assertEquals(true, response.changed());
    assertEquals(1, response.messages().size());
    assertEquals("你好", response.messages().get(0).content());
    assertEquals(false, response.messages().get(0).isSelf());
    assertEquals("msg-1", response.messages().get(0).uiId());
    server.verify();
  }

  @Test
  void parseStripsMarkdownFenceAndFiltersEmptyMessages() {
    RestClient.Builder builder = RestClient.builder();
    MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
    server.expect(requestTo("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"))
        .andRespond(withSuccess("""
            {
              "choices": [
                {
                  "message": {
                    "content": "```json\\n{\\"contact\\":\\"李四\\",\\"messages\\":[{\\"content\\":\\"\\",\\"isSelf\\":false,\\"uiId\\":\\"empty\\"},{\\"content\\":\\"收到\\",\\"isSelf\\":true,\\"uiId\\":\\"msg-2\\"}],\\"changed\\":true}\\n```"
                  }
                }
              ]
            }
            """, MediaType.APPLICATION_JSON));
    WechatVisionService service = createService(builder, "sk-test", "qwen-vl-plus");

    WechatVisionParseResponse response = service.parse(new WechatVisionParseRequest(
        "data:image/png;base64,BBBB",
        "微信",
        "",
        "native"));

    assertEquals("李四", response.contact());
    assertEquals(1, response.messages().size());
    assertEquals("收到", response.messages().get(0).content());
    assertEquals(true, response.messages().get(0).isSelf());
    server.verify();
  }

  @Test
  void parseRejectsNonJsonModelOutput() {
    RestClient.Builder builder = RestClient.builder();
    MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
    server.expect(requestTo("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"))
        .andRespond(withSuccess("""
            {"choices":[{"message":{"content":"我看到了聊天窗口"}}]}
            """, MediaType.APPLICATION_JSON));
    WechatVisionService service = createService(builder, "sk-test", "qwen-vl-plus");

    IllegalArgumentException error = assertThrows(
        IllegalArgumentException.class,
        () -> service.parse(new WechatVisionParseRequest("data:image/png;base64,CCCC", "微信", "", "native")));

    assertEquals("微信视觉解析结果不是有效 JSON", error.getMessage());
    server.verify();
  }

  private WechatVisionService createService(RestClient.Builder builder, String apiKey, String model) {
    return new WechatVisionService(
        objectMapper,
        builder,
        apiKey,
        "https://dashscope.aliyuncs.com",
        model);
  }
}
