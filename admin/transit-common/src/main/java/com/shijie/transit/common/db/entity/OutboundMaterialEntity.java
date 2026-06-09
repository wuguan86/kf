package com.shijie.transit.common.db.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;

@TableName("outbound_material")
public class OutboundMaterialEntity extends BaseTenantEntity {
  @JsonSerialize(using = ToStringSerializer.class)
  private Long ownerUserId;
  private String scope;
  private String name;
  private String description;
  private String tags;
  private String fileKey;
  private String fileType;
  private String mimeType;
  @JsonSerialize(using = ToStringSerializer.class)
  private Long fileSize;
  private String extension;
  private String allowedChannels;
  private Boolean autoSendEnabled;
  private String status;

  public Long getOwnerUserId() {
    return ownerUserId;
  }

  public void setOwnerUserId(Long ownerUserId) {
    this.ownerUserId = ownerUserId;
  }

  public String getScope() {
    return scope;
  }

  public void setScope(String scope) {
    this.scope = scope;
  }

  public String getName() {
    return name;
  }

  public void setName(String name) {
    this.name = name;
  }

  public String getDescription() {
    return description;
  }

  public void setDescription(String description) {
    this.description = description;
  }

  public String getTags() {
    return tags;
  }

  public void setTags(String tags) {
    this.tags = tags;
  }

  public String getFileKey() {
    return fileKey;
  }

  public void setFileKey(String fileKey) {
    this.fileKey = fileKey;
  }

  public String getFileType() {
    return fileType;
  }

  public void setFileType(String fileType) {
    this.fileType = fileType;
  }

  public String getMimeType() {
    return mimeType;
  }

  public void setMimeType(String mimeType) {
    this.mimeType = mimeType;
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

  public String getAllowedChannels() {
    return allowedChannels;
  }

  public void setAllowedChannels(String allowedChannels) {
    this.allowedChannels = allowedChannels;
  }

  public Boolean getAutoSendEnabled() {
    return autoSendEnabled;
  }

  public void setAutoSendEnabled(Boolean autoSendEnabled) {
    this.autoSendEnabled = autoSendEnabled;
  }

  public String getStatus() {
    return status;
  }

  public void setStatus(String status) {
    this.status = status;
  }
}
