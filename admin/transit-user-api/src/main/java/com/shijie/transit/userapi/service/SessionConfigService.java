package com.shijie.transit.userapi.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.shijie.transit.common.db.entity.GroupSessionConfigEntity;
import com.shijie.transit.common.db.entity.SingleSessionConfigEntity;
import com.shijie.transit.common.tenant.TenantContext;
import com.shijie.transit.userapi.mapper.GroupSessionConfigMapper;
import com.shijie.transit.userapi.mapper.SingleSessionConfigMapper;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class SessionConfigService {
  private final SingleSessionConfigMapper singleConfigMapper;
  private final GroupSessionConfigMapper groupConfigMapper;
  private final ObjectMapper objectMapper;

  public SessionConfigService(
      SingleSessionConfigMapper singleConfigMapper,
      GroupSessionConfigMapper groupConfigMapper,
      ObjectMapper objectMapper) {
    this.singleConfigMapper = singleConfigMapper;
    this.groupConfigMapper = groupConfigMapper;
    this.objectMapper = objectMapper;
  }

  public SessionConfigView getConfig(Long userId, String sceneType) {
    String normalizedSceneType = normalizeSceneType(sceneType);
    if ("GROUP".equals(normalizedSceneType)) {
      GroupSessionConfigEntity group = queryGroup(userId);
      if (group == null) {
        group = buildDefaultGroup(userId);
      }
      return mapGroupView(group);
    }
    SingleSessionConfigEntity single = querySingle(userId);
    if (single == null) {
      single = buildDefaultSingle(userId);
    }
    return mapSingleView(single);
  }

  @Transactional
  public SessionConfigView saveConfig(Long userId, SaveSessionConfigCommand command) {
    String sceneType = normalizeSceneType(command.sceneType());
    if ("GROUP".equals(sceneType)) {
      validateGroupTime(command.groupReplyStartTime(), command.groupReplyEndTime());
      GroupSessionConfigEntity group = queryGroup(userId);
      if (group == null) {
        group = new GroupSessionConfigEntity();
        group.setTenantId(TenantContext.getTenantId());
        group.setUserId(userId);
        group.setGroupInteractionStrategy("");
      }
      group.setEnabled(command.enabled() ? 1 : 0);
      group.setMemoryRounds(command.memoryRounds() == null ? 5 : Math.max(command.memoryRounds(), 1));
      group.setGroupReplyStartTime(StringUtils.hasText(command.groupReplyStartTime()) ? command.groupReplyStartTime() : "09:00");
      group.setGroupReplyEndTime(StringUtils.hasText(command.groupReplyEndTime()) ? command.groupReplyEndTime() : "18:00");
      group.setGroupCooldownSec(command.groupCooldownSec() == null ? 60 : Math.max(command.groupCooldownSec(), 0));
      group.setGroupKeywordTriggerEnabled(1);
      group.setGroupTriggerKeywords(toJsonArray(command.groupTriggerKeywords()));
      group.setStatus(command.enabled() ? "ENABLED" : "DISABLED");
      upsertGroup(group);
      return mapGroupView(group);
    }

    validateIntervals(command.replyIntervalStartSec(), command.replyIntervalEndSec());
    SingleSessionConfigEntity single = querySingle(userId);
    if (single == null) {
      single = new SingleSessionConfigEntity();
      single.setTenantId(TenantContext.getTenantId());
      single.setUserId(userId);
    }
    single.setEnabled(command.enabled() ? 1 : 0);
    single.setMemoryRounds(command.memoryRounds() == null ? 5 : Math.max(command.memoryRounds(), 1));
    single.setReplyIntervalStartSec(command.replyIntervalStartSec() == null ? 3 : command.replyIntervalStartSec());
    single.setReplyIntervalEndSec(command.replyIntervalEndSec() == null ? 8 : command.replyIntervalEndSec());
    single.setAiStopReplyEnabled(command.aiStopReplyEnabled() ? 1 : 0);
    single.setAiStopReplyKeywords(toJsonArray(command.aiStopReplyKeywords()));
    single.setManualHandoffEnabled(command.manualHandoffEnabled() ? 1 : 0);
    single.setManualHandoffKeywords(toJsonArray(command.manualHandoffKeywords()));
    single.setManualHandoffMessage(command.manualHandoffMessage() == null ? "" : command.manualHandoffMessage());
    single.setHandoffPhone(command.handoffPhone() == null ? "" : command.handoffPhone());
    single.setHandoffPhoneEnabled(command.handoffPhoneEnabled() ? 1 : 0);
    single.setStatus(command.enabled() ? "ENABLED" : "DISABLED");
    upsertSingle(single);
    return mapSingleView(single);
  }

  private SingleSessionConfigEntity querySingle(Long userId) {
    return singleConfigMapper.selectOne(new LambdaQueryWrapper<SingleSessionConfigEntity>()
        .eq(SingleSessionConfigEntity::getUserId, userId));
  }

  private GroupSessionConfigEntity queryGroup(Long userId) {
    return groupConfigMapper.selectOne(new LambdaQueryWrapper<GroupSessionConfigEntity>()
        .eq(GroupSessionConfigEntity::getUserId, userId));
  }

  private void upsertSingle(SingleSessionConfigEntity entity) {
    if (entity.getId() == null) {
      singleConfigMapper.insert(entity);
      return;
    }
    singleConfigMapper.updateById(entity);
  }

  private void upsertGroup(GroupSessionConfigEntity entity) {
    if (entity.getId() == null) {
      groupConfigMapper.insert(entity);
      return;
    }
    groupConfigMapper.updateById(entity);
  }

  private SingleSessionConfigEntity buildDefaultSingle(Long userId) {
    SingleSessionConfigEntity entity = new SingleSessionConfigEntity();
    entity.setTenantId(TenantContext.getTenantId());
    entity.setUserId(userId);
    entity.setEnabled(1);
    entity.setMemoryRounds(5);
    entity.setReplyIntervalStartSec(3);
    entity.setReplyIntervalEndSec(8);
    entity.setAiStopReplyEnabled(0);
    entity.setAiStopReplyKeywords("[]");
    entity.setManualHandoffEnabled(0);
    entity.setManualHandoffKeywords("[]");
    entity.setManualHandoffMessage("正在为您转接人工客服，请稍候...");
    entity.setHandoffPhone("13800138000");
    entity.setHandoffPhoneEnabled(1);
    entity.setStatus("ENABLED");
    return entity;
  }

  private GroupSessionConfigEntity buildDefaultGroup(Long userId) {
    GroupSessionConfigEntity entity = new GroupSessionConfigEntity();
    entity.setTenantId(TenantContext.getTenantId());
    entity.setUserId(userId);
    entity.setEnabled(1);
    entity.setMemoryRounds(5);
    entity.setGroupReplyStartTime("09:00");
    entity.setGroupReplyEndTime("18:00");
    entity.setGroupCooldownSec(60);
    entity.setGroupKeywordTriggerEnabled(1);
    entity.setGroupTriggerKeywords("[]");
    entity.setGroupInteractionStrategy("");
    entity.setStatus("ENABLED");
    return entity;
  }

  private String normalizeSceneType(String sceneType) {
    if (!StringUtils.hasText(sceneType)) {
      return "SINGLE";
    }
    String value = sceneType.trim().toUpperCase();
    if (!"SINGLE".equals(value) && !"GROUP".equals(value)) {
      throw new IllegalArgumentException("sceneType 必须为 SINGLE 或 GROUP");
    }
    return value;
  }

  private void validateIntervals(Integer startSec, Integer endSec) {
    int start = startSec == null ? 3 : startSec;
    int end = endSec == null ? 8 : endSec;
    if (start < 0 || end < 0 || start > end) {
      throw new IllegalArgumentException("回复间隔配置不合法");
    }
  }

  private void validateGroupTime(String startTime, String endTime) {
    if (!StringUtils.hasText(startTime) || !StringUtils.hasText(endTime)) {
      return;
    }
    if (startTime.compareTo(endTime) >= 0) {
      throw new IllegalArgumentException("群聊回复时间段不合法");
    }
  }

  private String toJsonArray(List<String> values) {
    List<String> cleaned = new ArrayList<>();
    if (values != null) {
      for (String value : values) {
        if (StringUtils.hasText(value)) {
          cleaned.add(value.trim());
        }
      }
    }
    try {
      return objectMapper.writeValueAsString(cleaned);
    } catch (JsonProcessingException e) {
      throw new IllegalArgumentException("关键词格式不合法");
    }
  }

  private List<String> parseKeywords(String keywordsJson) {
    if (!StringUtils.hasText(keywordsJson)) {
      return List.of();
    }
    try {
      return objectMapper.readValue(keywordsJson, objectMapper.getTypeFactory().constructCollectionType(List.class, String.class));
    } catch (Exception ex) {
      return List.of();
    }
  }

  public record SaveSessionConfigCommand(
      String sceneType,
      boolean enabled,
      Integer memoryRounds,
      Integer replyIntervalStartSec,
      Integer replyIntervalEndSec,
      String groupReplyStartTime,
      String groupReplyEndTime,
      Integer groupCooldownSec,
      boolean aiStopReplyEnabled,
      List<String> aiStopReplyKeywords,
      boolean manualHandoffEnabled,
      List<String> manualHandoffKeywords,
      String manualHandoffMessage,
      String handoffPhone,
      boolean handoffPhoneEnabled,
      boolean groupKeywordTriggerEnabled,
      List<String> groupTriggerKeywords) {
  }

  private SessionConfigView mapSingleView(SingleSessionConfigEntity single) {
    SceneConfigData sceneConfig = new SceneConfigData(
        "SINGLE",
        single.getEnabled(),
        single.getMemoryRounds(),
        single.getReplyIntervalStartSec(),
        single.getReplyIntervalEndSec(),
        "",
        "",
        0,
        single.getStatus());
    ReplyStrategyData replyStrategy = new ReplyStrategyData(
        single.getAiStopReplyEnabled(),
        single.getManualHandoffEnabled(),
        single.getManualHandoffMessage(),
        single.getHandoffPhone(),
        single.getHandoffPhoneEnabled(),
        0);
    return new SessionConfigView(sceneConfig, replyStrategy, parseKeywords(single.getAiStopReplyKeywords()), parseKeywords(single.getManualHandoffKeywords()), List.of());
  }

  private SessionConfigView mapGroupView(GroupSessionConfigEntity group) {
    SceneConfigData sceneConfig = new SceneConfigData(
        "GROUP",
        group.getEnabled(),
        group.getMemoryRounds(),
        60,
        60,
        group.getGroupReplyStartTime(),
        group.getGroupReplyEndTime(),
        group.getGroupCooldownSec(),
        group.getStatus());
    ReplyStrategyData replyStrategy = new ReplyStrategyData(
        0,
        0,
        "",
        "",
        0,
        group.getGroupKeywordTriggerEnabled());
    return new SessionConfigView(sceneConfig, replyStrategy, List.of(), List.of(), parseKeywords(group.getGroupTriggerKeywords()));
  }

  public record SceneConfigData(
      String sceneType,
      Integer enabled,
      Integer memoryRounds,
      Integer replyIntervalStartSec,
      Integer replyIntervalEndSec,
      String groupReplyStartTime,
      String groupReplyEndTime,
      Integer groupCooldownSec,
      String status) {
  }

  public record ReplyStrategyData(
      Integer aiStopReplyEnabled,
      Integer manualHandoffEnabled,
      String manualHandoffMessage,
      String handoffPhone,
      Integer handoffPhoneEnabled,
      Integer groupKeywordTriggerEnabled) {
  }

  public record SessionConfigView(
      SceneConfigData sceneConfig,
      ReplyStrategyData replyStrategy,
      List<String> aiStopReplyKeywords,
      List<String> manualHandoffKeywords,
      List<String> groupTriggerKeywords) {
  }
}
