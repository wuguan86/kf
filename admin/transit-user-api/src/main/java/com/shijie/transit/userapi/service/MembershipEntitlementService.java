package com.shijie.transit.userapi.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.shijie.transit.common.db.entity.MembershipPlanEntity;
import com.shijie.transit.common.db.entity.PaymentOrderEntity;
import com.shijie.transit.common.db.entity.PointsLedgerEntity;
import com.shijie.transit.common.db.entity.UserMembershipEntity;
import com.shijie.transit.common.mapper.MembershipPlanMapper;
import com.shijie.transit.common.tenant.TenantContext;
import com.shijie.transit.common.web.ErrorCode;
import com.shijie.transit.common.web.TransitException;
import com.shijie.transit.userapi.mapper.PointsLedgerMapper;
import com.shijie.transit.userapi.mapper.UserMembershipMapper;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class MembershipEntitlementService {
  private final MembershipPlanMapper membershipPlanMapper;
  private final UserMembershipMapper userMembershipMapper;
  private final PointsLedgerMapper pointsLedgerMapper;
  private final Clock clock;

  public MembershipEntitlementService(
      MembershipPlanMapper membershipPlanMapper,
      UserMembershipMapper userMembershipMapper,
      PointsLedgerMapper pointsLedgerMapper,
      Clock clock) {
    this.membershipPlanMapper = membershipPlanMapper;
    this.userMembershipMapper = userMembershipMapper;
    this.pointsLedgerMapper = pointsLedgerMapper;
    this.clock = clock;
  }

  public int normalizePurchaseCount(MembershipPlanEntity plan, Integer purchaseCount) {
    if (plan == null) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "套餐不存在");
    }
    if (!"SUBSCRIPTION".equalsIgnoreCase(plan.getType())) {
      return 1;
    }
    int safeCount = purchaseCount == null ? 1 : purchaseCount;
    if (safeCount < 1 || safeCount > 120) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "购买数量必须在1到120之间");
    }
    return safeCount;
  }

  public int calculateOrderAmount(MembershipPlanEntity plan, int purchaseCount) {
    if (plan == null || plan.getPriceCents() == null || plan.getPriceCents() <= 0) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "当前套餐不支持发起支付");
    }
    long total = (long) plan.getPriceCents() * purchaseCount;
    if (total > Integer.MAX_VALUE) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "订单金额超出系统限制");
    }
    return (int) total;
  }

  @Transactional
  public void refreshMembershipStatus(long userId) {
    LocalDateTime now = LocalDateTime.now(clock);
    List<UserMembershipEntity> memberships = userMembershipMapper.selectList(
        new LambdaQueryWrapper<UserMembershipEntity>()
            .eq(UserMembershipEntity::getUserId, userId)
            .orderByAsc(UserMembershipEntity::getEndAt)
            .orderByAsc(UserMembershipEntity::getId));
    if (memberships.isEmpty()) {
      return;
    }
    Map<Long, MembershipPlanEntity> planCache = new HashMap<>();
    for (UserMembershipEntity membership : memberships) {
      if (membership.getPlanId() == null) {
        settlePointsMembership(membership, now);
        continue;
      }
      MembershipPlanEntity plan = resolvePlan(planCache, membership.getPlanId());
      if (plan == null) {
        settlePointsMembership(membership, now);
        continue;
      }
      if ("SUBSCRIPTION".equalsIgnoreCase(plan.getType())) {
        settleSubscriptionMembership(membership, plan, now);
        continue;
      }
      if ("POINTS".equalsIgnoreCase(plan.getType())) {
        settlePointsMembership(membership, now);
      }
    }
  }

  public void validatePlanPurchase(long userId, MembershipPlanEntity targetPlan) {
    if (targetPlan == null) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "套餐不存在");
    }
    refreshMembershipStatus(userId);
    if (!"SUBSCRIPTION".equalsIgnoreCase(targetPlan.getType())) {
      return;
    }
    LocalDateTime now = LocalDateTime.now(clock);
    List<UserMembershipEntity> activeMemberships = userMembershipMapper.selectList(
        new LambdaQueryWrapper<UserMembershipEntity>()
            .eq(UserMembershipEntity::getUserId, userId)
            .gt(UserMembershipEntity::getEndAt, now)
            .orderByDesc(UserMembershipEntity::getEndAt)
            .last("limit 50"));
    if (activeMemberships.isEmpty()) {
      return;
    }
    Map<Long, MembershipPlanEntity> planCache = new HashMap<>();
    for (UserMembershipEntity membership : activeMemberships) {
      MembershipPlanEntity plan = resolvePlan(planCache, membership.getPlanId());
      if (plan == null || !"SUBSCRIPTION".equalsIgnoreCase(plan.getType())) {
        continue;
      }
      if (!Objects.equals(plan.getId(), targetPlan.getId())) {
        throw new TransitException(ErrorCode.BAD_REQUEST, "当前套餐生效期内不可购买其他会员套餐");
      }
    }
  }

  @Transactional
  public void applyPaidOrder(PaymentOrderEntity order) {
    MembershipPlanEntity plan = membershipPlanMapper.selectById(order.getPlanId());
    if (plan == null) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "订单对应套餐不存在");
    }
    refreshMembershipStatus(order.getUserId());
    int purchaseCount = parsePurchaseCount(order.getAttachData());
    if ("SUBSCRIPTION".equalsIgnoreCase(plan.getType())) {
      int safePurchaseCount = normalizePurchaseCount(plan, purchaseCount);
      validatePlanPurchase(order.getUserId(), plan);
      grantSubscriptionByPlan(order.getUserId(), plan, safePurchaseCount, order.getOutTradeNo());
      return;
    }
    if ("POINTS".equalsIgnoreCase(plan.getType())) {
      int points = Math.max(0, safeInt(plan.getPointsIncluded()) + safeInt(plan.getBonusPoints()));
      grantPointsByAmount(order.getUserId(), plan.getId(), points, order.getOutTradeNo());
      return;
    }
    throw new TransitException(ErrorCode.BAD_REQUEST, "不支持的套餐类型: " + plan.getType());
  }

  @Transactional
  public void applyInvitationMembership(
      long userId,
      MembershipPlanEntity plan,
      Integer purchaseCount,
      String referenceId) {
    if (plan == null || !"SUBSCRIPTION".equalsIgnoreCase(plan.getType())) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "邀请码会员配置不合法");
    }
    int safePurchaseCount = normalizePurchaseCount(plan, purchaseCount);
    validatePlanPurchase(userId, plan);
    refreshMembershipStatus(userId);
    grantSubscriptionByPlan(userId, plan, safePurchaseCount, referenceId);
  }

  @Transactional
  public void applyInvitationPoints(long userId, Integer points, String referenceId) {
    int delta = Math.max(0, safeInt(points));
    refreshMembershipStatus(userId);
    grantPointsByAmount(userId, null, delta, referenceId);
  }

  @Transactional
  public boolean deductPoints(long userId, int amount, String reason, String refId) {
    if (amount <= 0) return true;
    refreshMembershipStatus(userId);
    List<UserMembershipEntity> activeMemberships = userMembershipMapper.selectList(
        new LambdaQueryWrapper<UserMembershipEntity>()
            .eq(UserMembershipEntity::getUserId, userId)
            .eq(UserMembershipEntity::getStatus, "active")
            .gt(UserMembershipEntity::getPointsBalance, 0)
            .orderByAsc(UserMembershipEntity::getEndAt)
            .orderByAsc(UserMembershipEntity::getId));
    Map<Long, MembershipPlanEntity> planCache = new HashMap<>();
    activeMemberships.sort(
        Comparator
            .comparing(
                UserMembershipEntity::getEndAt,
                Comparator.nullsLast(LocalDateTime::compareTo))
            .thenComparing(membership -> membershipTypePriority(resolveMembershipType(membership, planCache)))
            .thenComparing(UserMembershipEntity::getId, Comparator.nullsLast(Long::compareTo)));
            
    int totalAvailable = activeMemberships.stream().mapToInt(m -> safeInt(m.getPointsBalance())).sum();
    if (totalAvailable < amount) {
      return false;
    }
    
    int remainingToDeduct = amount;
    for (UserMembershipEntity m : activeMemberships) {
      if (remainingToDeduct <= 0) break;
      int balance = safeInt(m.getPointsBalance());
      int deductHere = Math.min(balance, remainingToDeduct);
      m.setPointsBalance(balance - deductHere);
      userMembershipMapper.updateById(m);
      remainingToDeduct -= deductHere;
    }
    
    insertLedger(userId, -amount, totalAvailable - amount, reason, refId);
    return true;
  }

  private String resolveMembershipType(UserMembershipEntity membership, Map<Long, MembershipPlanEntity> planCache) {
    if (membership == null || membership.getPlanId() == null) {
      return "POINTS";
    }
    MembershipPlanEntity plan = resolvePlan(planCache, membership.getPlanId());
    if (plan == null || !StringUtils.hasText(plan.getType())) {
      return "POINTS";
    }
    return plan.getType().toUpperCase(Locale.ROOT);
  }

  private int membershipTypePriority(String membershipType) {
    if ("SUBSCRIPTION".equalsIgnoreCase(membershipType)) {
      return 0;
    }
    if ("POINTS".equalsIgnoreCase(membershipType)) {
      return 1;
    }
    return 2;
  }

  private void grantSubscriptionByPlan(long userId, MembershipPlanEntity plan, int purchaseCount, String referenceId) {
    int periodCount = calculateSubscriptionMonthCount(plan, purchaseCount);
    grantSubscriptionMonths(userId, plan, periodCount, referenceId);
  }

  private int calculateSubscriptionMonthCount(MembershipPlanEntity plan, int purchaseCount) {
    if ("YEARLY".equalsIgnoreCase(plan.getPeriodType())) {
      return purchaseCount * 12;
    }
    return purchaseCount;
  }

  private void grantSubscriptionMonths(long userId, MembershipPlanEntity plan, int monthCount, String referenceId) {
    if (monthCount <= 0) {
      return;
    }
    int monthlyGrant = Math.max(0, safeInt(plan.getPointsIncluded()) + safeInt(plan.getBonusPoints()));
    LocalDateTime now = LocalDateTime.now(clock);
    LocalDateTime cursor = resolveSubscriptionAppendStart(userId, plan.getId(), now);
    for (int i = 0; i < monthCount; i++) {
      UserMembershipEntity membership = new UserMembershipEntity();
      membership.setTenantId(TenantContext.getTenantId());
      membership.setUserId(userId);
      membership.setPlanId(plan.getId());
      membership.setStartAt(cursor);
      LocalDateTime endAt = cursor.plusMonths(1);
      membership.setEndAt(endAt);
      boolean started = !cursor.isAfter(now);
      int balance = started ? monthlyGrant : 0;
      membership.setPointsBalance(balance);
      membership.setStatus(started ? "active" : "scheduled");
      userMembershipMapper.insert(membership);
      if (started && balance > 0) {
        insertLedger(userId, balance, balance, "subscription_month_grant", buildLedgerRef(referenceId, membership.getId()));
      }
      cursor = endAt;
    }
  }

  private void grantPointsByAmount(long userId, Long planId, int points, String referenceId) {
    int delta = Math.max(0, points);
    LocalDateTime now = LocalDateTime.now(clock);
    UserMembershipEntity membership = new UserMembershipEntity();
    membership.setTenantId(TenantContext.getTenantId());
    membership.setUserId(userId);
    membership.setPlanId(planId);
    membership.setStartAt(now);
    membership.setEndAt(now.plusMonths(6));
    membership.setStatus("active");
    membership.setPointsBalance(delta);
    userMembershipMapper.insert(membership);
    if (delta > 0) {
      insertLedger(userId, delta, delta, "points_package_grant", buildLedgerRef(referenceId, membership.getId()));
    }
  }

  private String buildLedgerRef(String referenceId, Long membershipId) {
    String membershipPart = membershipId == null ? "" : membershipId.toString();
    if (!StringUtils.hasText(referenceId)) {
      return membershipPart;
    }
    if (!StringUtils.hasText(membershipPart)) {
      return referenceId;
    }
    return referenceId + ":" + membershipPart;
  }

  private LocalDateTime resolveSubscriptionAppendStart(long userId, Long planId, LocalDateTime now) {
    UserMembershipEntity latest = userMembershipMapper.selectOne(
        new LambdaQueryWrapper<UserMembershipEntity>()
            .eq(UserMembershipEntity::getUserId, userId)
            .eq(UserMembershipEntity::getPlanId, planId)
            .gt(UserMembershipEntity::getEndAt, now)
            .orderByDesc(UserMembershipEntity::getEndAt)
            .last("limit 1"));
    if (latest == null || latest.getEndAt() == null) {
      return now;
    }
    return latest.getEndAt();
  }

  private void settleSubscriptionMembership(UserMembershipEntity membership, MembershipPlanEntity plan, LocalDateTime now) {
    LocalDateTime startAt = membership.getStartAt();
    LocalDateTime endAt = membership.getEndAt();
    int beforeBalance = Math.max(0, safeInt(membership.getPointsBalance()));
    int monthlyGrant = Math.max(0, safeInt(plan.getPointsIncluded()) + safeInt(plan.getBonusPoints()));
    boolean changed = false;
    int newBalance = beforeBalance;
    String newStatus = membership.getStatus();

    if (endAt != null && !endAt.isAfter(now)) {
      if (beforeBalance > 0) {
        newBalance = 0;
        insertLedger(
            membership.getUserId(),
            -beforeBalance,
            0,
            "subscription_month_expire",
            membership.getId().toString());
        changed = true;
      }
      if (!"expired".equalsIgnoreCase(newStatus)) {
        newStatus = "expired";
        changed = true;
      }
    } else if (startAt != null && !startAt.isAfter(now)) {
      if (!"active".equalsIgnoreCase(newStatus)) {
        newStatus = "active";
        changed = true;
      }
      if (beforeBalance <= 0 && monthlyGrant > 0) {
        newBalance = monthlyGrant;
        insertLedger(
            membership.getUserId(),
            monthlyGrant,
            monthlyGrant,
            "subscription_month_grant",
            membership.getId().toString());
        changed = true;
      }
    } else {
      if (!"scheduled".equalsIgnoreCase(newStatus)) {
        newStatus = "scheduled";
        changed = true;
      }
      if (beforeBalance != 0) {
        newBalance = 0;
        changed = true;
      }
    }

    if (changed) {
      membership.setStatus(newStatus);
      membership.setPointsBalance(newBalance);
      userMembershipMapper.updateById(membership);
    }
  }

  private void settlePointsMembership(UserMembershipEntity membership, LocalDateTime now) {
    LocalDateTime endAt = membership.getEndAt();
    int beforeBalance = Math.max(0, safeInt(membership.getPointsBalance()));
    boolean changed = false;
    int newBalance = beforeBalance;
    String newStatus = membership.getStatus();

    if (endAt != null && !endAt.isAfter(now)) {
      if (beforeBalance > 0) {
        newBalance = 0;
        insertLedger(
            membership.getUserId(),
            -beforeBalance,
            0,
            "points_package_expire",
            membership.getId().toString());
        changed = true;
      }
      if (!"expired".equalsIgnoreCase(newStatus)) {
        newStatus = "expired";
        changed = true;
      }
    } else if (!"active".equalsIgnoreCase(newStatus)) {
      newStatus = "active";
      changed = true;
    }

    if (changed) {
      membership.setStatus(newStatus);
      membership.setPointsBalance(newBalance);
      userMembershipMapper.updateById(membership);
    }
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

  private int parsePurchaseCount(String attachData) {
    if (!StringUtils.hasText(attachData)) {
      return 1;
    }
    String[] pairs = attachData.split("&");
    for (String pair : pairs) {
      String[] kv = pair.split("=", 2);
      if (kv.length != 2) {
        continue;
      }
      if (!"purchaseCount".equalsIgnoreCase(kv[0])) {
        continue;
      }
      try {
        int parsed = Integer.parseInt(kv[1]);
        return Math.max(1, Math.min(parsed, 120));
      } catch (Exception ignored) {
        return 1;
      }
    }
    return 1;
  }

  private int safeInt(Integer value) {
    return value == null ? 0 : value;
  }

  private void insertLedger(long userId, int delta, int balanceAfter, String reason, String refId) {
    PointsLedgerEntity ledger = new PointsLedgerEntity();
    ledger.setTenantId(TenantContext.getTenantId());
    ledger.setUserId(userId);
    ledger.setDelta(delta);
    ledger.setBalanceAfter(balanceAfter);
    ledger.setReason(StringUtils.hasText(reason) ? reason.toLowerCase(Locale.ROOT) : "");
    ledger.setRefId(refId);
    pointsLedgerMapper.insert(ledger);
  }
}
