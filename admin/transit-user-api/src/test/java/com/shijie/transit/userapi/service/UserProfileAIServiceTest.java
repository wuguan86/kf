package com.shijie.transit.userapi.service;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

class UserProfileAIServiceTest {

  @Test
  void parseWorkflowOutputSeparatesAssistProfileAndBasicInfoSuggestion() {
    UserProfileAIService service = new UserProfileAIService(
        null,
        null,
        null,
        new ObjectMapper(),
        Clock.fixed(Instant.parse("2026-06-30T08:00:00Z"), ZoneId.of("Asia/Shanghai")),
        new SalesTextSafetyService(),
        RestClient.builder(),
        "",
        "https://dashscope.aliyuncs.com",
        "qwen-plus");

    UserProfileAIService.ProfileGenerationResult result = service.parseWorkflowOutput("""
        {
          "aiProfile": {
            "communicationStyle": "客户说话直接，喜欢先看案例",
            "relationshipContext": "朋友介绍后添加微信",
            "preferenceHints": ["微信沟通", "同行案例"],
            "riskWarnings": ["不要承诺固定折扣"],
            "nextConversationTips": "先发案例，再约试用",
            "profileNote": "适合轻量跟进"
          },
          "basicInfoSuggestion": {
            "remarkName": "张三",
            "phone": "13800000000",
            "gender": "MALE",
            "source": "REFERRAL",
            "remark": "朋友介绍",
            "evidence": "客户说可以电话联系张三",
            "confidence": 82
          }
        }
        """);

    assertEquals("客户说话直接，喜欢先看案例", result.aiProfile().communicationStyle());
    assertEquals("朋友介绍后添加微信", result.aiProfile().relationshipContext());
    assertEquals("微信沟通", result.aiProfile().preferenceHints().get(0));
    assertEquals("不要承诺固定折扣", result.aiProfile().riskWarnings().get(0));
    assertEquals("先发案例，再约试用", result.aiProfile().nextConversationTips());
    assertEquals("张三", result.basicInfoSuggestion().remarkName());
    assertEquals("13800000000", result.basicInfoSuggestion().phone());
    assertEquals("MALE", result.basicInfoSuggestion().gender());
    assertEquals("REFERRAL", result.basicInfoSuggestion().source());
    assertEquals(82, result.basicInfoSuggestion().confidence());
  }
}
