package com.shijie.transit.userapi.controller;

import com.shijie.transit.common.security.TransitPrincipal;
import com.shijie.transit.common.web.Result;
import com.shijie.transit.userapi.dto.SmartSalesDto.CreateFollowUpRequest;
import com.shijie.transit.userapi.dto.SmartSalesDto.CreateTagRequest;
import com.shijie.transit.userapi.dto.SmartSalesDto.ConfirmBasicInfoRequest;
import com.shijie.transit.userapi.dto.SmartSalesDto.SaveCustomerRequest;
import com.shijie.transit.userapi.dto.SmartSalesDto.UpdateCustomerTagsRequest;
import com.shijie.transit.userapi.dto.SmartSalesDto.UpdateStageRequest;
import com.shijie.transit.userapi.dto.SmartSalesDto.UpdateStarredRequest;
import com.shijie.transit.userapi.dto.SmartSalesDto.UpdateTagRequest;
import com.shijie.transit.userapi.service.SmartSalesService;
import com.shijie.transit.userapi.service.UserProfileAIService;
import com.shijie.transit.userapi.vo.SmartSalesVo.AiProfile;
import com.shijie.transit.userapi.vo.SmartSalesVo.CustomerListItem;
import com.shijie.transit.userapi.vo.SmartSalesVo.CustomerListResponse;
import com.shijie.transit.userapi.vo.SmartSalesVo.CustomerProfile;
import com.shijie.transit.userapi.vo.SmartSalesVo.DashboardView;
import com.shijie.transit.userapi.vo.SmartSalesVo.FollowUpSuggestion;
import com.shijie.transit.userapi.vo.SmartSalesVo.FollowUpView;
import com.shijie.transit.userapi.vo.SmartSalesVo.TagView;
import java.util.List;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 智能销售接口(用户端)。
 * <p>
 * 路径前缀 {@code /api/user/smart-sales}，全部走用户端鉴权与租户隔离。
 */
@RestController
@RequestMapping("/api/user/smart-sales")
public class UserSmartSalesController {

  private final SmartSalesService smartSalesService;
  private final UserProfileAIService userProfileAIService;

  public UserSmartSalesController(
      SmartSalesService smartSalesService,
      UserProfileAIService userProfileAIService) {
    this.smartSalesService = smartSalesService;
    this.userProfileAIService = userProfileAIService;
  }

  // ===================== 工作台 =====================

  @GetMapping("/dashboard")
  public Result<DashboardView> getDashboard() {
    return Result.success(smartSalesService.getDashboard(currentUserId()));
  }

  // ===================== 客户列表/档案 =====================

  @GetMapping("/customers")
  public Result<CustomerListResponse> listCustomers(
      @RequestParam(value = "pageNo", defaultValue = "1") long pageNo,
      @RequestParam(value = "pageSize", defaultValue = "20") long pageSize,
      @RequestParam(value = "intentLevel", required = false) Integer intentLevel,
      @RequestParam(value = "stage", required = false) String stage,
      @RequestParam(value = "starred", required = false) Boolean starred,
      @RequestParam(value = "keyword", required = false) String keyword) {
    return Result.success(smartSalesService.listCustomers(
        currentUserId(), pageNo, pageSize, intentLevel, stage, starred, keyword));
  }

  @GetMapping("/customers/{contactKey}")
  public Result<CustomerProfile> getProfile(@PathVariable("contactKey") String contactKey) {
    return Result.success(smartSalesService.getProfile(currentUserId(), contactKey));
  }

  @PostMapping("/customers")
  public Result<CustomerProfile> saveCustomer(@RequestBody SaveCustomerRequest request) {
    return Result.success(smartSalesService.saveCustomer(currentUserId(), request));
  }

  @PostMapping("/customers/{contactKey}/stage")
  public Result<CustomerProfile> updateStage(
      @PathVariable("contactKey") String contactKey,
      @RequestBody UpdateStageRequest request) {
    return Result.success(smartSalesService.updateStage(currentUserId(), contactKey, request.stage()));
  }

  @PostMapping("/customers/{contactKey}/starred")
  public Result<CustomerProfile> updateStarred(
      @PathVariable("contactKey") String contactKey,
      @RequestBody UpdateStarredRequest request) {
    return Result.success(smartSalesService.updateStarred(currentUserId(), contactKey, request.starred()));
  }

  @PostMapping("/customers/{contactKey}/basic-info/confirm")
  public Result<CustomerProfile> confirmBasicInfo(
      @PathVariable("contactKey") String contactKey,
      @RequestBody ConfirmBasicInfoRequest request) {
    return Result.success(smartSalesService.confirmBasicInfo(currentUserId(), contactKey, request));
  }

  @PutMapping("/customers/{contactKey}/profile")
  public Result<CustomerProfile> updateAiProfile(
      @PathVariable("contactKey") String contactKey,
      @RequestBody AiProfile aiProfile) {
    smartSalesService.updateAiProfile(currentUserId(), contactKey, aiProfile);
    return Result.success(smartSalesService.getProfile(currentUserId(), contactKey));
  }

  // ===================== 标签 =====================

  @GetMapping("/tags")
  public Result<List<TagView>> listTags() {
    return Result.success(smartSalesService.listTags(currentUserId()));
  }

  @PostMapping("/tags")
  public Result<TagView> createTag(@RequestBody CreateTagRequest request) {
    return Result.success(smartSalesService.createTag(currentUserId(), request));
  }

  @PutMapping("/tags/{tagId}")
  public Result<TagView> updateTag(
      @PathVariable("tagId") Long tagId,
      @RequestBody UpdateTagRequest request) {
    return Result.success(smartSalesService.updateTag(currentUserId(), tagId, request));
  }

  @DeleteMapping("/tags/{tagId}")
  public Result<Boolean> deleteTag(@PathVariable("tagId") Long tagId) {
    smartSalesService.deleteTag(currentUserId(), tagId);
    return Result.success(true);
  }

  @PostMapping("/customers/{contactKey}/tags")
  public Result<List<TagView>> updateCustomerTags(
      @PathVariable("contactKey") String contactKey,
      @RequestBody UpdateCustomerTagsRequest request) {
    return Result.success(smartSalesService.updateCustomerTags(currentUserId(), contactKey, request));
  }

  // ===================== 跟进记录 =====================

  @PostMapping("/customers/{contactKey}/follow-ups")
  public Result<FollowUpView> createFollowUp(
      @PathVariable("contactKey") String contactKey,
      @RequestBody CreateFollowUpRequest request) {
    return Result.success(smartSalesService.createFollowUp(currentUserId(), contactKey, request));
  }

  // ===================== AI 跟进建议 =====================

  @PostMapping("/customers/{contactKey}/follow-up/suggest")
  public Result<FollowUpSuggestion> suggestFollowUp(
      @PathVariable("contactKey") String contactKey) {
    return Result.success(smartSalesService.suggestFollowUp(currentUserId(), contactKey));
  }

  // ===================== AI 画像刷新 =====================

  @PostMapping("/customers/{contactKey}/profile/refresh")
  public Result<AiProfile> refreshProfile(
      @PathVariable("contactKey") String contactKey,
      @RequestParam(value = "force", defaultValue = "false") boolean force) {
    return Result.success(userProfileAIService.refreshProfile(currentUserId(), contactKey, force));
  }

  @DeleteMapping("/customers/{contactKey}/follow-ups/{followUpId}")
  public Result<Boolean> deleteFollowUp(
      @PathVariable("contactKey") String contactKey,
      @PathVariable("followUpId") Long followUpId) {
    smartSalesService.deleteFollowUp(currentUserId(), contactKey, followUpId);
    return Result.success(true);
  }

  private Long currentUserId() {
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    if (authentication == null || !(authentication.getPrincipal() instanceof TransitPrincipal principal)) {
      throw new RuntimeException("用户未登录");
    }
    return principal.subjectId();
  }
}
