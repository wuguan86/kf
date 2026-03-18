package com.shijie.transit.common.db.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import java.time.LocalDate;

@TableName("intent_daily_stats")
public class IntentDailyStatsEntity extends BaseTenantEntity {
  @JsonSerialize(using = ToStringSerializer.class)
  private Long ownerUserId;
  @JsonFormat(pattern = "yyyy-MM-dd")
  private LocalDate statsDate;
  private Integer highIntentCount;
  private Integer midIntentCount;
  private Integer lowIntentCount;
  private Integer newHighIntentCount;
  private Integer newUserCount;

  public Long getOwnerUserId() {
    return ownerUserId;
  }

  public void setOwnerUserId(Long ownerUserId) {
    this.ownerUserId = ownerUserId;
  }

  public LocalDate getStatsDate() {
    return statsDate;
  }

  public void setStatsDate(LocalDate statsDate) {
    this.statsDate = statsDate;
  }

  public Integer getHighIntentCount() {
    return highIntentCount;
  }

  public void setHighIntentCount(Integer highIntentCount) {
    this.highIntentCount = highIntentCount;
  }

  public Integer getMidIntentCount() {
    return midIntentCount;
  }

  public void setMidIntentCount(Integer midIntentCount) {
    this.midIntentCount = midIntentCount;
  }

  public Integer getLowIntentCount() {
    return lowIntentCount;
  }

  public void setLowIntentCount(Integer lowIntentCount) {
    this.lowIntentCount = lowIntentCount;
  }

  public Integer getNewHighIntentCount() {
    return newHighIntentCount;
  }

  public void setNewHighIntentCount(Integer newHighIntentCount) {
    this.newHighIntentCount = newHighIntentCount;
  }

  public Integer getNewUserCount() {
    return newUserCount;
  }

  public void setNewUserCount(Integer newUserCount) {
    this.newUserCount = newUserCount;
  }
}
