package com.shijie.transit.common.db.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import java.time.LocalDateTime;

/**
 * CRM 跟进记录。客户跟进时间线，支持人工录入与 AI 建议生成。
 */
@TableName("crm_follow_up_record")
public class CrmFollowUpRecordEntity extends BaseTenantEntity {
  @JsonSerialize(using = ToStringSerializer.class)
  private Long ownerUserId;
  @JsonSerialize(using = ToStringSerializer.class)
  private Long customerId;
  private String content;
  /** 跟进类型：PHONE/WECHAT/MEETING/NOTE */
  private String followUpType;
  @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
  private LocalDateTime nextFollowUpAt;
  /** 是否 AI 建议生成：1 是 / 0 否 */
  private Integer aiSuggested;

  public Long getOwnerUserId() {
    return ownerUserId;
  }

  public void setOwnerUserId(Long ownerUserId) {
    this.ownerUserId = ownerUserId;
  }

  public Long getCustomerId() {
    return customerId;
  }

  public void setCustomerId(Long customerId) {
    this.customerId = customerId;
  }

  public String getContent() {
    return content;
  }

  public void setContent(String content) {
    this.content = content;
  }

  public String getFollowUpType() {
    return followUpType;
  }

  public void setFollowUpType(String followUpType) {
    this.followUpType = followUpType;
  }

  public LocalDateTime getNextFollowUpAt() {
    return nextFollowUpAt;
  }

  public void setNextFollowUpAt(LocalDateTime nextFollowUpAt) {
    this.nextFollowUpAt = nextFollowUpAt;
  }

  public Integer getAiSuggested() {
    return aiSuggested;
  }

  public void setAiSuggested(Integer aiSuggested) {
    this.aiSuggested = aiSuggested;
  }
}
