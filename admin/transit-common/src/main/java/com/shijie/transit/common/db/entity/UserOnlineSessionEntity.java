package com.shijie.transit.common.db.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;

@TableName("user_online_session")
public class UserOnlineSessionEntity extends BaseTenantEntity {
  private Long userId;
  private String sessionId;
  private String clientType;
  private String status;
  private String forceLogoutReason;
  private LocalDateTime forceLogoutAt;
  private LocalDateTime lastSeenAt;

  public Long getUserId() {
    return userId;
  }

  public void setUserId(Long userId) {
    this.userId = userId;
  }

  public String getSessionId() {
    return sessionId;
  }

  public void setSessionId(String sessionId) {
    this.sessionId = sessionId;
  }

  public String getClientType() {
    return clientType;
  }

  public void setClientType(String clientType) {
    this.clientType = clientType;
  }

  public String getStatus() {
    return status;
  }

  public void setStatus(String status) {
    this.status = status;
  }

  public String getForceLogoutReason() {
    return forceLogoutReason;
  }

  public void setForceLogoutReason(String forceLogoutReason) {
    this.forceLogoutReason = forceLogoutReason;
  }

  public LocalDateTime getForceLogoutAt() {
    return forceLogoutAt;
  }

  public void setForceLogoutAt(LocalDateTime forceLogoutAt) {
    this.forceLogoutAt = forceLogoutAt;
  }

  public LocalDateTime getLastSeenAt() {
    return lastSeenAt;
  }

  public void setLastSeenAt(LocalDateTime lastSeenAt) {
    this.lastSeenAt = lastSeenAt;
  }
}
