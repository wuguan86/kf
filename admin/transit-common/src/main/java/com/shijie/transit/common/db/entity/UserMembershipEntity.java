package com.shijie.transit.common.db.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;

@TableName("user_membership")
public class UserMembershipEntity extends BaseTenantEntity {
  private Long userId;
  private Long planId;
  private LocalDateTime startAt;
  private LocalDateTime endAt;
  private String status;
  private Integer pointsBalance;

  public Long getUserId() {
    return userId;
  }

  public void setUserId(Long userId) {
    this.userId = userId;
  }

  public Long getPlanId() {
    return planId;
  }

  public void setPlanId(Long planId) {
    this.planId = planId;
  }

  public LocalDateTime getStartAt() {
    return startAt;
  }

  public void setStartAt(LocalDateTime startAt) {
    this.startAt = startAt;
  }

  public LocalDateTime getEndAt() {
    return endAt;
  }

  public void setEndAt(LocalDateTime endAt) {
    this.endAt = endAt;
  }

  public String getStatus() {
    return status;
  }

  public void setStatus(String status) {
    this.status = status;
  }

  public Integer getPointsBalance() {
    return pointsBalance;
  }

  public void setPointsBalance(Integer pointsBalance) {
    this.pointsBalance = pointsBalance;
  }
}
