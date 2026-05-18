package com.shijie.transit.common.db.entity;

import com.baomidou.mybatisplus.annotation.TableName;

@TableName("admin_user")
public class AdminUserEntity extends BaseTenantEntity {
  private String username;
  private String passwordHash;
  private String displayName;
  private Boolean enabled;

  public String getUsername() {
    return username;
  }

  public void setUsername(String username) {
    this.username = username;
  }

  public String getPasswordHash() {
    return passwordHash;
  }

  public void setPasswordHash(String passwordHash) {
    this.passwordHash = passwordHash;
  }

  public String getDisplayName() {
    return displayName;
  }

  public void setDisplayName(String displayName) {
    this.displayName = displayName;
  }

  public Boolean getEnabled() {
    return enabled;
  }

  public void setEnabled(Boolean enabled) {
    this.enabled = enabled;
  }
}
