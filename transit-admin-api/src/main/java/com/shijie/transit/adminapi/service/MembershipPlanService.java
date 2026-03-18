package com.shijie.transit.adminapi.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.shijie.transit.common.db.entity.MembershipPlanEntity;
import com.shijie.transit.common.mapper.MembershipPlanMapper;
import com.shijie.transit.common.tenant.TenantContext;

import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class MembershipPlanService {
  private final MembershipPlanMapper membershipPlanMapper;

  public MembershipPlanService(MembershipPlanMapper membershipPlanMapper) {
    this.membershipPlanMapper = membershipPlanMapper;
  }

  public List<MembershipPlanEntity> list(Boolean enabled) {
    LambdaQueryWrapper<MembershipPlanEntity> wrapper = new LambdaQueryWrapper<>();
    if (enabled != null) {
      wrapper.eq(MembershipPlanEntity::getEnabled, enabled);
    }
    wrapper.orderByDesc(MembershipPlanEntity::getType).orderByAsc(MembershipPlanEntity::getSortWeight).orderByAsc(MembershipPlanEntity::getId);
    return membershipPlanMapper.selectList(wrapper);
  }

  @Transactional
  public MembershipPlanEntity create(MembershipPlanEntity entity) {
    entity.setTenantId(TenantContext.getTenantId());
    if (entity.getDescription() == null) {
      entity.setDescription("");
    }
    if (entity.getFeaturesJson() == null) {
      entity.setFeaturesJson("{}");
    }
    if (entity.getEnabled() == null) {
      entity.setEnabled(true);
    }
    if (entity.getSortWeight() == null) {
      entity.setSortWeight(0);
    }
    if (entity.getIsRecommended() == null) {
      entity.setIsRecommended(false);
    }
    if (entity.getPeriodType() == null) {
      entity.setPeriodType("MONTHLY");
    }
    if (StringUtils.hasText(entity.getPlanCode())) {
      entity.setPlanCode(entity.getPlanCode().trim());
    }
    if (StringUtils.hasText(entity.getName())) {
      entity.setName(entity.getName().trim());
    }
    membershipPlanMapper.insert(entity);
    return entity;
  }

  /**
   * 更新会员套餐信息
   * <p>
   * 仅更新非空字段。
   * 同时会检查现有数据的必填字段（如featuresJson），确保不为null。
   * </p>
   *
   * @param id 套餐ID
   * @param changes 包含变更字段的实体对象
   * @return 更新后的完整实体对象
   * @throws IllegalArgumentException 如果套餐不存在
   */
  @Transactional
  public MembershipPlanEntity update(long id, MembershipPlanEntity changes) {
    MembershipPlanEntity existing = membershipPlanMapper.selectById(id);
    if (existing == null) {
      throw new IllegalArgumentException("plan not found");
    }
    if (changes.getPlanCode() != null) {
      existing.setPlanCode(changes.getPlanCode());
    }
    if (changes.getName() != null) {
      existing.setName(changes.getName());
    }
    if (changes.getPriceCents() != null) {
      existing.setPriceCents(changes.getPriceCents());
    }
    if (changes.getSortWeight() != null) {
      existing.setSortWeight(changes.getSortWeight());
    }
    if (changes.getIsRecommended() != null) {
      existing.setIsRecommended(changes.getIsRecommended());
    }
    if (changes.getPeriodType() != null) {
      existing.setPeriodType(changes.getPeriodType());
    }
    if (changes.getPointsIncluded() != null) {
      existing.setPointsIncluded(changes.getPointsIncluded());
    }
    if (changes.getBonusPoints() != null) {
      existing.setBonusPoints(changes.getBonusPoints());
    }
    if (changes.getEnabled() != null) {
      existing.setEnabled(changes.getEnabled());
    }
    if (changes.getDescription() != null) {
      existing.setDescription(changes.getDescription());
    }
    if (changes.getFeaturesJson() != null) {
      existing.setFeaturesJson(changes.getFeaturesJson());
    }
    if (existing.getDescription() == null) {
      existing.setDescription("");
    }
    if (existing.getFeaturesJson() == null) {
      existing.setFeaturesJson("{}");
    }
    if (existing.getEnabled() == null) {
      existing.setEnabled(true);
    }
    membershipPlanMapper.updateById(existing);
    return membershipPlanMapper.selectById(id);
  }

  @Transactional
  public void setEnabled(long id, boolean enabled) {
    MembershipPlanEntity existing = membershipPlanMapper.selectById(id);
    if (existing == null) {
      throw new IllegalArgumentException("plan not found");
    }
    existing.setEnabled(enabled);
    membershipPlanMapper.updateById(existing);
  }
}
