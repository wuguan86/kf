package com.shijie.transit.common.db.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;

@TableName("group_session_config")
public class GroupSessionConfigEntity extends BaseTenantEntity {
  @JsonSerialize(using = ToStringSerializer.class)
  private Long userId;
  private Integer enabled;
  private Integer memoryRounds;
  private String groupReplyStartTime;
  private String groupReplyEndTime;
  private Integer groupCooldownSec;
  private Integer groupKeywordTriggerEnabled;
  private String groupTriggerKeywords;
  private String groupInteractionStrategy;
  private String status;

  public Long getUserId() {
    return userId;
  }

  public void setUserId(Long userId) {
    this.userId = userId;
  }

  public Integer getEnabled() {
    return enabled;
  }

  public void setEnabled(Integer enabled) {
    this.enabled = enabled;
  }

  public Integer getMemoryRounds() {
    return memoryRounds;
  }

  public void setMemoryRounds(Integer memoryRounds) {
    this.memoryRounds = memoryRounds;
  }

  public String getGroupReplyStartTime() {
    return groupReplyStartTime;
  }

  public void setGroupReplyStartTime(String groupReplyStartTime) {
    this.groupReplyStartTime = groupReplyStartTime;
  }

  public String getGroupReplyEndTime() {
    return groupReplyEndTime;
  }

  public void setGroupReplyEndTime(String groupReplyEndTime) {
    this.groupReplyEndTime = groupReplyEndTime;
  }

  public Integer getGroupCooldownSec() {
    return groupCooldownSec;
  }

  public void setGroupCooldownSec(Integer groupCooldownSec) {
    this.groupCooldownSec = groupCooldownSec;
  }

  public Integer getGroupKeywordTriggerEnabled() {
    return groupKeywordTriggerEnabled;
  }

  public void setGroupKeywordTriggerEnabled(Integer groupKeywordTriggerEnabled) {
    this.groupKeywordTriggerEnabled = groupKeywordTriggerEnabled;
  }

  public String getGroupTriggerKeywords() {
    return groupTriggerKeywords;
  }

  public void setGroupTriggerKeywords(String groupTriggerKeywords) {
    this.groupTriggerKeywords = groupTriggerKeywords;
  }

  public String getGroupInteractionStrategy() {
    return groupInteractionStrategy;
  }

  public void setGroupInteractionStrategy(String groupInteractionStrategy) {
    this.groupInteractionStrategy = groupInteractionStrategy;
  }

  public String getStatus() {
    return status;
  }

  public void setStatus(String status) {
    this.status = status;
  }
}
