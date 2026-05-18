package com.shijie.transit.common.db.entity;

import com.baomidou.mybatisplus.annotation.TableName;

@TableName("points_ledger")
public class PointsLedgerEntity extends BaseTenantEntity {
  private Long userId;
  private Integer delta;
  private Integer balanceAfter;
  private String reason;
  private String refId;

  public Long getUserId() {
    return userId;
  }

  public void setUserId(Long userId) {
    this.userId = userId;
  }

  public Integer getDelta() {
    return delta;
  }

  public void setDelta(Integer delta) {
    this.delta = delta;
  }

  public Integer getBalanceAfter() {
    return balanceAfter;
  }

  public void setBalanceAfter(Integer balanceAfter) {
    this.balanceAfter = balanceAfter;
  }

  public String getReason() {
    return reason;
  }

  public void setReason(String reason) {
    this.reason = reason;
  }

  public String getRefId() {
    return refId;
  }

  public void setRefId(String refId) {
    this.refId = refId;
  }
}
