package com.shijie.transit.userapi.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 智能销售模块的请求 DTO 集合。
 * 统一放此处便于维护，字段与前端 TS 类型一一对应。
 */
public final class SmartSalesDto {

  private SmartSalesDto() {
  }

  /** 客户档案保存请求(contactKey 为定位键，存在则更新，不存在则新建)。 */
  public record SaveCustomerRequest(
      String contactKey,
      String remarkName,
      String phone,
      String source,
      String stage,
      Long assignedRoleId,
      String remark,
      @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime nextFollowUpAt,
      Integer starred) {
  }

  /** 批量打标/取消请求(addTagIds 为新增, removeTagIds 为移除)。 */
  public record UpdateCustomerTagsRequest(
      List<Long> addTagIds,
      List<Long> removeTagIds) {
  }

  /** 商机阶段流转请求。 */
  public record UpdateStageRequest(String stage) {
  }

  /** 星标切换请求。 */
  public record UpdateStarredRequest(Integer starred) {
  }

  /** 新建标签请求。 */
  public record CreateTagRequest(String name, String color) {
  }

  /** 更新自定义标签请求。预设标签只读，不能通过用户侧标签管理改名或改色。 */
  public record UpdateTagRequest(String name, String color) {
  }

  /** 新增跟进记录请求。aiSuggested=1 表示内容由 AI 生成。 */
  public record CreateFollowUpRequest(
      String content,
      String followUpType,
      @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime nextFollowUpAt,
      Integer aiSuggested) {
  }
}
