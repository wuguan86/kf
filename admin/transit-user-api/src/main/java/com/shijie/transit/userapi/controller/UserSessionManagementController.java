package com.shijie.transit.userapi.controller;

import com.shijie.transit.common.db.entity.SessionMessageHistoryEntity;
import com.shijie.transit.common.security.TransitPrincipal;
import com.shijie.transit.common.web.Result;
import com.shijie.transit.userapi.service.SessionConfigService;
import com.shijie.transit.userapi.service.SessionHistoryService;
import java.util.List;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/user/session-management")
public class UserSessionManagementController {
  private final SessionConfigService sessionConfigService;
  private final SessionHistoryService sessionHistoryService;

  public UserSessionManagementController(
      SessionConfigService sessionConfigService,
      SessionHistoryService sessionHistoryService) {
    this.sessionConfigService = sessionConfigService;
    this.sessionHistoryService = sessionHistoryService;
  }

  @GetMapping("/config")
  public Result<SessionConfigService.SessionConfigView> getConfig(
      @RequestParam(value = "sceneType", required = false) String sceneType) {
    return Result.success(sessionConfigService.getConfig(currentUserId(), sceneType));
  }

  @PostMapping("/config")
  public Result<SessionConfigService.SessionConfigView> saveConfig(@RequestBody SaveConfigRequest request) {
    SessionConfigService.SaveSessionConfigCommand command = new SessionConfigService.SaveSessionConfigCommand(
        request.sceneType(),
        request.enabled() == null || request.enabled(),
        request.memoryRounds(),
        request.replyIntervalStartSec(),
        request.replyIntervalEndSec(),
        request.groupReplyStartTime(),
        request.groupReplyEndTime(),
        request.groupCooldownSec(),
        request.aiStopReplyEnabled() != null && request.aiStopReplyEnabled(),
        request.aiStopReplyKeywords(),
        request.manualHandoffEnabled() != null && request.manualHandoffEnabled(),
        request.manualHandoffKeywords(),
        request.manualHandoffMessage(),
        request.handoffPhone(),
        request.handoffPhoneEnabled() != null && request.handoffPhoneEnabled(),
        request.groupKeywordTriggerEnabled() != null && request.groupKeywordTriggerEnabled(),
        request.groupTriggerKeywords());
    return Result.success(sessionConfigService.saveConfig(currentUserId(), command));
  }

  @GetMapping("/history")
  public Result<List<SessionMessageHistoryEntity>> listHistory(
      @RequestParam(value = "roleId", required = false) Long roleId,
      @RequestParam("sessionKey") String sessionKey,
      @RequestParam(value = "sceneType", required = false) String sceneType,
      @RequestParam(value = "pageNo", defaultValue = "1") Long pageNo,
      @RequestParam(value = "pageSize", defaultValue = "20") Long pageSize) {
    Long queryRoleId = roleId == null ? 0L : roleId;
    return Result.success(sessionHistoryService
        .pageHistory(currentUserId(), queryRoleId, sceneType, sessionKey, pageNo, pageSize)
        .getRecords());
  }

  private Long currentUserId() {
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    TransitPrincipal principal = (TransitPrincipal) authentication.getPrincipal();
    return principal.subjectId();
  }

  public record SaveConfigRequest(
      String sceneType,
      Boolean enabled,
      Integer memoryRounds,
      Integer replyIntervalStartSec,
      Integer replyIntervalEndSec,
      String groupReplyStartTime,
      String groupReplyEndTime,
      Integer groupCooldownSec,
      Boolean aiStopReplyEnabled,
      List<String> aiStopReplyKeywords,
      Boolean manualHandoffEnabled,
      List<String> manualHandoffKeywords,
      String manualHandoffMessage,
      String handoffPhone,
      Boolean handoffPhoneEnabled,
      Boolean groupKeywordTriggerEnabled,
      List<String> groupTriggerKeywords) {
  }
}
