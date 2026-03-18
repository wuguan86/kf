package com.shijie.transit.common.db.entity;

import com.baomidou.mybatisplus.annotation.TableName;

/**
 * 会员套餐实体类
 * <p>
 * 对应数据库表 membership_plan，定义了系统支持的会员权益套餐。
 * 包含套餐的基本信息（名称、价格、有效期）和权益详情（席位、积分、特性列表）。
 * </p>
 */
@TableName("membership_plan")
public class MembershipPlanEntity extends BaseTenantEntity {
  /** 套餐编码 (英文唯一标识) */
  private String planCode;

  /** 套餐类型 (SUBSCRIPTION: 订阅会员, POINTS: 积分充值) */
  private String type;

  /** 套餐名称 (中文显示名) */
  private String name;

  /** 价格 (单位: 分) */
  private Integer priceCents;

  /** 排序权重 (数值越小越靠前) */
  private Integer sortWeight;

  /** 是否推荐 (true: 推荐, false: 普通) */
  private Boolean isRecommended;

  /** 套餐周期类型 (MONTHLY: 月付, YEARLY: 年付, PERMANENT: 永久) */
  private String periodType;

  /** 套餐包含的基础积分 */
  private Integer pointsIncluded;

  /** 赠送的额外积分 */
  private Integer bonusPoints;

  /** 是否上架 (true: 上架, false: 下架) */
  private Boolean enabled;

  /** 套餐详细描述 */
  private String description;

  /**
   * 套餐特性列表 (JSON字符串)
   * <p>
   * 存储结构示例: {"highlights": ["特性1", "特性2"]}
   * 注意: 数据库字段为TEXT类型，不支持默认值，代码层需保证非空，默认为 "{}"
   * </p>
   */
  private String featuresJson;

  public String getPlanCode() {
    return planCode;
  }

  public void setPlanCode(String planCode) {
    this.planCode = planCode;
  }

  public String getType() {
    return type;
  }

  public void setType(String type) {
    this.type = type;
  }

  public String getName() {
    return name;
  }

  public void setName(String name) {
    this.name = name;
  }

  public Integer getPriceCents() {
    return priceCents;
  }

  public void setPriceCents(Integer priceCents) {
    this.priceCents = priceCents;
  }

  public Integer getSortWeight() {
    return sortWeight;
  }

  public void setSortWeight(Integer sortWeight) {
    this.sortWeight = sortWeight;
  }

  public Boolean getIsRecommended() {
    return isRecommended;
  }

  public void setIsRecommended(Boolean isRecommended) {
    this.isRecommended = isRecommended;
  }

  public String getPeriodType() {
    return periodType;
  }

  public void setPeriodType(String periodType) {
    this.periodType = periodType;
  }

  public Integer getPointsIncluded() {
    return pointsIncluded;
  }

  public void setPointsIncluded(Integer pointsIncluded) {
    this.pointsIncluded = pointsIncluded;
  }

  public Integer getBonusPoints() {
    return bonusPoints;
  }

  public void setBonusPoints(Integer bonusPoints) {
    this.bonusPoints = bonusPoints;
  }

  public Boolean getEnabled() {
    return enabled;
  }

  public void setEnabled(Boolean enabled) {
    this.enabled = enabled;
  }

  public String getDescription() {
    return description;
  }

  public void setDescription(String description) {
    this.description = description;
  }

  public String getFeaturesJson() {
    return featuresJson;
  }

  public void setFeaturesJson(String featuresJson) {
    this.featuresJson = featuresJson;
  }
}
