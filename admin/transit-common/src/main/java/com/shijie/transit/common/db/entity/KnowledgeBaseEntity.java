package com.shijie.transit.common.db.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;

@TableName("knowledge_base")
public class KnowledgeBaseEntity extends BaseTenantEntity {
  @JsonSerialize(using = ToStringSerializer.class)
  private Long userId;
  private String name;
  private String description;
  private String difyDatasetId;
  private String permission;
  private String status;
  private Boolean isDefault;

  public Long getUserId() {
    return userId;
  }

  public void setUserId(Long userId) {
    this.userId = userId;
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

  public String getDifyDatasetId() {
    return difyDatasetId;
  }

  public void setDifyDatasetId(String difyDatasetId) {
    this.difyDatasetId = difyDatasetId;
  }

  public String getPermission() {
    return permission;
  }

  public void setPermission(String permission) {
    this.permission = permission;
  }

  public String getStatus() {
    return status;
  }

  public void setStatus(String status) {
    this.status = status;
  }

  public Boolean getIsDefault() {
    return isDefault;
  }

  public void setIsDefault(Boolean isDefault) {
    this.isDefault = isDefault;
  }
}
