package com.shijie.transit.userapi.vo;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 智能销售模块的视图对象集合。
 * 所有 Long 类型的 ID 均用 ToStringSerializer 序列化为字符串，
 * 避免前端雪花 ID(19位)精度丢失。
 */
public final class SmartSalesVo {

  private SmartSalesVo() {
  }

  /** 客户列表项(聚合意向 + 档案)。 */
  public record CustomerListItem(
      String contactKey,
      String customerName,
      Integer intentLevel,
      String intentLabel,
      Integer totalScore,
      String dailySummary,
      String demandLevel,
      String budgetLevel,
      String timeLevel,
      String budgetDesc,
      String timeDesc,
      String painPoints,
      String competitors,
      String latestEvent,
      @JsonSerialize(using = ToStringSerializer.class) Long customerId,
      String phone,
      String source,
      String stage,
      String aiStageSuggestion,
      String aiStageSuggestionLabel,
      Integer aiStageConfidence,
      String aiStageReason,
      @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime aiStageUpdatedAt,
      Integer starred,
      @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime nextFollowUpAt,
      @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime lastChatTime,
      List<TagView> tags) {
  }

  public record CustomerListResponse(
      Long total,
      List<CustomerListItem> list) {
  }

  /** 标签视图。 */
  public record TagView(
      @JsonSerialize(using = ToStringSerializer.class) Long id,
      String name,
      String color,
      String category) {
  }

  /** 跟进记录视图。 */
  public record FollowUpView(
      @JsonSerialize(using = ToStringSerializer.class) Long id,
      String content,
      String followUpType,
      Integer aiSuggested,
      @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime nextFollowUpAt,
      @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime createdAt) {
  }

  /** 客户画像详情(聚合所有数据源)。 */
  public record CustomerProfile(
      String contactKey,
      String customerName,
      Integer intentLevel,
      String intentLabel,
      Integer totalScore,
      String demandLevel,
      String budgetLevel,
      String timeLevel,
      String budgetDesc,
      String timeDesc,
      String painPoints,
      String competitors,
      String latestEvent,
      String aiReason,
      String dailySummary,
      @JsonSerialize(using = ToStringSerializer.class) Long customerId,
      String remarkName,
      String phone,
      String source,
      String stage,
      String aiStageSuggestion,
      String aiStageSuggestionLabel,
      Integer aiStageConfidence,
      String aiStageReason,
      @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime aiStageUpdatedAt,
      Integer starred,
      @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime nextFollowUpAt,
      @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime lastChatTime,
      List<TagView> tags,
      List<FollowUpView> followUps,
      AiProfile aiProfile) {
  }

  /** AI 生成的画像补充字段(存于 crm_customer.ai_profile_json)。 */
  public record AiProfile(
      String communicationFocus,
      List<String> interestTags,
      String suggestedNextAction,
      @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime updatedAt) {
  }

  /** 工作台漏斗阶段计数。 */
  public record StageCountView(String stage, String stageLabel, Integer count) {
  }

  /** 待跟进客户项。 */
  public record PendingFollowUpView(
      String contactKey,
      String customerName,
      Integer intentLevel,
      String intentLabel,
      @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime nextFollowUpAt) {
  }

  /** 工作台概览。 */
  public record DashboardView(
      List<StageCountView> stageFunnel,
      Integer starredCount,
      Integer highIntentWithoutStageCount,
      List<PendingFollowUpView> todayPendingFollowUps,
      Integer todayPendingTotal) {
  }

  /** AI 跟进建议结果。 */
  public record FollowUpSuggestion(
      String suggestedContent,
      String reason) {
  }
}
