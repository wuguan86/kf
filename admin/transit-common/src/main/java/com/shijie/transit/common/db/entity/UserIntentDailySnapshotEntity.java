package com.shijie.transit.common.db.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import java.time.LocalDate;
import java.time.LocalDateTime;

@TableName("user_intent_daily_snapshot")
public class UserIntentDailySnapshotEntity extends BaseTenantEntity {
  @JsonSerialize(using = ToStringSerializer.class)
  private Long ownerUserId;
  private String contactKey;
  @JsonFormat(pattern = "yyyy-MM-dd")
  private LocalDate statsDate;
  private Integer intentLevel;
  private String dailySummary;
  private LocalDateTime lastChatTime;

  public Long getOwnerUserId() {
    return ownerUserId;
  }

  public void setOwnerUserId(Long ownerUserId) {
    this.ownerUserId = ownerUserId;
  }

  public String getContactKey() {
    return contactKey;
  }

  public void setContactKey(String contactKey) {
    this.contactKey = contactKey;
  }

  public LocalDate getStatsDate() {
    return statsDate;
  }

  public void setStatsDate(LocalDate statsDate) {
    this.statsDate = statsDate;
  }

  public Integer getIntentLevel() {
    return intentLevel;
  }

  public void setIntentLevel(Integer intentLevel) {
    this.intentLevel = intentLevel;
  }

  public String getDailySummary() {
    return dailySummary;
  }

  public void setDailySummary(String dailySummary) {
    this.dailySummary = dailySummary;
  }

  public LocalDateTime getLastChatTime() {
    return lastChatTime;
  }

  public void setLastChatTime(LocalDateTime lastChatTime) {
    this.lastChatTime = lastChatTime;
  }
}
