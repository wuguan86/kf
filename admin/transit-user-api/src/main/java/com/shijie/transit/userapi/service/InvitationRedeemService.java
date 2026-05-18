package com.shijie.transit.userapi.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.shijie.transit.common.db.entity.InvitationCodeEntity;
import com.shijie.transit.common.db.entity.MembershipPlanEntity;
import com.shijie.transit.common.db.mapper.InvitationCodeMapper;
import com.shijie.transit.common.mapper.MembershipPlanMapper;
import com.shijie.transit.common.web.ErrorCode;
import com.shijie.transit.common.web.TransitException;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.Locale;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class InvitationRedeemService {
  private final InvitationCodeMapper invitationCodeMapper;
  private final MembershipPlanMapper membershipPlanMapper;
  private final MembershipEntitlementService membershipEntitlementService;
  private final Clock clock;

  public InvitationRedeemService(
      InvitationCodeMapper invitationCodeMapper,
      MembershipPlanMapper membershipPlanMapper,
      MembershipEntitlementService membershipEntitlementService,
      Clock clock) {
    this.invitationCodeMapper = invitationCodeMapper;
    this.membershipPlanMapper = membershipPlanMapper;
    this.membershipEntitlementService = membershipEntitlementService;
    this.clock = clock;
  }

  @Transactional
  public RedeemResult redeem(long userId, String rawCode) {
    String code = rawCode == null ? "" : rawCode.trim().toUpperCase(Locale.ROOT);
    if (!StringUtils.hasText(code)) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "邀请码不能为空");
    }
    LocalDateTime now = LocalDateTime.now(clock);
    InvitationCodeEntity invitationCode = invitationCodeMapper.selectOne(
        new LambdaQueryWrapper<InvitationCodeEntity>()
            .eq(InvitationCodeEntity::getCode, code)
            .last("limit 1"));
    if (invitationCode == null) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "邀请码不存在");
    }
    int affected = invitationCodeMapper.markRedeemedIfAvailable(invitationCode.getId(), now, now);
    if (affected == 0) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "邀请码已失效或已用完");
    }

    String referenceId = "invitation:" + invitationCode.getCode();
    if (safeInt(invitationCode.getType()) == 1) {
      MembershipPlanEntity plan = membershipPlanMapper.selectById(invitationCode.getPlanId());
      if (plan == null || !"SUBSCRIPTION".equalsIgnoreCase(plan.getType())) {
        throw new TransitException(ErrorCode.BAD_REQUEST, "邀请码会员配置无效");
      }
      int purchaseCount = convertToPlanPurchaseCount(invitationCode, plan);
      membershipEntitlementService.applyInvitationMembership(userId, plan, purchaseCount, referenceId);
      InvitationCodeEntity latest = invitationCodeMapper.selectById(invitationCode.getId());
      int remain = Math.max(0, safeInt(latest.getTotalCount()) - safeInt(latest.getUsedCount()));
      return new RedeemResult("MEMBERSHIP", plan.getName(), purchaseCount, 0, remain);
    }

    if (safeInt(invitationCode.getType()) == 2) {
      int points = Math.max(0, safeInt(invitationCode.getPoints()));
      membershipEntitlementService.applyInvitationPoints(userId, points, referenceId);
      InvitationCodeEntity latest = invitationCodeMapper.selectById(invitationCode.getId());
      int remain = Math.max(0, safeInt(latest.getTotalCount()) - safeInt(latest.getUsedCount()));
      return new RedeemResult("POINTS", "", 0, points, remain);
    }

    throw new TransitException(ErrorCode.BAD_REQUEST, "不支持的邀请码类型");
  }

  private int convertToPlanPurchaseCount(InvitationCodeEntity invitationCode, MembershipPlanEntity plan) {
    int duration = Math.max(1, safeInt(invitationCode.getDuration()));
    String durationUnit = StringUtils.hasText(invitationCode.getDurationUnit())
        ? invitationCode.getDurationUnit().trim().toUpperCase(Locale.ROOT)
        : "MONTH";
    int months;
    if ("YEAR".equals(durationUnit) || "YEARS".equals(durationUnit)) {
      months = duration * 12;
    } else if ("DAY".equals(durationUnit) || "DAYS".equals(durationUnit)) {
      months = Math.max(1, (duration + 29) / 30);
    } else {
      months = duration;
    }
    if ("YEARLY".equalsIgnoreCase(plan.getPeriodType())) {
      return Math.max(1, (months + 11) / 12);
    }
    return months;
  }

  private int safeInt(Integer value) {
    return value == null ? 0 : value;
  }

  public record RedeemResult(
      String rewardType,
      String membershipName,
      Integer durationCount,
      Integer points,
      Integer remainCount) {
  }
}
