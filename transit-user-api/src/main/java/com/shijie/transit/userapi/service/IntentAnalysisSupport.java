package com.shijie.transit.userapi.service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.util.StringUtils;

final class IntentAnalysisSupport {
  private IntentAnalysisSupport() {
  }

  static String normalizeDemandBudget(String value) {
    if (!StringUtils.hasText(value)) {
      return "unknown";
    }
    String key = value.trim().toLowerCase(Locale.ROOT);
    if ("高".equals(key) || "high".equals(key)) {
      return "high";
    }
    if ("中".equals(key) || "medium".equals(key) || "mid".equals(key)) {
      return "medium";
    }
    if ("低".equals(key) || "low".equals(key)) {
      return "low";
    }
    return "unknown";
  }

  static String normalizeTime(String value) {
    if (!StringUtils.hasText(value)) {
      return "unknown";
    }
    String key = value.trim().toLowerCase(Locale.ROOT);
    if ("短期".equals(key) || "short".equals(key)) {
      return "short";
    }
    if ("中期".equals(key) || "mid".equals(key) || "medium".equals(key)) {
      return "mid";
    }
    if ("长期".equals(key) || "long".equals(key)) {
      return "long";
    }
    return "unknown";
  }

  static String normalizeEvent(String value) {
    if (!StringUtils.hasText(value)) {
      return "none";
    }
    String key = value.trim().toLowerCase(Locale.ROOT);
    if ("purchase".equals(key) || "成交".equals(key)) {
      return "purchase";
    }
    if ("refusal".equals(key) || "拒绝".equals(key)) {
      return "refusal";
    }
    return "none";
  }

  static int toIntentLevel(int totalScore, int mediumThreshold, int highThreshold) {
    if (totalScore >= highThreshold) {
      return 3;
    }
    if (totalScore >= mediumThreshold) {
      return 2;
    }
    return 1;
  }

  static String normalizeLevelByDimension(String dimension, String value) {
    if ("time".equals(dimension)) {
      return normalizeTime(value);
    }
    if ("demand".equals(dimension) || "budget".equals(dimension)) {
      return normalizeDemandBudget(value);
    }
    return null;
  }

  static String safeText(String text) {
    if (!StringUtils.hasText(text)) {
      return "";
    }
    String value = text.trim();
    if (value.length() <= 2000) {
      return value;
    }
    return value.substring(0, 2000);
  }

  static String stripCodeFence(String raw) {
    String text = raw;
    if (text.startsWith("```")) {
      int firstNewline = text.indexOf('\n');
      if (firstNewline > -1) {
        text = text.substring(firstNewline + 1);
      }
      int endFence = text.lastIndexOf("```");
      if (endFence > -1) {
        text = text.substring(0, endFence);
      }
    }
    return text.trim();
  }

  record HistoryItem(String role, String content, String timestamp) {
  }

  record AnalysisResult(
      String demandLevel,
      String budgetLevel,
      String timeLevel,
      String latestEvent,
      int totalScore,
      int intentLevel,
      String reason,
      String dailySummary,
      String analysisSource) {
    static AnalysisResult keywordHigh(String keyword, int highThreshold, String dailySummary) {
      int score = Math.max(highThreshold, 70);
      return new AnalysisResult(
          "high",
          "high",
          "short",
          "none",
          score,
          3,
          "命中高意向关键词: " + keyword,
          dailySummary,
          "KEYWORD");
    }

    static AnalysisResult keywordLow(String keyword, String dailySummary) {
      return new AnalysisResult(
          "low",
          "low",
          "long",
          "none",
          0,
          1,
          "命中低意向关键词: " + keyword,
          dailySummary,
          "KEYWORD");
    }
  }

  record ScoringConfig(
      int highThreshold,
      int mediumThreshold,
      List<String> highIntentKeywords,
      List<String> lowIntentKeywords,
      Map<String, Map<String, Integer>> scoreMap) {
    int score(String dimension, String level) {
      Map<String, Integer> levels = scoreMap.get(dimension);
      if (levels == null) {
        return 0;
      }
      Integer score = levels.get(level);
      if (score != null) {
        return score;
      }
      Integer unknown = levels.get("unknown");
      return unknown == null ? 0 : unknown;
    }

    static ScoringConfig defaultConfig() {
      Map<String, Map<String, Integer>> map = new LinkedHashMap<>();
      Map<String, Integer> demand = new LinkedHashMap<>();
      demand.put("high", 40);
      demand.put("medium", 20);
      demand.put("low", 0);
      demand.put("unknown", 0);
      map.put("demand", demand);
      Map<String, Integer> budget = new LinkedHashMap<>();
      budget.put("high", 30);
      budget.put("medium", 15);
      budget.put("low", 5);
      budget.put("unknown", 10);
      map.put("budget", budget);
      Map<String, Integer> time = new LinkedHashMap<>();
      time.put("short", 30);
      time.put("mid", 15);
      time.put("long", 5);
      time.put("unknown", 10);
      map.put("time", time);
      return new ScoringConfig(70, 40, List.of(), List.of(), map);
    }
  }
}
