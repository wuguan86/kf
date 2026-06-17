package com.shijie.transit.userapi.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.shijie.transit.common.db.entity.RoleEntity;
import com.shijie.transit.common.security.TransitPrincipal;
import com.shijie.transit.common.web.ErrorCode;
import com.shijie.transit.common.web.Result;
import com.shijie.transit.userapi.dify.DifyClient;
import com.shijie.transit.userapi.dify.DifyProperties;
import com.shijie.transit.userapi.service.RoleService;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/user/marketing/comment")
public class UserMarketingCommentController {

  private static final Logger log = LoggerFactory.getLogger(UserMarketingCommentController.class);

  private final DifyClient difyClient;
  private final RoleService roleService;
  private final DifyProperties difyProperties;
  private final ObjectMapper objectMapper;

  public UserMarketingCommentController(
      DifyClient difyClient,
      RoleService roleService,
      DifyProperties difyProperties,
      ObjectMapper objectMapper) {
    this.difyClient = difyClient;
    this.roleService = roleService;
    this.difyProperties = difyProperties;
    this.objectMapper = objectMapper;
  }

  private Long currentUserId() {
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    if (authentication == null || authentication.getPrincipal() == null) {
      log.error("认证失败：SecurityContext 中未找到认证信息");
      throw new RuntimeException("认证失败");
    }
    TransitPrincipal principal = (TransitPrincipal) authentication.getPrincipal();
    return principal.subjectId();
  }

  @PostMapping("/generate")
  public Result<String> generateComment(@RequestBody CommentGenerationRequest request) {
    log.info("收到朋友圈评论生成请求，用户昵称={}", request.userNickname());
    Long userId = currentUserId();

    RoleEntity salesRole = resolveRunningSalesRole(roleService.list(userId));
    if (salesRole == null) {
      log.warn("未找到运行中的销售角色，跳过朋友圈评论生成 userId={}", userId);
      return Result.error(ErrorCode.BAD_REQUEST, "请先启用一个销售角色后再生成朋友圈评论", System.currentTimeMillis(), null);
    }

    ObjectNode inputs = objectMapper.createObjectNode();
    inputs.put("post_content", request.postContent());
    inputs.put("user_nickname", request.userNickname());
    inputs.put("post_time_text", request.timeText() == null ? "" : request.timeText());
    inputs.put("user_custom_role", salesRole.getContent() == null ? "" : salesRole.getContent());

    String apiKey = difyProperties.getCommentWorkflowApiKey();
    if (apiKey == null || apiKey.isEmpty()) {
      log.error("Dify 评论工作流 API Key 缺失");
      return Result.error(ErrorCode.INTERNAL_ERROR, "Dify 评论工作流配置缺失", System.currentTimeMillis(), null);
    }

    try {
      String result = difyClient.runWorkflow(apiKey, inputs, userId.toString());
      log.info("Dify 评论工作流执行成功，结果长度={}", result == null ? 0 : result.length());
      return Result.success(result);
    } catch (Exception e) {
      log.error("Dify 评论工作流执行失败", e);
      return Result.error(ErrorCode.INTERNAL_ERROR, "生成评论失败: " + e.getMessage(), System.currentTimeMillis(), null);
    }
  }

  private RoleEntity resolveRunningSalesRole(List<RoleEntity> roles) {
    if (roles == null || roles.isEmpty()) {
      return null;
    }
    return roles.stream()
        .filter(role -> "RUNNING".equals(role.getStatus()))
        .filter(role -> "SALES".equalsIgnoreCase(role.getRoleType()))
        .findFirst()
        .orElse(null);
  }

  public record CommentGenerationRequest(String postContent, String userNickname, String timeText) {
  }
}
