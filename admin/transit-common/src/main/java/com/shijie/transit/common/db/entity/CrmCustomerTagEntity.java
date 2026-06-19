package com.shijie.transit.common.db.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;

/**
 * CRM 客户标签。预设标签 category=PRESET，用户自定义 category=CUSTOM。
 */
@TableName("crm_customer_tag")
public class CrmCustomerTagEntity extends BaseTenantEntity {
  @JsonSerialize(using = ToStringSerializer.class)
  private Long ownerUserId;
  private String name;
  /** 标签颜色(十六进制)，默认 #5B8FF9 */
  private String color;
  /** 标签类别：PRESET 预设 / CUSTOM 自定义 */
  private String category;

  public Long getOwnerUserId() {
    return ownerUserId;
  }

  public void setOwnerUserId(Long ownerUserId) {
    this.ownerUserId = ownerUserId;
  }

  public String getName() {
    return name;
  }

  public void setName(String name) {
    this.name = name;
  }

  public String getColor() {
    return color;
  }

  public void setColor(String color) {
    this.color = color;
  }

  public String getCategory() {
    return category;
  }

  public void setCategory(String category) {
    this.category = category;
  }
}
