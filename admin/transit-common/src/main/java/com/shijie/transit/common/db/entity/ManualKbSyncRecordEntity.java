package com.shijie.transit.common.db.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import java.time.LocalDateTime;

@TableName("manual_kb_sync_record")
public class ManualKbSyncRecordEntity extends BaseTenantEntity {
  @JsonSerialize(using = ToStringSerializer.class)
  private Long userId;
  @JsonSerialize(using = ToStringSerializer.class)
  private Long kbId;
  private String difyDatasetId;
  private String contactKey;
  private String customerMessage;
  private String aiReplyMessage;
  private Integer documentYear;
  private String documentName;
  private String difyDocumentId;
  private String syncStatus;
  private String syncResult;
  private String syncFailedReason;
  private LocalDateTime syncedAt;

  public Long getUserId() {
    return userId;
  }

  public void setUserId(Long userId) {
    this.userId = userId;
  }

  public Long getKbId() {
    return kbId;
  }

  public void setKbId(Long kbId) {
    this.kbId = kbId;
  }

  public String getDifyDatasetId() {
    return difyDatasetId;
  }

  public void setDifyDatasetId(String difyDatasetId) {
    this.difyDatasetId = difyDatasetId;
  }

  public String getContactKey() {
    return contactKey;
  }

  public void setContactKey(String contactKey) {
    this.contactKey = contactKey;
  }

  public String getCustomerMessage() {
    return customerMessage;
  }

  public void setCustomerMessage(String customerMessage) {
    this.customerMessage = customerMessage;
  }

  public String getAiReplyMessage() {
    return aiReplyMessage;
  }

  public void setAiReplyMessage(String aiReplyMessage) {
    this.aiReplyMessage = aiReplyMessage;
  }

  public Integer getDocumentYear() {
    return documentYear;
  }

  public void setDocumentYear(Integer documentYear) {
    this.documentYear = documentYear;
  }

  public String getDocumentName() {
    return documentName;
  }

  public void setDocumentName(String documentName) {
    this.documentName = documentName;
  }

  public String getDifyDocumentId() {
    return difyDocumentId;
  }

  public void setDifyDocumentId(String difyDocumentId) {
    this.difyDocumentId = difyDocumentId;
  }

  public String getSyncStatus() {
    return syncStatus;
  }

  public void setSyncStatus(String syncStatus) {
    this.syncStatus = syncStatus;
  }

  public String getSyncResult() {
    return syncResult;
  }

  public void setSyncResult(String syncResult) {
    this.syncResult = syncResult;
  }

  public String getSyncFailedReason() {
    return syncFailedReason;
  }

  public void setSyncFailedReason(String syncFailedReason) {
    this.syncFailedReason = syncFailedReason;
  }

  public LocalDateTime getSyncedAt() {
    return syncedAt;
  }

  public void setSyncedAt(LocalDateTime syncedAt) {
    this.syncedAt = syncedAt;
  }
}
