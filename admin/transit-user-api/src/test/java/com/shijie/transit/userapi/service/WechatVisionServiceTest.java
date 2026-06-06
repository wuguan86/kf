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
        "native",
        "CHAT");

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
        .andExpect(content().string(Matchers.containsString("只输出候选消息")))
        .andExpect(content().string(Matchers.containsString("最终归属和图片可信度会由客户端本地视觉守卫复核")))
        .andExpect(content().string(Matchers.containsString("messages 必须严格按聊天气泡在截图中的视觉顺序输出：从上到下，也就是从旧到新。")))
        .andExpect(content().string(Matchers.containsString("最底部可见聊天气泡必须是 messages 的最后一项。")))
        .andRespond(withSuccess("""
            {
              "choices": [
                {
                  "message": {
                    "content": "{\\"contact\\":\\"张三\\",\\"messages\\":[{\\"content\\":\\"你好\\",\\"isSelf\\":false,\\"uiId\\":\\"msg-1\\",\\"type\\":\\"text\\",\\"confidence\\":0.92}],\\"changed\\":true,\\"conversationType\\":\\"SINGLE\\",\\"accountCategory\\":\\"NORMAL\\",\\"confidence\\":0.88}"
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
        "native",
        "CHAT"));

    assertEquals("张三", response.contact());
    assertEquals(true, response.changed());
    assertEquals(1, response.messages().size());
    assertEquals("你好", response.messages().get(0).content());
    assertEquals(false, response.messages().get(0).isSelf());
    assertEquals("msg-1", response.messages().get(0).uiId());
    assertEquals("SINGLE", response.conversationType());
    assertEquals("NORMAL", response.accountCategory());
    assertEquals(false, response.skipAutoReply());
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
                    "content": "```json\\n{\\"contact\\":\\"李四\\",\\"messages\\":[{\\"content\\":\\"\\",\\"isSelf\\":false,\\"uiId\\":\\"empty\\"},{\\"content\\":\\"收到\\",\\"isSelf\\":true,\\"uiId\\":\\"msg-2\\"}],\\"changed\\":true,\\"conversationType\\":\\"SINGLE\\",\\"accountCategory\\":\\"UNKNOWN\\"}\\n```"
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
        "native",
        "CHAT"));

    assertEquals("李四", response.contact());
    assertEquals(1, response.messages().size());
    assertEquals("收到", response.messages().get(0).content());
    assertEquals(true, response.messages().get(0).isSelf());
    server.verify();
  }

  @Test
  void parseKeepsImageMessageTypeAndBounds() {
    RestClient.Builder builder = RestClient.builder();
    MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
    server.expect(requestTo("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"))
        .andExpect(content().string(Matchers.containsString("type=image")))
        .andExpect(content().string(Matchers.containsString("type=text、type=image 或 type=sticker 都必须输出 bounds")))
        .andRespond(withSuccess("""
            {
              "choices": [
                {
                  "message": {
                    "content": "{\\"contact\\":\\"图片客户\\",\\"messages\\":[{\\"content\\":\\"[图片]\\",\\"isSelf\\":false,\\"uiId\\":\\"image-1\\",\\"type\\":\\"image\\",\\"bounds\\":{\\"x\\":120,\\"y\\":220,\\"w\\":180,\\"h\\":120},\\"confidence\\":0.91}],\\"changed\\":true,\\"conversationType\\":\\"SINGLE\\",\\"accountCategory\\":\\"NORMAL\\"}"
                  }
                }
              ]
            }
            """, MediaType.APPLICATION_JSON));
    WechatVisionService service = createService(builder, "sk-test", "qwen-vl-plus");

    WechatVisionParseResponse response = service.parse(new WechatVisionParseRequest(
        "data:image/png;base64,IMAGE",
        "微信",
        "",
        "native",
        "CHAT"));

    assertEquals(1, response.messages().size());
    assertEquals("[图片]", response.messages().get(0).content());
    assertEquals("image", response.messages().get(0).type());
    assertEquals(120D, response.messages().get(0).bounds().x());
    assertEquals(220D, response.messages().get(0).bounds().y());
    assertEquals(180D, response.messages().get(0).bounds().w());
    assertEquals(120D, response.messages().get(0).bounds().h());
    server.verify();
  }

  @Test
  void parseFiltersSelfRecallSystemNotice() {
    RestClient.Builder builder = RestClient.builder();
    MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
    server.expect(requestTo("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"))
        .andRespond(withSuccess("""
            {
              "choices": [
                {
                  "message": {
                    "content": "{\\"contact\\":\\"夏天\\",\\"messages\\":[{\\"content\\":\\"还得老板开明\\",\\"isSelf\\":false,\\"uiId\\":\\"msg-1\\"},{\\"content\\":\\"你撤回了一条消息\\",\\"isSelf\\":false,\\"uiId\\":\\"msg-recall\\"},{\\"content\\":\\"也是 老板不卡人 我才能准点撤 😂\\",\\"isSelf\\":true,\\"uiId\\":\\"msg-2\\"}],\\"changed\\":true,\\"conversationType\\":\\"SINGLE\\",\\"accountCategory\\":\\"NORMAL\\"}"
                  }
                }
              ]
            }
            """, MediaType.APPLICATION_JSON));
    WechatVisionService service = createService(builder, "sk-test", "qwen-vl-plus");

    WechatVisionParseResponse response = service.parse(new WechatVisionParseRequest(
        "data:image/png;base64,RECALL",
        "微信",
        "",
        "native",
        "CHAT"));

    assertEquals("夏天", response.contact());
    assertEquals(2, response.messages().size());
    assertEquals("还得老板开明", response.messages().get(0).content());
    assertEquals("也是 老板不卡人 我才能准点撤 😂", response.messages().get(1).content());
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
        () -> service.parse(new WechatVisionParseRequest("data:image/png;base64,CCCC", "微信", "", "native", "CHAT")));

    assertEquals("微信视觉解析结果不是有效 JSON", error.getMessage());
    server.verify();
  }

  @Test
  void parseMarksSpecialConversationAsSkip() {
    RestClient.Builder builder = RestClient.builder();
    MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
    server.expect(requestTo("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"))
        .andRespond(withSuccess("""
            {
              "choices": [
                {
                  "message": {
                    "content": "{\\"contact\\":\\"文件传输助手\\",\\"messages\\":[],\\"changed\\":true,\\"conversationType\\":\\"SYSTEM\\",\\"accountCategory\\":\\"FILE_HELPER\\",\\"confidence\\":0.95}"
                  }
                }
              ]
            }
            """, MediaType.APPLICATION_JSON));
    WechatVisionService service = createService(builder, "sk-test", "qwen-vl-plus");

    WechatVisionParseResponse response = service.parse(new WechatVisionParseRequest(
        "data:image/png;base64,DDDD",
        "微信",
        "",
        "native",
        "CONVERSATION_LIST"));

    assertEquals("FILE_HELPER", response.accountCategory());
    assertEquals("SYSTEM", response.conversationType());
    assertEquals(true, response.skipAutoReply());
    assertEquals("命中文件传输助手固定过滤规则", response.skipReason());
    server.verify();
  }

  @Test
  void parseMarksCustomerServiceConversationAsSkip() {
    RestClient.Builder builder = RestClient.builder();
    MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
    server.expect(requestTo("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"))
        .andRespond(withSuccess("""
            {
              "choices": [
                {
                  "message": {
                    "content": "{\\"contact\\":\\"客服消息\\",\\"messages\\":[{\\"content\\":\\"个人系统开发测试客服: 来了\\",\\"isSelf\\":false,\\"uiId\\":\\"msg-1\\"}],\\"changed\\":true,\\"conversationType\\":\\"SINGLE\\",\\"accountCategory\\":\\"UNKNOWN\\",\\"confidence\\":0.7}"
                  }
                }
              ]
            }
            """, MediaType.APPLICATION_JSON));
    WechatVisionService service = createService(builder, "sk-test", "qwen-vl-plus");

    WechatVisionParseResponse response = service.parse(new WechatVisionParseRequest(
        "data:image/png;base64,EEEE",
        "微信",
        "",
        "native",
        "CHAT"));

    assertEquals("CUSTOMER_SERVICE", response.accountCategory());
    assertEquals(true, response.skipAutoReply());
    assertEquals("命中客服消息固定过滤规则", response.skipReason());
    server.verify();
  }

  @Test
  void parseMarketingMomentsKeepsCandidatesAndActionPoints() {
    RestClient.Builder builder = RestClient.builder();
    MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
    server.expect(requestTo("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"))
        .andExpect(content().string(Matchers.containsString("MARKETING_MOMENTS")))
        .andExpect(content().string(Matchers.containsString("朋友圈")))
        .andRespond(withSuccess("""
            {
              "choices": [
                {
                  "message": {
                    "content": "{\\"contact\\":\\"朋友圈\\",\\"messages\\":[],\\"moments\\":[{\\"author\\":\\"客户A\\",\\"content\\":\\"今天新品到店\\",\\"postBounds\\":{\\"x\\":180,\\"y\\":120,\\"w\\":520,\\"h\\":180},\\"likePoint\\":{\\"x\\":650,\\"y\\":270},\\"commentPoint\\":{\\"x\\":690,\\"y\\":270},\\"confidence\\":0.93}],\\"changed\\":true,\\"conversationType\\":\\"SYSTEM\\",\\"accountCategory\\":\\"NORMAL\\",\\"confidence\\":0.9}"
                  }
                }
              ]
            }
            """, MediaType.APPLICATION_JSON));
    WechatVisionService service = createService(builder, "sk-test", "qwen-vl-plus");

    WechatVisionParseResponse response = service.parse(new WechatVisionParseRequest(
        "data:image/png;base64,MOMENTS",
        "微信",
        "",
        "native-personal",
        "MARKETING_MOMENTS"));

    assertEquals("朋友圈", response.contact());
    assertEquals(0, response.messages().size());
    assertEquals(1, response.moments().size());
    assertEquals("客户A", response.moments().get(0).author());
    assertEquals("今天新品到店", response.moments().get(0).content());
    assertEquals(180D, response.moments().get(0).postBounds().x());
    assertEquals(650D, response.moments().get(0).likePoint().x());
    assertEquals(270D, response.moments().get(0).likePoint().y());
    assertEquals(690D, response.moments().get(0).commentPoint().x());
    assertEquals(0.93D, response.moments().get(0).confidence());
    server.verify();
  }

  @Test
  void parseMarketingMomentsKeepsSemanticLikeFields() {
    RestClient.Builder builder = RestClient.builder();
    MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
    server.expect(requestTo("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"))
        .andExpect(content().string(Matchers.containsString("MARKETING_MOMENTS")))
        .andRespond(withSuccess("""
            {
              "choices": [
                {
                  "message": {
                    "content": "{\\"contact\\":\\"Moments\\",\\"messages\\":[],\\"moments\\":[{\\"author\\":\\"Alice\\",\\"content\\":\\"new product\\",\\"visualIndex\\":1,\\"suitableForLike\\":true,\\"verticalRange\\":{\\"y\\":120,\\"h\\":180},\\"confidence\\":0.93}],\\"changed\\":true,\\"conversationType\\":\\"SYSTEM\\",\\"accountCategory\\":\\"NORMAL\\",\\"confidence\\":0.9}"
                  }
                }
              ]
            }
            """, MediaType.APPLICATION_JSON));
    WechatVisionService service = createService(builder, "sk-test", "qwen-vl-plus");

    WechatVisionParseResponse response = service.parse(new WechatVisionParseRequest(
        "data:image/png;base64,MOMENTS",
        "微信",
        "",
        "native-personal",
        "MARKETING_MOMENTS"));

    assertEquals(1, response.moments().size());
    assertEquals("Alice", response.moments().get(0).author());
    assertEquals("new product", response.moments().get(0).content());
    assertEquals(1, response.moments().get(0).visualIndex());
    assertEquals(true, response.moments().get(0).suitableForLike());
    assertEquals(120D, response.moments().get(0).verticalRange().y());
    assertEquals(180D, response.moments().get(0).verticalRange().h());
    assertEquals(0.93D, response.moments().get(0).confidence());
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
