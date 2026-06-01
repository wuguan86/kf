package com.shijie.transit.userapi.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class KnowledgeBaseCleaningSupportTest {

  private final ObjectMapper objectMapper = new ObjectMapper();

  @Test
  void cleanTextRemovesPageMarkersControlCharsAndExtraBlankLines() {
    KnowledgeBaseDocumentParser parser = new KnowledgeBaseDocumentParser();
    String raw = "收费标准\r\n\u0000\u0008\n\n\n—— 第 3 页 ——\n\n专业版每月 299 元。\n\n\n什么时候发货？";

    String cleaned = parser.cleanExtractedText(raw);

    assertEquals("收费标准\n\n专业版每月 299 元。\n\n什么时候发货？", cleaned);
  }

  @Test
  void parseQaItemsNormalizesStatusesAndKeepsWarnings() {
    KnowledgeBaseQaExtractionService service = disabledExtractionService();
    String json = """
        [
          {"question":"怎么收费？","answer":"专业版每月299元。","status":"normal","warning":""},
          {"question":"什么时候发货？","answer":"当天或24小时内发货。","status":"warning","warning":"原文存在冲突"}
        ]
        """;

    List<KnowledgeBaseQaExtractionService.CleaningQaItem> items = service.parseQaItems(json);

    assertEquals(2, items.size());
    assertEquals("NORMAL", items.get(0).status());
    assertEquals("WARNING", items.get(1).status());
    assertEquals("原文存在冲突", items.get(1).warning());
  }

  @Test
  void parseQaItemsRejectsIncompleteRows() {
    KnowledgeBaseQaExtractionService service = disabledExtractionService();

    IllegalArgumentException error = assertThrows(
        IllegalArgumentException.class,
        () -> service.parseQaItems("[{\"question\":\"怎么收费？\",\"status\":\"NORMAL\"}]"));

    assertEquals("AI 清洗结果缺少问题或答案", error.getMessage());
  }

  @Test
  void extractQaItemsRejectsMissingDashScopeKeyBeforeCallingModel() {
    KnowledgeBaseQaExtractionService service = disabledExtractionService();

    IllegalStateException error = assertThrows(
        IllegalStateException.class,
        () -> service.extractQaItems("收费标准：专业版每月 299 元。"));

    assertEquals("AI 清洗模型未配置", error.getMessage());
  }

  @Test
  void extractQaItemsCallsDashScopeCompatibleChatCompletions() {
    RestClient.Builder builder = RestClient.builder();
    MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
    server.expect(requestTo("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"))
        .andExpect(method(HttpMethod.POST))
        .andExpect(header("Authorization", "Bearer sk-test"))
        .andRespond(withSuccess("""
            {
              "choices": [
                {
                  "message": {
                    "content": "[{\\"question\\":\\"怎么收费？\\",\\"answer\\":\\"专业版每月299元。\\",\\"status\\":\\"NORMAL\\",\\"warning\\":\\"\\"}]"
                  }
                }
              ]
            }
            """, MediaType.APPLICATION_JSON));
    KnowledgeBaseQaExtractionService service = new KnowledgeBaseQaExtractionService(
        objectMapper,
        builder,
        "sk-test",
        "https://dashscope.aliyuncs.com",
        "qwen3.6-plus");

    List<KnowledgeBaseQaExtractionService.CleaningQaItem> items = service.extractQaItems("收费标准：专业版每月 299 元。");

    assertEquals(1, items.size());
    assertEquals("怎么收费？", items.get(0).question());
    server.verify();
  }

  @Test
  void buildMarkdownKeepsOrderAndSeparator() {
    KnowledgeBaseQaMarkdownBuilder builder = new KnowledgeBaseQaMarkdownBuilder();
    String markdown = builder.buildMarkdown(List.of(
        new KnowledgeBaseQaExtractionService.CleaningQaItem("怎么收费？", "专业版每月 299 元。", "NORMAL", ""),
        new KnowledgeBaseQaExtractionService.CleaningQaItem("几天可以退货？", "支持 7 天无理由退货。", "WARNING", "已人工确认")
    ));

    assertEquals("""
        Q：怎么收费？
        A：专业版每月 299 元。

        **********

        Q：几天可以退货？
        A：支持 7 天无理由退货。
        """.trim(), markdown);
  }

  private KnowledgeBaseQaExtractionService disabledExtractionService() {
    return new KnowledgeBaseQaExtractionService(
        objectMapper,
        RestClient.builder(),
        "",
        "https://dashscope.aliyuncs.com",
        "qwen3.6-plus");
  }
}
