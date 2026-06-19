package com.shijie.transit.userapi.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

class SmartSalesAiSuggestionServiceTest {

  @Test
  void parseRejectsNonJsonSuggestion() {
    SmartSalesAiSuggestionService service = createService();

    var result = service.parseFollowUpSuggestion("直接联系我 13800138000，一定成交");

    assertEquals("", result.suggestedContent());
    assertEquals("AI 返回格式非标准，请人工编辑后再使用", result.reason());
  }

  @Test
  void parseRejectsUnsafeJsonSuggestion() {
    SmartSalesAiSuggestionService service = createService();

    var result = service.parseFollowUpSuggestion("""
        {"suggestedContent":"您打开 https://example.com 看看，保证今天一定成交","reason":"推进成交"}
        """);

    assertEquals("", result.suggestedContent());
    assertEquals("AI 建议包含链接、联系方式或绝对承诺，请人工编辑后再使用", result.reason());
  }

  private SmartSalesAiSuggestionService createService() {
    return new SmartSalesAiSuggestionService(
        null,
        null,
        new ObjectMapper(),
        new SalesTextSafetyService(),
        RestClient.builder(),
        "",
        "https://dashscope.aliyuncs.com",
        "qwen-plus");
  }
}
