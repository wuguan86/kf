package com.shijie.transit.userapi.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.shijie.transit.common.db.entity.MembershipPlanEntity;
import com.shijie.transit.common.db.entity.PointsLedgerEntity;
import com.shijie.transit.common.db.entity.UserMembershipEntity;
import com.shijie.transit.common.mapper.MembershipPlanMapper;
import com.shijie.transit.userapi.mapper.PointsLedgerMapper;
import com.shijie.transit.userapi.mapper.UserMembershipMapper;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.springframework.stereotype.Service;

@Service
public class MembershipQueryService {
  private final MembershipPlanMapper membershipPlanMapper;
  private final UserMembershipMapper userMembershipMapper;
  private final PointsLedgerMapper pointsLedgerMapper;
  private final MembershipEntitlementService membershipEntitlementService;
  private final Clock clock;

  public MembershipQueryService(
      MembershipPlanMapper membershipPlanMapper,
      UserMembershipMapper userMembershipMapper,
      PointsLedgerMapper pointsLedgerMapper,
      MembershipEntitlementService membershipEntitlementService,
      Clock clock) {
    this.membershipPlanMapper = membershipPlanMapper;
    this.userMembershipMapper = userMembershipMapper;
    this.pointsLedgerMapper = pointsLedgerMapper;
    this.membershipEntitlementService = membershipEntitlementService;
    this.clock = clock;
  }

  public List<MembershipPlanEntity> listEnabledPlans() {
    return membershipPlanMapper.selectList(
        new LambdaQueryWrapper<MembershipPlanEntity>()
            .eq(MembershipPlanEntity::getEnabled, true)
            .orderByDesc(MembershipPlanEntity::getType)
            .orderByAsc(MembershipPlanEntity::getSortWeight)
            .orderByAsc(MembershipPlanEntity::getId));
  }

  public MyMembershipSnapshot queryMyMembership(long userId) {
    membershipEntitlementService.refreshMembershipStatus(userId);
    LocalDateTime now = LocalDateTime.now(clock);
    List<UserMembershipEntity> candidates = userMembershipMapper.selectList(
        new LambdaQueryWrapper<UserMembershipEntity>()
            .eq(UserMembershipEntity::getUserId, userId)
            .gt(UserMembershipEntity::getEndAt, now)
            .orderByAsc(UserMembershipEntity::getStartAt)
            .orderByAsc(UserMembershipEntity::getId));
    if (candidates.isEmpty()) {
      return new MyMembershipSnapshot(null, null, 0, 0);
    }
    Map<Long, MembershipPlanEntity> planCache = new HashMap<>();
    int subscriptionPoints = 0;
    int packagePoints = 0;
    UserMembershipEntity currentSubscription = null;
    MembershipPlanEntity currentSubscriptionPlan = null;
    LocalDateTime subscriptionExpiry = null;
    for (UserMembershipEntity membership : candidates) {
      if (membership.getPlanId() == null) {
        int balance = Math.max(0, safeInt(membership.getPointsBalance()));
        packagePoints += balance;
        continue;
      }
      MembershipPlanEntity plan = resolvePlan(planCache, membership.getPlanId());
      if (plan == null) {
        int balance = Math.max(0, safeInt(membership.getPointsBalance()));
        packagePoints += balance;
        continue;
      }
      int balance = Math.max(0, safeInt(membership.getPointsBalance()));
      if ("SUBSCRIPTION".equalsIgnoreCase(plan.getType())) {
        subscriptionPoints += balance;
        if (currentSubscription == null && isCurrentPeriod(membership, now)) {
          currentSubscription = membership;
          currentSubscriptionPlan = plan;
        }
        if (Objects.equals(plan.getId(), currentSubscriptionPlan == null ? null : currentSubscriptionPlan.getId())) {
          if (membership.getEndAt() != null && (subscriptionExpiry == null || membership.getEndAt().isAfter(subscriptionExpiry))) {
            subscriptionExpiry = membership.getEndAt();
          }
        }
      } else if ("POINTS".equalsIgnoreCase(plan.getType())) {
        packagePoints += balance;
      }
    }
    if (currentSubscription != null && subscriptionExpiry != null) {
      currentSubscription.setEndAt(subscriptionExpiry);
    }
    return new MyMembershipSnapshot(currentSubscription, currentSubscriptionPlan, subscriptionPoints, packagePoints);
  }

  public List<PointsLedgerEntity> listPointsLedger(long userId, int limit) {
    membershipEntitlementService.refreshMembershipStatus(userId);
    int safeLimit = Math.max(1, Math.min(limit, 200));
    return pointsLedgerMapper.selectList(
        new LambdaQueryWrapper<PointsLedgerEntity>()
            .eq(PointsLedgerEntity::getUserId, userId)
            .orderByDesc(PointsLedgerEntity::getCreatedAt)
            .last("limit " + safeLimit));
  }

  private MembershipPlanEntity resolvePlan(Map<Long, MembershipPlanEntity> planCache, Long planId) {
    if (planId == null) {
      return null;
    }
    MembershipPlanEntity cached = planCache.get(planId);
    if (cached != null) {
      return cached;
    }
    MembershipPlanEntity plan = membershipPlanMapper.selectById(planId);
    if (plan != null) {
      planCache.put(planId, plan);
    }
    return plan;
  }

  private boolean isCurrentPeriod(UserMembershipEntity membership, LocalDateTime now) {
    if (membership.getStartAt() == null || membership.getEndAt() == null) {
      return false;
    }
    return !membership.getStartAt().isAfter(now) && membership.getEndAt().isAfter(now);
  }

  private int safeInt(Integer value) {
    return value == null ? 0 : value;
  }

  public record MyMembershipSnapshot(
      UserMembershipEntity membership,
      MembershipPlanEntity plan,
      Integer subscriptionPoints,
      Integer packagePoints) {
  }
}
