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
}
