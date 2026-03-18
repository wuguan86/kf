package com.shijie.transit.adminapi.controller;

import com.shijie.transit.adminapi.service.MembershipPlanService;
import com.shijie.transit.common.db.entity.MembershipPlanEntity;
import com.shijie.transit.common.web.Result;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/membership/plans")
public class AdminMembershipPlanController {
  private final MembershipPlanService membershipPlanService;

  public AdminMembershipPlanController(MembershipPlanService membershipPlanService) {
    this.membershipPlanService = membershipPlanService;
  }

  @GetMapping
  public Result<Object> list(@RequestParam(name = "enabled", required = false) Boolean enabled) {
    return Result.success(membershipPlanService.list(enabled));
  }

  @PostMapping
  public Result<MembershipPlanEntity> create(@Valid @RequestBody CreatePlanRequest request) {
    MembershipPlanEntity entity = toEntity(request);
    entity.setEnabled(true);
    return Result.success(membershipPlanService.create(entity));
  }

  @PutMapping("/{id}")
  public Result<MembershipPlanEntity> update(@PathVariable("id") long id, @RequestBody UpdatePlanRequest request) {
    MembershipPlanEntity changes = toEntity(request);
    return Result.success(membershipPlanService.update(id, changes));
  }

  @PostMapping("/{id}/enabled")
  public Result<Void> setEnabled(@PathVariable("id") long id, @RequestParam("enabled") boolean enabled) {
    membershipPlanService.setEnabled(id, enabled);
    return Result.success(null);
  }

  private MembershipPlanEntity toEntity(PlanBase request) {
    MembershipPlanEntity entity = new MembershipPlanEntity();
    entity.setPlanCode(request.planCode());
    entity.setType(request.type());
    entity.setName(request.name());
    entity.setPriceCents(request.priceCents());
    entity.setSortWeight(request.sortWeight());
    entity.setIsRecommended(request.isRecommended());
    entity.setPeriodType(request.periodType());
    entity.setPointsIncluded(request.pointsIncluded());
    entity.setBonusPoints(request.bonusPoints());
    entity.setDescription(request.description());
    entity.setFeaturesJson(request.featuresJson());
    return entity;
  }

  public interface PlanBase {
    String planCode();

    String type();

    String name();

    Integer priceCents();

    Integer sortWeight();

    Boolean isRecommended();

    String periodType();

    Integer pointsIncluded();

    Integer bonusPoints();

    String description();

    String featuresJson();
  }

  public record CreatePlanRequest(
      @NotBlank String planCode,
      @NotBlank String type,
      @NotBlank String name,
      @NotNull Integer priceCents,
      @NotNull Integer sortWeight,
      @NotNull Boolean isRecommended,
      @NotBlank String periodType,
      @NotNull Integer pointsIncluded,
      @NotNull Integer bonusPoints,
      String description,
      String featuresJson) implements PlanBase {
  }

  public record UpdatePlanRequest(
      String planCode,
      String type,
      String name,
      Integer priceCents,
      Integer sortWeight,
      Boolean isRecommended,
      String periodType,
      Integer pointsIncluded,
      Integer bonusPoints,
      String description,
      String featuresJson) implements PlanBase {
  }
}
