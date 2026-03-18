package com.shijie.transit.userapi.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.shijie.transit.common.db.entity.IntentAnalysisLogEntity;
import com.shijie.transit.common.db.entity.IntentDailyStatsEntity;
import com.shijie.transit.common.db.entity.SystemConfigEntity;
import com.shijie.transit.common.db.entity.UserIntentEntity;
import com.shijie.transit.common.mapper.SystemConfigMapper;
import com.shijie.transit.common.tenant.TenantContext;
import com.shijie.transit.userapi.dify.DifyClient;
import com.shijie.transit.userapi.dify.DifyProperties;
import com.shijie.transit.userapi.mapper.IntentAnalysisLogMapper;
import com.shijie.transit.userapi.mapper.IntentDailyStatsMapper;
import com.shijie.transit.userapi.mapper.SessionMessageHistoryMapper;
import com.shijie.transit.userapi.mapper.UserIntentMapper;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import static com.shijie.transit.userapi.service.IntentAnalysisSupport.safeText;
import static com.shijie.transit.userapi.service.IntentAnalysisSupport.stripCodeFence;

@Service
public class IntentAnalysisService {
  private static final Logger log = LoggerFactory.getLogger(IntentAnalysisService.class);
  private static final String STATISTICAL_CONFIG_KEY = "statistical_scoring_config";
  private static final int NEW_MESSAGE_LIMIT = 200;
  private static final int HISTORY_LIMIT = 20;

  private final SessionMessageHistoryMapper sessionMessageHistoryMapper;
  private final UserIntentMapper userIntentMapper;
  private final IntentAnalysisLogMapper intentAnalysisLogMapper;
  private final IntentDailyStatsMapper intentDailyStatsMapper;
  private final SystemConfigMapper systemConfigMapper;
  private final DifyClient difyClient;
  private final DifyProperties difyProperties;
  private final ObjectMapper objectMapper;
  private final Clock clock;

  public IntentAnalysisService(
      SessionMessageHistoryMapper sessionMessageHistoryMapper,
      UserIntentMapper userIntentMapper,
      IntentAnalysisLogMapper intentAnalysisLogMapper,
      IntentDailyStatsMapper intentDailyStatsMapper,
      SystemConfigMapper systemConfigMapper,
      DifyClient difyClient,
      DifyProperties difyProperties,
      ObjectMapper objectMapper,
      Clock clock) {
    this.sessionMessageHistoryMapper = sessionMessageHistoryMapper;
    this.userIntentMapper = userIntentMapper;
    this.intentAnalysisLogMapper = intentAnalysisLogMapper;
    this.intentDailyStatsMapper = intentDailyStatsMapper;
    this.systemConfigMapper = systemConfigMapper;
    this.difyClient = difyClient;
    this.difyProperties = difyProperties;
    this.objectMapper = objectMapper;
    this.clock = clock;
  }

  public void analyzeUserPendingContacts(Long ownerUserId) {
    Long tenantId = TenantContext.getTenantId();
    if (tenantId == null || ownerUserId == null) {
      return;
    }
    IntentAnalysisSupport.ScoringConfig scoringConfig = loadScoringConfig();
    List<SessionMessageHistoryMapper.PendingContact> contacts =
        sessionMessageHistoryMapper.findPendingContacts(tenantId, ownerUserId);
    
    if (contacts.isEmpty()) {
      log.info("No pending contacts found for user {} tenant {}", ownerUserId, tenantId);
      return;
    }
    log.info("Found {} pending contacts for user {} tenant {}", contacts.size(), ownerUserId, tenantId);

    for (SessionMessageHistoryMapper.PendingContact contact : contacts) {
      if (contact == null || !StringUtils.hasText(contact.getContactKey())) {
        continue;
      }
      try {
        analyzeContact(tenantId, ownerUserId, contact.getContactKey(), scoringConfig);
      } catch (Exception ex) {
        if (ex.getMessage() != null && ex.getMessage().contains("API_KEY")) {
            log.error("Intent analysis failed: Dify Workflow API Key is missing or invalid. Please check 'dify.intent-workflow-api-key'. User={} Contact={}", ownerUserId, contact.getContactKey());
        } else {
            log.error("Intent analysis failed tenantId={} ownerUserId={} contact={}", tenantId, ownerUserId, contact.getContactKey(), ex);
        }
      }
    }
  }

  private void analyzeContact(Long tenantId, Long ownerUserId, String contactKey, IntentAnalysisSupport.ScoringConfig config) {
    UserIntentEntity existing = getIntent(ownerUserId, contactKey);
    Long lastAnalyzedMsgId = existing == null || existing.getLastAnalyzedMsgId() == null ? 0L : existing.getLastAnalyzedMsgId();
    List<SessionMessageHistoryMapper.MessageItem> newMessages = sessionMessageHistoryMapper.findNewUserMessages(
        tenantId, ownerUserId, contactKey, lastAnalyzedMsgId, NEW_MESSAGE_LIMIT);
    if (newMessages.isEmpty()) {
      return;
    }
    String currentContent = joinMessageContent(newMessages);
    Long maxMsgId = newMessages.get(newMessages.size() - 1).getId();

    IntentAnalysisSupport.AnalysisResult result;
    String rawLlm = null;
    String existingSummary = existing == null ? null : existing.getDailySummary();
    String keyword = hitKeyword(config.highIntentKeywords(), currentContent);
    if (StringUtils.hasText(keyword)) {
      result = IntentAnalysisSupport.AnalysisResult.keywordHigh(keyword, config.highThreshold(), existingSummary);
    } else {
      keyword = hitKeyword(config.lowIntentKeywords(), currentContent);
      if (StringUtils.hasText(keyword)) {
        result = IntentAnalysisSupport.AnalysisResult.keywordLow(keyword, existingSummary);
      } else {
        String workflowRaw = runWorkflow(ownerUserId, contactKey, maxMsgId, currentContent, buildCurrentContext(existing));
        rawLlm = workflowRaw;
        result = buildWorkflowResult(workflowRaw, config, existingSummary);
      }
    }

    Integer beforeLevel = existing == null ? null : existing.getIntentLevel();
    boolean isNewUser = existing == null;
    boolean becameHigh = result.intentLevel() == 3 && (beforeLevel == null || beforeLevel < 3);

    UserIntentEntity intent = existing == null ? new UserIntentEntity() : existing;
    if (existing == null) {
      intent.setTenantId(tenantId);
      intent.setOwnerUserId(ownerUserId);
      intent.setContactKey(contactKey);
    }
    intent.setDemandLevel(result.demandLevel());
    intent.setBudgetLevel(result.budgetLevel());
    intent.setTimeLevel(result.timeLevel());
    intent.setLatestEvent(result.latestEvent());
    intent.setTotalScore(result.totalScore());
    intent.setIntentLevel(result.intentLevel());
    intent.setAiReason(result.reason());
    intent.setDailySummary(result.dailySummary());
    intent.setAnalysisSource(result.analysisSource());
    intent.setLastAnalyzedMsgId(maxMsgId);
    intent.setLastAnalyzedAt(LocalDateTime.now(clock));
    if (existing == null) {
      userIntentMapper.insert(intent);
    } else {
      userIntentMapper.updateById(intent);
    }

    IntentAnalysisLogEntity logEntity = new IntentAnalysisLogEntity();
    logEntity.setTenantId(tenantId);
    logEntity.setOwnerUserId(ownerUserId);
    logEntity.setContactKey(contactKey);
    logEntity.setSourceMsgId(maxMsgId);
    logEntity.setBeforeIntentLevel(beforeLevel);
    logEntity.setAfterIntentLevel(result.intentLevel());
    logEntity.setRawLlmJson(rawLlm);
    logEntity.setDecisionReason(result.reason());
    intentAnalysisLogMapper.insert(logEntity);

    refreshDailyStats(ownerUserId, isNewUser, becameHigh);
  }

  private UserIntentEntity getIntent(Long ownerUserId, String contactKey) {
    return userIntentMapper.selectOne(
        new LambdaQueryWrapper<UserIntentEntity>()
            .eq(UserIntentEntity::getOwnerUserId, ownerUserId)
            .eq(UserIntentEntity::getContactKey, contactKey)
            .last("limit 1"));
  }

  private String runWorkflow(Long ownerUserId, String contactKey, Long maxMsgId, String currentContent, String currentContext) {
    String apiKey = difyProperties.getIntentWorkflowApiKey();
    if (!StringUtils.hasText(apiKey)) {
      throw new IllegalStateException("DIFY_INTENT_WORKFLOW_API_KEY 未配置");
    }
    List<SessionMessageHistoryMapper.MessageItem> history = sessionMessageHistoryMapper.findRecentConversationMessages(
        TenantContext.getTenantId(), ownerUserId, contactKey, maxMsgId, HISTORY_LIMIT);
    Collections.reverse(history);
    List<IntentAnalysisSupport.HistoryItem> historyItems = new ArrayList<>();
    for (SessionMessageHistoryMapper.MessageItem item : history) {
      String role = "assistant";
      if ("USER".equalsIgnoreCase(item.getSenderType())) {
        role = "user";
      }
      String timestamp = item.getSentAt() == null ? "" : item.getSentAt().toString();
      historyItems.add(new IntentAnalysisSupport.HistoryItem(role, safeText(item.getMessageContent()), timestamp));
    }
    ObjectNode inputs = objectMapper.createObjectNode();
    try {
      inputs.put("history", objectMapper.writeValueAsString(historyItems));
    } catch (Exception e) {
      log.error("Failed to serialize history items", e);
      inputs.put("history", "[]");
    }
    inputs.put("current_content", safeText(currentContent));
    inputs.put("current_context", safeText(currentContext));
    return difyClient.runWorkflow(apiKey, inputs, ownerUserId + ":" + contactKey);
  }

  private IntentAnalysisSupport.AnalysisResult buildWorkflowResult(
      String workflowRaw,
      IntentAnalysisSupport.ScoringConfig config,
      String previousSummary) {
    JsonNode node = parseWorkflowJson(workflowRaw);
    String demandLevel = IntentAnalysisSupport.normalizeDemandBudget(readText(node, "demand"));
    String budgetLevel = IntentAnalysisSupport.normalizeDemandBudget(readText(node, "budget"));
    String timeLevel = IntentAnalysisSupport.normalizeTime(readText(node, "time"));
    String latestEvent = IntentAnalysisSupport.normalizeEvent(readText(node, "event"));
    String reason = readText(node, "reason");
    String summary = readText(node, "summary");
    if (!StringUtils.hasText(reason)) {
      reason = "工作流意向分析";
    }
    if (!StringUtils.hasText(summary)) {
      summary = previousSummary;
    }
    int demandScore = config.score("demand", demandLevel);
    int budgetScore = config.score("budget", budgetLevel);
    int timeScore = config.score("time", timeLevel);
    int totalScore = Math.max(0, demandScore + budgetScore + timeScore);
    int intentLevel = IntentAnalysisSupport.toIntentLevel(totalScore, config.mediumThreshold(), config.highThreshold());
    return new IntentAnalysisSupport.AnalysisResult(
        demandLevel,
        budgetLevel,
        timeLevel,
        latestEvent,
        totalScore,
        intentLevel,
        reason,
        summary,
        "WORKFLOW");
  }

  private void refreshDailyStats(Long ownerUserId, boolean isNewUser, boolean becameHigh) {
    int highCount = countByIntentLevel(ownerUserId, 3);
    int midCount = countByIntentLevel(ownerUserId, 2);
    int lowCount = countByIntentLevel(ownerUserId, 1);
    LocalDate today = LocalDate.now(clock);
    IntentDailyStatsEntity daily = intentDailyStatsMapper.selectOne(
        new LambdaQueryWrapper<IntentDailyStatsEntity>()
            .eq(IntentDailyStatsEntity::getOwnerUserId, ownerUserId)
            .eq(IntentDailyStatsEntity::getStatsDate, today)
            .last("limit 1"));
    if (daily == null) {
      daily = new IntentDailyStatsEntity();
      daily.setTenantId(TenantContext.getTenantId());
      daily.setOwnerUserId(ownerUserId);
      daily.setStatsDate(today);
      daily.setHighIntentCount(highCount);
      daily.setMidIntentCount(midCount);
      daily.setLowIntentCount(lowCount);
      daily.setNewHighIntentCount(becameHigh ? 1 : 0);
      daily.setNewUserCount(isNewUser ? 1 : 0);
      intentDailyStatsMapper.insert(daily);
      return;
    }
    daily.setHighIntentCount(highCount);
    daily.setMidIntentCount(midCount);
    daily.setLowIntentCount(lowCount);
    int newHigh = daily.getNewHighIntentCount() == null ? 0 : daily.getNewHighIntentCount();
    int newUser = daily.getNewUserCount() == null ? 0 : daily.getNewUserCount();
    if (becameHigh) {
      newHigh++;
    }
    if (isNewUser) {
      newUser++;
    }
    daily.setNewHighIntentCount(newHigh);
    daily.setNewUserCount(newUser);
    intentDailyStatsMapper.updateById(daily);
  }

  private int countByIntentLevel(Long ownerUserId, int intentLevel) {
    Long count = userIntentMapper.selectCount(
        new LambdaQueryWrapper<UserIntentEntity>()
            .eq(UserIntentEntity::getOwnerUserId, ownerUserId)
            .eq(UserIntentEntity::getIntentLevel, intentLevel));
    return count == null ? 0 : count.intValue();
  }

  private IntentAnalysisSupport.ScoringConfig loadScoringConfig() {
    SystemConfigEntity entity = systemConfigMapper.selectOne(
        new LambdaQueryWrapper<SystemConfigEntity>()
            .eq(SystemConfigEntity::getConfigKey, STATISTICAL_CONFIG_KEY)
            .last("limit 1"));
    if (entity == null || !StringUtils.hasText(entity.getConfigValue())) {
      return IntentAnalysisSupport.ScoringConfig.defaultConfig();
    }
    try {
      JsonNode root = objectMapper.readTree(entity.getConfigValue());
      int high = root.path("thresholds").path("high").asInt(70);
      int medium = root.path("thresholds").path("medium").asInt(40);
      List<String> highKeywords = readKeywordList(root.path("highIntentKeywords"));
      List<String> lowKeywords = readKeywordList(root.path("lowIntentKeywords"));
      Map<String, Map<String, Integer>> scoreMap = new LinkedHashMap<>();
      JsonNode dimensions = root.path("dimensions");
      if (dimensions.isArray()) {
        for (JsonNode dimension : dimensions) {
          String key = dimension.path("key").asText("");
          if (!StringUtils.hasText(key)) {
            continue;
          }
          String dimensionKey = key.trim().toLowerCase(Locale.ROOT);
          Map<String, Integer> levelMap = new LinkedHashMap<>();
          JsonNode levels = dimension.path("levels");
          if (levels.isArray()) {
            for (JsonNode level : levels) {
              String levelName = level.path("name").asText("");
              int score = level.path("score").asInt(0);
              String normalized = IntentAnalysisSupport.normalizeLevelByDimension(dimensionKey, levelName);
              if (StringUtils.hasText(normalized)) {
                levelMap.put(normalized, score);
              }
            }
          }
          scoreMap.put(dimensionKey, levelMap);
        }
      }
      return new IntentAnalysisSupport.ScoringConfig(high, medium, highKeywords, lowKeywords, scoreMap);
    } catch (Exception ex) {
      log.warn("parse statistical config failed, use default", ex);
      return IntentAnalysisSupport.ScoringConfig.defaultConfig();
    }
  }

  private List<String> readKeywordList(JsonNode node) {
    if (!node.isArray()) {
      return List.of();
    }
    List<String> result = new ArrayList<>();
    for (JsonNode item : node) {
      String text = item == null ? null : item.asText(null);
      if (StringUtils.hasText(text)) {
        result.add(text.trim());
      }
    }
    return result;
  }

  private String hitKeyword(List<String> keywords, String content) {
    if (keywords == null || keywords.isEmpty() || !StringUtils.hasText(content)) {
      return null;
    }
    for (String keyword : keywords) {
      if (StringUtils.hasText(keyword) && content.contains(keyword)) {
        return keyword;
      }
    }
    return null;
  }

  private String joinMessageContent(List<SessionMessageHistoryMapper.MessageItem> messages) {
    StringBuilder sb = new StringBuilder();
    for (SessionMessageHistoryMapper.MessageItem item : messages) {
      String text = safeText(item.getMessageContent());
      if (!StringUtils.hasText(text)) {
        continue;
      }
      if (!sb.isEmpty()) {
        sb.append("\n");
      }
      sb.append(text);
    }
    return sb.toString();
  }

  private JsonNode parseWorkflowJson(String workflowRaw) {
    if (!StringUtils.hasText(workflowRaw)) {
      return objectMapper.createObjectNode();
    }
    String raw = workflowRaw.trim();
    try {
      return objectMapper.readTree(raw);
    } catch (Exception ignored) {
    }
    String cleaned = stripCodeFence(raw);
    if (StringUtils.hasText(cleaned)) {
      try {
        return objectMapper.readTree(cleaned);
      } catch (Exception ignored) {
      }
    }
    ObjectNode fallback = objectMapper.createObjectNode();
    fallback.put("reason", raw);
    return fallback;
  }

  private String readText(JsonNode node, String field) {
    if (node == null) {
      return null;
    }
    JsonNode value = node.path(field);
    if (value.isMissingNode() || value.isNull()) {
      return null;
    }
    String text = value.asText(null);
    return StringUtils.hasText(text) ? text.trim() : null;
  }

  private String buildCurrentContext(UserIntentEntity existing) {
    String intentText = toIntentText(existing == null ? null : existing.getIntentLevel());
    String demandText = toLevelText(existing == null ? null : existing.getDemandLevel());
    String budgetText = toLevelText(existing == null ? null : existing.getBudgetLevel());
    String dailySummary = existing == null ? null : existing.getDailySummary();
    if (!StringUtils.hasText(dailySummary)) {
      dailySummary = "无";
    }
    return "当前意向：" + intentText
        + "；需求强度：" + demandText
        + "；预算：" + budgetText
        + "；今日总结：" + dailySummary
        + "。请在此基础上根据新消息更新。";
  }

  private String toIntentText(Integer intentLevel) {
    if (intentLevel == null) {
      return "未知";
    }
    if (intentLevel == 3) {
      return "高";
    }
    if (intentLevel == 2) {
      return "中";
    }
    if (intentLevel == 1) {
      return "低";
    }
    return "未知";
  }

  private String toLevelText(String level) {
    if (!StringUtils.hasText(level)) {
      return "未知";
    }
    String value = level.trim().toLowerCase(Locale.ROOT);
    if ("high".equals(value)) {
      return "高";
    }
    if ("medium".equals(value) || "mid".equals(value)) {
      return "中";
    }
    if ("low".equals(value)) {
      return "低";
    }
    return "未知";
  }

}
