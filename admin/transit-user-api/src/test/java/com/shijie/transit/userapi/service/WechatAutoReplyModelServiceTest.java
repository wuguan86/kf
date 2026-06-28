package com.shijie.transit.userapi.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.shijie.transit.common.web.TransitException;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class WechatAutoReplyModelServiceTest {

  private final ObjectMapper objectMapper = new ObjectMapper();

  @Test
  void generateReplyCallsDashScopeWithKnowledgeRoleHistoryAndImageSummary() {
    RestClient.Builder builder = RestClient.builder();
    MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
    server.expect(requestTo("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"))
        .andExpect(method(HttpMethod.POST))
        .andExpect(header("Authorization", "Bearer sk-test"))
        .andExpect(content().string(Matchers.containsString("\"model\":\"qwen-plus\"")))
        .andExpect(content().string(Matchers.containsString("\"enable_thinking\":false")))
        .andExpect(content().string(Matchers.containsString("知识库命中：标准版 399 元/月")))
        .andExpect(content().string(Matchers.containsString("客服角色：简洁专业")))
        .andExpect(content().string(Matchers.containsString("用户: 之前问过价格")))
        .andExpect(content().string(Matchers.containsString("图片内容摘要：客户截图里有报价表")))
        .andRespond(withSuccess("""
            {
              "choices": [
                {
                  "message": {
                    "content": "标准版是 399 元/月，我可以先帮您按当前场景推荐合适版本。"
                  }
                }
              ]
            }
            """, MediaType.APPLICATION_JSON));
    WechatAutoReplyModelService service = createService(builder, "sk-test", "qwen-plus");

    String reply = service.generateReply(new WechatAutoReplyModelService.AutoReplyRequest(
        "这个多少钱",
        "客户截图里有报价表",
        "知识库命中：标准版 399 元/月",
        "客服角色：简洁专业",
        "用户: 之前问过价格\n回复: 已介绍基础能力",
        "",
        "",
        "customer_service"));

    assertEquals("标准版是 399 元/月，我可以先帮您按当前场景推荐合适版本。", reply);
    server.verify();
  }

  @Test
  void generateReplyRejectsMissingDashScopeKeyWithChineseMessage() {
    WechatAutoReplyModelService service = createService(RestClient.builder(), "", "qwen-plus");

    TransitException error = assertThrows(TransitException.class, () -> service.generateReply(
        new WechatAutoReplyModelService.AutoReplyRequest("你好", "", "", "", "", "", "", "customer_service")));

    assertEquals("自动回复模型未配置", error.getMessage());
  }

  private WechatAutoReplyModelService createService(RestClient.Builder builder, String apiKey, String model) {
    return new WechatAutoReplyModelService(
        objectMapper,
        builder,
        apiKey,
        "https://dashscope.aliyuncs.com",
        model);
  }
}
