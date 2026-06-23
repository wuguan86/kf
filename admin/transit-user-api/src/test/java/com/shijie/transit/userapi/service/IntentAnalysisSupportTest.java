package com.shijie.transit.userapi.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import org.junit.jupiter.api.Test;

class IntentAnalysisSupportTest {

  @Test
  void normalizeStageSuggestionOnlyAllowsHumanConfirmableStages() {
    assertEquals("LEAD", IntentAnalysisSupport.normalizeStageSuggestion("lead"));
    assertEquals("FOLLOWING", IntentAnalysisSupport.normalizeStageSuggestion("FOLLOWING"));
    assertEquals("INTENDED", IntentAnalysisSupport.normalizeStageSuggestion("明确意向"));

    assertNull(IntentAnalysisSupport.normalizeStageSuggestion("WON"));
    assertNull(IntentAnalysisSupport.normalizeStageSuggestion("LOST"));
    assertNull(IntentAnalysisSupport.normalizeStageSuggestion("UNKNOWN"));
    assertNull(IntentAnalysisSupport.normalizeStageSuggestion("随便聊聊"));
  }

  @Test
  void normalizeStageConfidenceKeepsValidPercentageOnly() {
    assertEquals(0, IntentAnalysisSupport.normalizeStageConfidence(-1));
    assertEquals(68, IntentAnalysisSupport.normalizeStageConfidence(68));
    assertEquals(100, IntentAnalysisSupport.normalizeStageConfidence(101));
  }

  @Test
  void workflowResultParsesAllowedStageSuggestion() {
    IntentAnalysisSupport.AnalysisResult result = service().buildWorkflowResult("""
        {
          "demand": "high",
          "budget": "medium",
          "time": "short",
          "reason": "客户持续询价",
          "stage_suggestion": "INTENDED",
          "stage_confidence": "86",
          "stage_reason": "客户明确询价并追问交付周期"
        }
        """, IntentAnalysisSupport.ScoringConfig.defaultConfig(), null);

    assertEquals("INTENDED", result.stageSuggestion());
    assertEquals(86, result.stageConfidence());
    assertEquals("客户明确询价并追问交付周期", result.stageReason());
  }

  @Test
  void workflowResultRejectsClosedStageSuggestion() {
    IntentAnalysisSupport.AnalysisResult result = service().buildWorkflowResult("""
        {
          "demand": "high",
          "budget": "high",
          "time": "short",
          "reason": "客户表达成交",
          "stage_suggestion": "WON",
          "stage_confidence": 99,
          "stage_reason": "客户说已经成交"
        }
        """, IntentAnalysisSupport.ScoringConfig.defaultConfig(), null);

    assertNull(result.stageSuggestion());
    assertNull(result.stageConfidence());
    assertNull(result.stageReason());
  }

  @Test
  void workflowResultKeepsOldOutputCompatible() {
    IntentAnalysisSupport.AnalysisResult result = service().buildWorkflowResult("""
        {
          "demand": "medium",
          "budget": "unknown",
          "time": "mid",
          "reason": "旧工作流输出",
          "summary": "继续跟进"
        }
        """, IntentAnalysisSupport.ScoringConfig.defaultConfig(), null);

    assertEquals("medium", result.demandLevel());
    assertEquals("继续跟进", result.dailySummary());
    assertNull(result.stageSuggestion());
  }

  private IntentAnalysisService service() {
    return new IntentAnalysisService(
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        new ObjectMapper(),
        Clock.systemUTC());
  }
}
