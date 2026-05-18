package com.shijie.transit.userapi.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.shijie.transit.common.db.entity.UserOnlineSessionEntity;
import com.shijie.transit.common.mapper.UserOnlineSessionMapper;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class UserSessionService {
  public static final String CLIENT_TYPE_ELECTRON = "ELECTRON";
  public static final String STATUS_ONLINE = "ONLINE";
  public static final String STATUS_KICKED = "KICKED";
  public static final String STATUS_OFFLINE = "OFFLINE";
  private static final Logger log = LoggerFactory.getLogger(UserSessionService.class);

  private final UserOnlineSessionMapper userOnlineSessionMapper;
  private final Clock clock;

  public UserSessionService(UserOnlineSessionMapper userOnlineSessionMapper, Clock clock) {
    this.userOnlineSessionMapper = userOnlineSessionMapper;
    this.clock = clock;
  }

  // 登录成功后创建新会话，并将同账号同租户旧会话标记为被挤下线
  @Transactional
  public OpenSessionResult openSessionAndKickOld(long tenantId, long userId, String forceLogoutReason) {
    LocalDateTime now = LocalDateTime.now(clock);
    List<UserOnlineSessionEntity> onlineSessions = userOnlineSessionMapper.selectList(
        new LambdaQueryWrapper<UserOnlineSessionEntity>()
            .eq(UserOnlineSessionEntity::getTenantId, tenantId)
            .eq(UserOnlineSessionEntity::getUserId, userId)
            .eq(UserOnlineSessionEntity::getClientType, CLIENT_TYPE_ELECTRON)
            .eq(UserOnlineSessionEntity::getStatus, STATUS_ONLINE)
            .orderByDesc(UserOnlineSessionEntity::getUpdatedAt)
            .orderByDesc(UserOnlineSessionEntity::getId));

    List<String> kickedSessionIds = new ArrayList<>();
    for (UserOnlineSessionEntity online : onlineSessions) {
      if (!StringUtils.hasText(online.getSessionId())) {
        continue;
      }
      online.setStatus(STATUS_KICKED);
      online.setForceLogoutReason(StringUtils.hasText(forceLogoutReason) ? forceLogoutReason : "账号在其他设备登录");
      online.setForceLogoutAt(now);
      online.setLastSeenAt(now);
      userOnlineSessionMapper.updateById(online);
      kickedSessionIds.add(online.getSessionId());
    }

    String sessionId = UUID.randomUUID().toString().replace("-", "");
    UserOnlineSessionEntity current = new UserOnlineSessionEntity();
    current.setTenantId(tenantId);
    current.setUserId(userId);
    current.setSessionId(sessionId);
    current.setClientType(CLIENT_TYPE_ELECTRON);
    current.setStatus(STATUS_ONLINE);
    current.setLastSeenAt(now);
    userOnlineSessionMapper.insert(current);

    log.info("单点登录会话已更新 tenantId={} userId={} 新会话={} 旧会话数量={}", tenantId, userId, sessionId, kickedSessionIds.size());
    return new OpenSessionResult(sessionId, kickedSessionIds);
  }

  public boolean isCurrentOnlineSession(long tenantId, long userId, String sessionId) {
    if (!StringUtils.hasText(sessionId)) {
      return false;
    }
    UserOnlineSessionEntity latestOnline = userOnlineSessionMapper.selectOne(
        new LambdaQueryWrapper<UserOnlineSessionEntity>()
            .eq(UserOnlineSessionEntity::getTenantId, tenantId)
            .eq(UserOnlineSessionEntity::getUserId, userId)
            .eq(UserOnlineSessionEntity::getClientType, CLIENT_TYPE_ELECTRON)
            .eq(UserOnlineSessionEntity::getStatus, STATUS_ONLINE)
            .orderByDesc(UserOnlineSessionEntity::getUpdatedAt)
            .orderByDesc(UserOnlineSessionEntity::getId)
            .last("limit 1"));
    return latestOnline != null && sessionId.equals(latestOnline.getSessionId());
  }

  public void touchSession(String sessionId) {
    if (!StringUtils.hasText(sessionId)) {
      return;
    }
    UserOnlineSessionEntity current = userOnlineSessionMapper.selectOne(
        new LambdaQueryWrapper<UserOnlineSessionEntity>()
            .eq(UserOnlineSessionEntity::getSessionId, sessionId)
            .last("limit 1"));
    if (current == null) {
      return;
    }
    current.setLastSeenAt(LocalDateTime.now(clock));
    userOnlineSessionMapper.updateById(current);
  }

  @Transactional
  public void markSessionOffline(String sessionId, String reason) {
    if (!StringUtils.hasText(sessionId)) {
      return;
    }
    UserOnlineSessionEntity current = userOnlineSessionMapper.selectOne(
        new LambdaQueryWrapper<UserOnlineSessionEntity>()
            .eq(UserOnlineSessionEntity::getSessionId, sessionId)
            .last("limit 1"));
    if (current == null) {
      return;
    }
    if (STATUS_OFFLINE.equalsIgnoreCase(current.getStatus())) {
      return;
    }
    current.setStatus(STATUS_OFFLINE);
    current.setForceLogoutReason(reason);
    current.setForceLogoutAt(LocalDateTime.now(clock));
    userOnlineSessionMapper.updateById(current);
    log.info("会话已标记离线 sessionId={} reason={}", sessionId, reason);
  }

  public record OpenSessionResult(String sessionId, List<String> kickedSessionIds) {
  }
}
