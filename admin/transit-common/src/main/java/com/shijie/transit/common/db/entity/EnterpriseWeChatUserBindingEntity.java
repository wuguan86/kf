package com.shijie.transit.common.db.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;

@TableName("enterprise_wechat_user_binding")
public class EnterpriseWeChatUserBindingEntity extends BaseTenantEntity {
  private String enterpriseUserId;
  private String enterpriseUserName;
  @JsonSerialize(using = ToStringSerializer.class)
  private Long userId;
  private String remark;
  private String status;

  public String getEnterpriseUserId() {
    return enterpriseUserId;
  }

  public void setEnterpriseUserId(String enterpriseUserId) {
    this.enterpriseUserId = enterpriseUserId;
  }

  public String getEnterpriseUserName() {
    return enterpriseUserName;
  }

  public void setEnterpriseUserName(String enterpriseUserName) {
    this.enterpriseUserName = enterpriseUserName;
  }

  public Long getUserId() {
    return userId;
  }

  public void setUserId(Long userId) {
    this.userId = userId;
  }

  public String getRemark() {
    return remark;
  }

  public void setRemark(String remark) {
    this.remark = remark;
  }

  public String getStatus() {
    return status;
  }

  public void setStatus(String status) {
    this.status = status;
  }
}
