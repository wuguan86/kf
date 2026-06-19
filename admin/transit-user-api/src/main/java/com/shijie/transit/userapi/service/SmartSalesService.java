package com.shijie.transit.userapi.service;

import com.shijie.transit.userapi.dto.SmartSalesDto;
import com.shijie.transit.userapi.vo.SmartSalesVo;
import com.shijie.transit.userapi.vo.SmartSalesVo.AiProfile;
import com.shijie.transit.userapi.vo.SmartSalesVo.CustomerListResponse;
import com.shijie.transit.userapi.vo.SmartSalesVo.CustomerProfile;
import com.shijie.transit.userapi.vo.SmartSalesVo.DashboardView;
import com.shijie.transit.userapi.vo.SmartSalesVo.FollowUpView;
import com.shijie.transit.userapi.vo.SmartSalesVo.TagView;
import java.util.List;
import org.springframework.stereotype.Service;

/**
 * 智能销售门面服务。对外保持原接口，内部按客户、标签、跟进、统计和 AI 建议拆分职责。
 */
@Service
public class SmartSalesService {
  private final SmartSalesCustomerService customerService;
  private final SmartSalesTagService tagService;
  private final SmartSalesFollowUpService followUpService;
  private final SmartSalesDashboardService dashboardService;
  private final SmartSalesAiSuggestionService aiSuggestionService;

  public SmartSalesService(
      SmartSalesCustomerService customerService,
      SmartSalesTagService tagService,
      SmartSalesFollowUpService followUpService,
      SmartSalesDashboardService dashboardService,
      SmartSalesAiSuggestionService aiSuggestionService) {
    this.customerService = customerService;
    this.tagService = tagService;
    this.followUpService = followUpService;
    this.dashboardService = dashboardService;
    this.aiSuggestionService = aiSuggestionService;
  }

  public CustomerListResponse listCustomers(
      Long ownerUserId,
      long pageNo,
      long pageSize,
      Integer intentLevel,
      String stage,
      Boolean starred,
      String keyword) {
    return customerService.listCustomers(ownerUserId, pageNo, pageSize, intentLevel, stage, starred, keyword);
  }

  public CustomerProfile getProfile(Long ownerUserId, String contactKey) {
    return customerService.getProfile(ownerUserId, contactKey);
  }

  public CustomerProfile saveCustomer(Long ownerUserId, SmartSalesDto.SaveCustomerRequest request) {
    return customerService.saveCustomer(ownerUserId, request);
  }

  public CustomerProfile updateStage(Long ownerUserId, String contactKey, String stage) {
    return customerService.updateStage(ownerUserId, contactKey, stage);
  }

  public CustomerProfile updateStarred(Long ownerUserId, String contactKey, Integer starred) {
    return customerService.updateStarred(ownerUserId, contactKey, starred);
  }

  public List<TagView> listTags(Long ownerUserId) {
    return tagService.listTags(ownerUserId);
  }

  public TagView createTag(Long ownerUserId, SmartSalesDto.CreateTagRequest request) {
    return tagService.createTag(ownerUserId, request);
  }

  public List<TagView> updateCustomerTags(
      Long ownerUserId, String contactKey, SmartSalesDto.UpdateCustomerTagsRequest request) {
    return tagService.updateCustomerTags(ownerUserId, contactKey, request);
  }

  public FollowUpView createFollowUp(
      Long ownerUserId, String contactKey, SmartSalesDto.CreateFollowUpRequest request) {
    return followUpService.createFollowUp(ownerUserId, contactKey, request);
  }

  public void deleteFollowUp(Long ownerUserId, String contactKey, Long followUpId) {
    followUpService.deleteFollowUp(ownerUserId, contactKey, followUpId);
  }

  public SmartSalesVo.FollowUpSuggestion suggestFollowUp(Long ownerUserId, String contactKey) {
    return aiSuggestionService.suggestFollowUp(ownerUserId, contactKey);
  }

  public DashboardView getDashboard(Long ownerUserId) {
    return dashboardService.getDashboard(ownerUserId);
  }

  public void updateAiProfile(Long ownerUserId, String contactKey, AiProfile aiProfile) {
    customerService.updateAiProfile(ownerUserId, contactKey, aiProfile);
  }
}
