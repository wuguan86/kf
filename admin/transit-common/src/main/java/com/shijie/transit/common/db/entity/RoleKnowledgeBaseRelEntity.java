package com.shijie.transit.common.db.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;

@TableName("role_knowledge_base_rel")
public class RoleKnowledgeBaseRelEntity extends BaseTenantEntity {
  @JsonSerialize(using = ToStringSerializer.class)
  private Long roleId;
  @JsonSerialize(using = ToStringSerializer.class)
  private Long kbId;

  public Long getRoleId() {
    return roleId;
  }

  public void setRoleId(Long roleId) {
    this.roleId = roleId;
  }

  public Long getKbId() {
    return kbId;
  }

  public void setKbId(Long kbId) {
    this.kbId = kbId;
  }
}
