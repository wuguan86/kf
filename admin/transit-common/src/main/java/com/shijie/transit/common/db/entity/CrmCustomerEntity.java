package com.shijie.transit.common.db.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import java.time.LocalDateTime;

/**
 * CRM 客户档案。
 * 对微信联系人(contact_key)补充销售档案信息，与 user_intent 通过
 * (tenant_id, owner_user_id, contact_key) 逻辑关联，无物理外键。
 */
@TableName("crm_customer")
public class CrmCustomerEntity extends BaseTenantEntity {
  @JsonSerialize(using = ToStringSerializer.class)
  private Long ownerUserId;
  private String contactKey;
  private String remarkName;
  private String phone;
  /** 客户性别：UNKNOWN/MALE/FEMALE/OTHER。该字段只保存人工确认后的结果。 */
  private String gender;
  /** 客户来源：GROUP/SCAN/REFERRAL/IMPORT/UNKNOWN */
  private String source;
  /** 商机阶段：LEAD/FOLLOWING/INTENDED/WON/LOST */
  private String stage;
  @JsonSerialize(using = ToStringSerializer.class)
  private Long assignedRoleId;
  private String remark;
  @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
  private LocalDateTime nextFollowUpAt;
  /** 是否星标：1 是 / 0 否 */
  private Integer starred;
  /** AI 生成的画像补充字段(JSON 文本)，前端可人工修正 */
  private String aiProfileJson;
  @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
  private LocalDateTime aiProfileUpdatedAt;
  /** AI 提取的基础资料待确认草稿，确认前不能覆盖正式客户资料。 */
  private String basicInfoSuggestionJson;
  @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
  private LocalDateTime basicInfoSuggestionUpdatedAt;
  private String aiStageSuggestion;
  private Integer aiStageConfidence;
  private String aiStageReason;
  @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
  private LocalDateTime aiStageUpdatedAt;

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

  public String getRemarkName() {
    return remarkName;
  }

  public void setRemarkName(String remarkName) {
    this.remarkName = remarkName;
  }

  public String getPhone() {
    return phone;
  }

  public void setPhone(String phone) {
    this.phone = phone;
  }

  public String getGender() {
    return gender;
  }

  public void setGender(String gender) {
    this.gender = gender;
  }

  public String getSource() {
    return source;
  }

  public void setSource(String source) {
    this.source = source;
  }

  public String getStage() {
    return stage;
  }

  public void setStage(String stage) {
    this.stage = stage;
  }

  public Long getAssignedRoleId() {
    return assignedRoleId;
  }

  public void setAssignedRoleId(Long assignedRoleId) {
    this.assignedRoleId = assignedRoleId;
  }

  public String getRemark() {
    return remark;
  }

  public void setRemark(String remark) {
    this.remark = remark;
  }

  public LocalDateTime getNextFollowUpAt() {
    return nextFollowUpAt;
  }

  public void setNextFollowUpAt(LocalDateTime nextFollowUpAt) {
    this.nextFollowUpAt = nextFollowUpAt;
  }

  public Integer getStarred() {
    return starred;
  }

  public void setStarred(Integer starred) {
    this.starred = starred;
  }

  public String getAiProfileJson() {
    return aiProfileJson;
  }

  public void setAiProfileJson(String aiProfileJson) {
    this.aiProfileJson = aiProfileJson;
  }

  public LocalDateTime getAiProfileUpdatedAt() {
    return aiProfileUpdatedAt;
  }

  public void setAiProfileUpdatedAt(LocalDateTime aiProfileUpdatedAt) {
    this.aiProfileUpdatedAt = aiProfileUpdatedAt;
  }

  public String getBasicInfoSuggestionJson() {
    return basicInfoSuggestionJson;
  }

  public void setBasicInfoSuggestionJson(String basicInfoSuggestionJson) {
    this.basicInfoSuggestionJson = basicInfoSuggestionJson;
  }

  public LocalDateTime getBasicInfoSuggestionUpdatedAt() {
    return basicInfoSuggestionUpdatedAt;
  }

  public void setBasicInfoSuggestionUpdatedAt(LocalDateTime basicInfoSuggestionUpdatedAt) {
    this.basicInfoSuggestionUpdatedAt = basicInfoSuggestionUpdatedAt;
  }

  public String getAiStageSuggestion() {
    return aiStageSuggestion;
  }

  public void setAiStageSuggestion(String aiStageSuggestion) {
    this.aiStageSuggestion = aiStageSuggestion;
  }

  public Integer getAiStageConfidence() {
    return aiStageConfidence;
  }

  public void setAiStageConfidence(Integer aiStageConfidence) {
    this.aiStageConfidence = aiStageConfidence;
  }

  public String getAiStageReason() {
    return aiStageReason;
  }

  public void setAiStageReason(String aiStageReason) {
    this.aiStageReason = aiStageReason;
  }

  public LocalDateTime getAiStageUpdatedAt() {
    return aiStageUpdatedAt;
  }

  public void setAiStageUpdatedAt(LocalDateTime aiStageUpdatedAt) {
    this.aiStageUpdatedAt = aiStageUpdatedAt;
  }
}
