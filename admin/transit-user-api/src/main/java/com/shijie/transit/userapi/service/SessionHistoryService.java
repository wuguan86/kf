package com.shijie.transit.userapi.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.shijie.transit.common.db.entity.SessionMessageHistoryEntity;
import com.shijie.transit.common.tenant.TenantContext;
import com.shijie.transit.userapi.mapper.SessionMessageHistoryMapper;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
public class SessionHistoryService {
  private final SessionMessageHistoryMapper historyMapper;
  private final Clock clock;

  public SessionHistoryService(SessionMessageHistoryMapper historyMapper, Clock clock) {
    this.historyMapper = historyMapper;
    this.clock = clock;
  }

  public void appendMessage(Long userId, Long roleId, String sceneType, String sessionKey, String senderType, String messageContent) {
    if (!StringUtils.hasText(sessionKey) || !StringUtils.hasText(messageContent)) {
      return;
    }
    SessionMessageHistoryEntity entity = new SessionMessageHistoryEntity();
    entity.setTenantId(TenantContext.getTenantId());
    entity.setUserId(userId);
    entity.setRoleId(roleId);
    entity.setSceneType(normalizeSceneType(sceneType));
    entity.setSessionKey(sessionKey);
    entity.setSenderType(StringUtils.hasText(senderType) ? senderType : "USER");
    entity.setMessageType("TEXT");
    entity.setMessageContent(messageContent);
    entity.setSentAt(LocalDateTime.now(clock));
    historyMapper.insert(entity);
  }

  public Page<SessionMessageHistoryEntity> pageHistory(
      Long userId, Long roleId, String sceneType, String sessionKey, long pageNo, long pageSize) {
    Page<SessionMessageHistoryEntity> page = new Page<>(Math.max(pageNo, 1), Math.max(pageSize, 1));
    LambdaQueryWrapper<SessionMessageHistoryEntity> wrapper = new LambdaQueryWrapper<SessionMessageHistoryEntity>()
        .eq(SessionMessageHistoryEntity::getUserId, userId)
        .eq(SessionMessageHistoryEntity::getSceneType, normalizeSceneType(sceneType))
        .eq(SessionMessageHistoryEntity::getSessionKey, sessionKey)
        .orderByDesc(SessionMessageHistoryEntity::getSentAt);
    if (roleId != null && roleId > 0) {
      wrapper.eq(SessionMessageHistoryEntity::getRoleId, roleId);
    }
    return historyMapper.selectPage(page, wrapper);
  }

  public List<HistoryInputItem> buildDifyHistory(
      Long userId, Long roleId, String sceneType, String sessionKey, int memoryRounds) {
    if (!StringUtils.hasText(sessionKey)) {
      return List.of();
    }
    int limit = Math.max(memoryRounds, 1) * 2;
    List<SessionMessageHistoryEntity> records = historyMapper.selectList(
        new LambdaQueryWrapper<SessionMessageHistoryEntity>()
            .eq(SessionMessageHistoryEntity::getUserId, userId)
            .eq(SessionMessageHistoryEntity::getRoleId, roleId)
            .eq(SessionMessageHistoryEntity::getSceneType, normalizeSceneType(sceneType))
            .eq(SessionMessageHistoryEntity::getSessionKey, sessionKey)
            .orderByDesc(SessionMessageHistoryEntity::getSentAt)
            .last("limit " + limit));
    if (records.isEmpty()) {
      return List.of();
    }
    Collections.reverse(records);
    List<HistoryInputItem> items = new ArrayList<>();
    for (SessionMessageHistoryEntity record : records) {
      String role = "assistant";
      if ("USER".equalsIgnoreCase(record.getSenderType())) {
        role = "user";
      }
      items.add(new HistoryInputItem(role, truncate(record.getMessageContent()), record.getSentAt() == null ? "" : record.getSentAt().toString()));
    }
    return items;
  }

  public LocalDateTime getLastAiReplyTime(Long userId, Long roleId, String sceneType, String sessionKey) {
    if (!StringUtils.hasText(sessionKey)) {
      return null;
    }
    SessionMessageHistoryEntity last = historyMapper.selectOne(new LambdaQueryWrapper<SessionMessageHistoryEntity>()
        .eq(SessionMessageHistoryEntity::getUserId, userId)
        .eq(SessionMessageHistoryEntity::getRoleId, roleId)
        .eq(SessionMessageHistoryEntity::getSceneType, normalizeSceneType(sceneType))
        .eq(SessionMessageHistoryEntity::getSessionKey, sessionKey)
        .eq(SessionMessageHistoryEntity::getSenderType, "AI")
        .orderByDesc(SessionMessageHistoryEntity::getSentAt)
        .last("limit 1"));
    return last == null ? null : last.getSentAt();
  }

  private String normalizeSceneType(String sceneType) {
    if (!StringUtils.hasText(sceneType)) {
      return "SINGLE";
    }
    String value = sceneType.trim().toUpperCase();
    if (!"SINGLE".equals(value) && !"GROUP".equals(value)) {
      return "SINGLE";
    }
    return value;
  }

  private String truncate(String content) {
    if (!StringUtils.hasText(content)) {
      return "";
    }
    String value = content.trim();
    if (value.length() <= 1000) {
      return value;
    }
    return value.substring(0, 1000);
  }

  public record HistoryInputItem(String role, String content, String timestamp) {
  }
}
