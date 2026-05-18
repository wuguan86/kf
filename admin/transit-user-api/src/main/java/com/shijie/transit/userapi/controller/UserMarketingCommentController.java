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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/user/marketing/comment")
public class UserMarketingCommentController {

    private static final Logger log = LoggerFactory.getLogger(UserMarketingCommentController.class);

    private final DifyClient difyClient;
    private final RoleService roleService;
    private final DifyProperties difyProperties;
    private final ObjectMapper objectMapper;

    public UserMarketingCommentController(DifyClient difyClient, RoleService roleService, DifyProperties difyProperties, ObjectMapper objectMapper) {
        this.difyClient = difyClient;
        this.roleService = roleService;
        this.difyProperties = difyProperties;
        this.objectMapper = objectMapper;
    }

    private Long currentUserId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || authentication.getPrincipal() == null) {
            log.error("认证失败: SecurityContext 中未找到认证信息");
            throw new RuntimeException("认证失败");
        }
        TransitPrincipal principal = (TransitPrincipal) authentication.getPrincipal();
        return principal.subjectId();
    }

    @PostMapping("/generate")
    public Result<String> generateComment(@RequestBody CommentGenerationRequest request) {
        log.info("收到评论生成请求，用户昵称: {}", request.userNickname());
        Long userId = currentUserId();
        
        // Find active role (RUNNING) or fallback to first one
        List<RoleEntity> roles = roleService.list(userId);
        RoleEntity activeRole = roles.stream()
                .filter(r -> "RUNNING".equals(r.getStatus()))
                .findFirst()
                .orElse(roles.isEmpty() ? null : roles.get(0));
        
        String roleContent = (activeRole != null && activeRole.getContent() != null) ? activeRole.getContent() : "";

        ObjectNode inputs = objectMapper.createObjectNode();
        inputs.put("post_content", request.postContent());
        inputs.put("user_nickname", request.userNickname());
        inputs.put("user_custom_role", roleContent);

        String apiKey = difyProperties.getCommentWorkflowApiKey();
        if (apiKey == null || apiKey.isEmpty()) {
            log.error("Dify 评论工作流 API Key 缺失！");
            return Result.error(ErrorCode.INTERNAL_ERROR, "Dify 配置缺失", System.currentTimeMillis(), null);
        }

        try {
            String result = difyClient.runWorkflow(apiKey, inputs, userId.toString());
            log.info("Dify 工作流执行成功，结果长度: {}", result != null ? result.length() : 0);
            return Result.success(result);
        } catch (Exception e) {
            log.error("Dify 工作流执行失败", e);
            return Result.error(ErrorCode.INTERNAL_ERROR, "生成评论失败: " + e.getMessage(), System.currentTimeMillis(), null);
        }
    }

    public record CommentGenerationRequest(String postContent, String userNickname) {}
}
