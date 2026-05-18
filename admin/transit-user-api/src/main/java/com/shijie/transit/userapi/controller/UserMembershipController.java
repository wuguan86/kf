package com.shijie.transit.userapi.controller;

import com.shijie.transit.common.db.entity.MembershipPlanEntity;
import com.shijie.transit.common.db.entity.PointsLedgerEntity;
import com.shijie.transit.common.db.entity.UserMembershipEntity;
import com.shijie.transit.common.security.TransitPrincipal;
import com.shijie.transit.common.web.Result;
import com.shijie.transit.userapi.service.MembershipQueryService;

import java.time.LocalDateTime;
import java.util.List;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/user")
public class UserMembershipController {
  private final MembershipQueryService membershipQueryService;

  public UserMembershipController(MembershipQueryService membershipQueryService) {
    this.membershipQueryService = membershipQueryService;
  }

  @GetMapping("/membership/plans")
  public Result<List<MembershipPlanEntity>> plans() {
    return Result.success(membershipQueryService.listEnabledPlans());
  }

  @GetMapping("/membership/me")
  public Result<MyMembershipResponse> myMembership() {
    TransitPrincipal principal = currentPrincipal();
    MembershipQueryService.MyMembershipSnapshot snapshot = membershipQueryService.queryMyMembership(principal.subjectId());
    UserMembershipEntity membership = snapshot.membership();
    
    int totalPoints = Math.max(0, safeInt(snapshot.subscriptionPoints())) + Math.max(0, safeInt(snapshot.packagePoints()));
    
    if (membership == null && totalPoints == 0) {
      return Result.success(new MyMembershipResponse(null, null));
    }
    
    String status = membership != null ? membership.getStatus() : "active";
    LocalDateTime startAt = membership != null ? membership.getStartAt() : null;
    LocalDateTime endAt = membership != null ? membership.getEndAt() : null;
    MembershipPlanEntity plan = snapshot.plan();
    
    return Result.success(new MyMembershipResponse(
        new MembershipInfo(
            status,
            startAt,
            endAt,
            totalPoints,
            Math.max(0, safeInt(snapshot.subscriptionPoints())),
            Math.max(0, safeInt(snapshot.packagePoints()))),
        plan));
  }

  @GetMapping("/points/ledger")
  public Result<List<PointsLedgerEntity>> pointsLedger(@RequestParam(name = "limit", required = false, defaultValue = "50") int limit) {
    TransitPrincipal principal = currentPrincipal();
    return Result.success(membershipQueryService.listPointsLedger(principal.subjectId(), limit));
  }

  private TransitPrincipal currentPrincipal() {
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    return (TransitPrincipal) authentication.getPrincipal();
  }

  private int safeInt(Integer value) {
    return value == null ? 0 : value;
  }

  public record MyMembershipResponse(MembershipInfo membership, MembershipPlanEntity plan) {
  }

  public record MembershipInfo(
      String status,
      LocalDateTime startAt,
      LocalDateTime endAt,
      Integer pointsBalance,
      Integer subscriptionPoints,
      Integer packagePoints) {
  }
}
