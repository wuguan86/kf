package com.shijie.transit.common.db.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import java.time.LocalDateTime;

@TableName("knowledge_base_cleaning_task")
public class KnowledgeBaseCleaningTaskEntity extends BaseTenantEntity {
  @JsonSerialize(using = ToStringSerializer.class)
  private Long userId;
  @JsonSerialize(using = ToStringSerializer.class)
  private Long kbId;
  private String difyDatasetId;
  private String originalFileName;
  @JsonSerialize(using = ToStringSerializer.class)
  private Long fileSize;
  private String extension;
  private String taskStatus;
  private String progressMessage;
  private String rawTextSummary;
  private String qaItemsJson;
  private String failedReason;
  private String difyDocumentId;
  private LocalDateTime confirmedAt;

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

  public String getOriginalFileName() {
    return originalFileName;
  }

  public void setOriginalFileName(String originalFileName) {
    this.originalFileName = originalFileName;
  }

  public Long getFileSize() {
    return fileSize;
  }

  public void setFileSize(Long fileSize) {
    this.fileSize = fileSize;
  }

  public String getExtension() {
    return extension;
  }

  public void setExtension(String extension) {
    this.extension = extension;
  }

  public String getTaskStatus() {
    return taskStatus;
  }

  public void setTaskStatus(String taskStatus) {
    this.taskStatus = taskStatus;
  }

  public String getProgressMessage() {
    return progressMessage;
  }

  public void setProgressMessage(String progressMessage) {
    this.progressMessage = progressMessage;
  }

  public String getRawTextSummary() {
    return rawTextSummary;
  }

  public void setRawTextSummary(String rawTextSummary) {
    this.rawTextSummary = rawTextSummary;
  }

  public String getQaItemsJson() {
    return qaItemsJson;
  }

  public void setQaItemsJson(String qaItemsJson) {
    this.qaItemsJson = qaItemsJson;
  }

  public String getFailedReason() {
    return failedReason;
  }

  public void setFailedReason(String failedReason) {
    this.failedReason = failedReason;
  }

  public String getDifyDocumentId() {
    return difyDocumentId;
  }

  public void setDifyDocumentId(String difyDocumentId) {
    this.difyDocumentId = difyDocumentId;
  }

  public LocalDateTime getConfirmedAt() {
    return confirmedAt;
  }

  public void setConfirmedAt(LocalDateTime confirmedAt) {
    this.confirmedAt = confirmedAt;
  }
}
