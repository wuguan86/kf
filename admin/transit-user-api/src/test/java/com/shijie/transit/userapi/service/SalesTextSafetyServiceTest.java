package com.shijie.transit.userapi.service;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class SalesTextSafetyServiceTest {

  @Test
  void allowsNaturalFollowUpSuggestion() {
    SalesTextSafetyService service = new SalesTextSafetyService();

    SalesTextSafetyService.SafetyResult result = service.checkFollowUpSuggestion(
        "上次您提到想了解套餐差异，我整理了两点重点，您看今天方便我发您参考吗？");

    assertEquals(true, result.safe());
    assertEquals("上次您提到想了解套餐差异，我整理了两点重点，您看今天方便我发您参考吗？", result.safeText());
  }

  @Test
  void rejectsUnsafeFollowUpSuggestion() {
    SalesTextSafetyService service = new SalesTextSafetyService();

    SalesTextSafetyService.SafetyResult result = service.checkFollowUpSuggestion(
        "这是链接 https://example.com，联系我 13800138000，保证今天一定成交。");

    assertEquals(false, result.safe());
    assertEquals("", result.safeText());
    assertEquals("AI 建议包含链接、联系方式或绝对承诺，请人工编辑后再使用", result.reason());
  }

  @Test
  void rejectsOverlongFollowUpSuggestion() {
    SalesTextSafetyService service = new SalesTextSafetyService();
    String text = "请参考".repeat(80);

    SalesTextSafetyService.SafetyResult result = service.checkFollowUpSuggestion(text);

    assertEquals(false, result.safe());
    assertEquals("", result.safeText());
    assertEquals("AI 建议过长，请人工精简后再使用", result.reason());
  }
}
