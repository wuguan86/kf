package com.shijie.transit.common.db.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;

/**
 * CRM 客户-标签关联记录。
 */
@TableName("crm_customer_tag_rel")
public class CrmCustomerTagRelEntity extends BaseTenantEntity {
  @JsonSerialize(using = ToStringSerializer.class)
  private Long customerId;
  @JsonSerialize(using = ToStringSerializer.class)
  private Long tagId;

  public Long getCustomerId() {
    return customerId;
  }

  public void setCustomerId(Long customerId) {
    this.customerId = customerId;
  }

  public Long getTagId() {
    return tagId;
  }

  public void setTagId(Long tagId) {
    this.tagId = tagId;
  }
}
