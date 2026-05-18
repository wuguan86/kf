package com.shijie.transit.common.db.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;

@TableName("single_session_config")
public class SingleSessionConfigEntity extends BaseTenantEntity {
  @JsonSerialize(using = ToStringSerializer.class)
  private Long userId;
  private Integer enabled;
  private Integer memoryRounds;
  private Integer replyIntervalStartSec;
  private Integer replyIntervalEndSec;
  private Integer aiStopReplyEnabled;
  private String aiStopReplyKeywords;
  private Integer manualHandoffEnabled;
  private String manualHandoffKeywords;
  private String manualHandoffMessage;
  private String handoffPhone;
  private Integer handoffPhoneEnabled;
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

  public Integer getReplyIntervalStartSec() {
    return replyIntervalStartSec;
  }

  public void setReplyIntervalStartSec(Integer replyIntervalStartSec) {
    this.replyIntervalStartSec = replyIntervalStartSec;
  }

  public Integer getReplyIntervalEndSec() {
    return replyIntervalEndSec;
  }

  public void setReplyIntervalEndSec(Integer replyIntervalEndSec) {
    this.replyIntervalEndSec = replyIntervalEndSec;
  }

  public Integer getAiStopReplyEnabled() {
    return aiStopReplyEnabled;
  }

  public void setAiStopReplyEnabled(Integer aiStopReplyEnabled) {
    this.aiStopReplyEnabled = aiStopReplyEnabled;
  }

  public String getAiStopReplyKeywords() {
    return aiStopReplyKeywords;
  }

  public void setAiStopReplyKeywords(String aiStopReplyKeywords) {
    this.aiStopReplyKeywords = aiStopReplyKeywords;
  }

  public Integer getManualHandoffEnabled() {
    return manualHandoffEnabled;
  }

  public void setManualHandoffEnabled(Integer manualHandoffEnabled) {
    this.manualHandoffEnabled = manualHandoffEnabled;
  }

  public String getManualHandoffKeywords() {
    return manualHandoffKeywords;
  }

  public void setManualHandoffKeywords(String manualHandoffKeywords) {
    this.manualHandoffKeywords = manualHandoffKeywords;
  }

  public String getManualHandoffMessage() {
    return manualHandoffMessage;
  }

  public void setManualHandoffMessage(String manualHandoffMessage) {
    this.manualHandoffMessage = manualHandoffMessage;
  }

  public String getHandoffPhone() {
    return handoffPhone;
  }

  public void setHandoffPhone(String handoffPhone) {
    this.handoffPhone = handoffPhone;
  }

  public Integer getHandoffPhoneEnabled() {
    return handoffPhoneEnabled;
  }

  public void setHandoffPhoneEnabled(Integer handoffPhoneEnabled) {
    this.handoffPhoneEnabled = handoffPhoneEnabled;
  }

  public String getStatus() {
    return status;
  }

  public void setStatus(String status) {
    this.status = status;
  }
}
