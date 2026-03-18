package com.shijie.transit.common.db.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;

@TableName("intent_analysis_log")
public class IntentAnalysisLogEntity extends BaseTenantEntity {
  @JsonSerialize(using = ToStringSerializer.class)
  private Long ownerUserId;
  private String contactKey;
  @JsonSerialize(using = ToStringSerializer.class)
  private Long sourceMsgId;
  private Integer beforeIntentLevel;
  private Integer afterIntentLevel;
  private String rawLlmJson;
  private String decisionReason;

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

  public Long getSourceMsgId() {
    return sourceMsgId;
  }

  public void setSourceMsgId(Long sourceMsgId) {
    this.sourceMsgId = sourceMsgId;
  }

  public Integer getBeforeIntentLevel() {
    return beforeIntentLevel;
  }

  public void setBeforeIntentLevel(Integer beforeIntentLevel) {
    this.beforeIntentLevel = beforeIntentLevel;
  }

  public Integer getAfterIntentLevel() {
    return afterIntentLevel;
  }

  public void setAfterIntentLevel(Integer afterIntentLevel) {
    this.afterIntentLevel = afterIntentLevel;
  }

  public String getRawLlmJson() {
    return rawLlmJson;
  }

  public void setRawLlmJson(String rawLlmJson) {
    this.rawLlmJson = rawLlmJson;
  }

  public String getDecisionReason() {
    return decisionReason;
  }

  public void setDecisionReason(String decisionReason) {
    this.decisionReason = decisionReason;
  }
}
