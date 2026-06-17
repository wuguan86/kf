package com.shijie.transit.userapi.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.shijie.transit.common.db.entity.RoleEntity;
import com.shijie.transit.common.security.TransitPrincipal;
import com.shijie.transit.common.web.Result;
import com.shijie.transit.userapi.dify.DifyClient;
import com.shijie.transit.userapi.dify.DifyProperties;
import com.shijie.transit.userapi.service.RoleKnowledgeBaseService;
import com.shijie.transit.userapi.service.RoleService;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

class UserMarketingCommentControllerTest {

  @Test
  void generateCommentPassesTimeTextToDifyWorkflow() {
    ObjectMapper objectMapper = new ObjectMapper();
    DifyProperties properties = new DifyProperties();
    properties.setCommentWorkflowApiKey("comment-key");
    RecordingDifyClient difyClient = new RecordingDifyClient(objectMapper);
    UserMarketingCommentController controller = new UserMarketingCommentController(
        difyClient,
        new FakeRoleService(List.of(role("RUNNING", "SALES", "保持自然短评"))),
        properties,
        objectMapper);

    SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
        new TransitPrincipal(7L, 1L, "USER"), null));
    try {
      Result<String> result = controller.generateComment(new UserMarketingCommentController.CommentGenerationRequest(
          "今天新品到店",
          "客户A",
          "2小时前"));

      assertEquals(0, result.getCode());
      assertEquals("不错", result.getData());
      assertEquals("comment-key", difyClient.apiKey);
      assertEquals("7", difyClient.user);
      assertEquals("今天新品到店", difyClient.inputs.path("post_content").asText());
      assertEquals("客户A", difyClient.inputs.path("user_nickname").asText());
      assertEquals("2小时前", difyClient.inputs.path("post_time_text").asText());
      assertEquals("保持自然短评", difyClient.inputs.path("user_custom_role").asText());
    } finally {
      SecurityContextHolder.clearContext();
    }
  }

  @Test
  void generateCommentPrefersRunningSalesRole() {
    ObjectMapper objectMapper = new ObjectMapper();
    DifyProperties properties = new DifyProperties();
    properties.setCommentWorkflowApiKey("comment-key");
    RecordingDifyClient difyClient = new RecordingDifyClient(objectMapper);
    UserMarketingCommentController controller = new UserMarketingCommentController(
        difyClient,
        new FakeRoleService(List.of(
            role("RUNNING", "CUSTOMER_SERVICE", "客服回复设定"),
            role("RUNNING", "SALES", "销售评论设定"))),
        properties,
        objectMapper);

    SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
        new TransitPrincipal(7L, 1L, "USER"), null));
    try {
      controller.generateComment(new UserMarketingCommentController.CommentGenerationRequest(
          "今天新品到店",
          "客户A",
          "2小时前"));

      assertEquals("销售评论设定", difyClient.inputs.path("user_custom_role").asText());
    } finally {
      SecurityContextHolder.clearContext();
    }
  }

  @Test
  void generateCommentRejectsWhenSalesRoleIsMissing() {
    ObjectMapper objectMapper = new ObjectMapper();
    DifyProperties properties = new DifyProperties();
    properties.setCommentWorkflowApiKey("comment-key");
    RecordingDifyClient difyClient = new RecordingDifyClient(objectMapper);
    UserMarketingCommentController controller = new UserMarketingCommentController(
        difyClient,
        new FakeRoleService(List.of(role("RUNNING", "CUSTOMER_SERVICE", "客服回复设定"))),
        properties,
        objectMapper);

    SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
        new TransitPrincipal(7L, 1L, "USER"), null));
    try {
      Result<String> result = controller.generateComment(new UserMarketingCommentController.CommentGenerationRequest(
          "今天新品到店",
          "客户A",
          "2小时前"));

      assertEquals(40000, result.getCode());
      assertEquals("请先启用一个销售角色后再生成朋友圈评论", result.getMsg());
      assertEquals(null, difyClient.inputs);
    } finally {
      SecurityContextHolder.clearContext();
    }
  }

  private static RoleEntity role(String status, String roleType, String content) {
    RoleEntity role = new RoleEntity();
    role.setId(10L);
    role.setStatus(status);
    role.setRoleType(roleType);
    role.setContent(content);
    return role;
  }

  private static class RecordingDifyClient extends DifyClient {
    String apiKey;
    String user;
    ObjectNode inputs;

    RecordingDifyClient(ObjectMapper objectMapper) {
      super(new DifyProperties(), objectMapper);
    }

    @Override
    public String runWorkflow(String apiKey, ObjectNode inputs, String user) {
      this.apiKey = apiKey;
      this.inputs = inputs.deepCopy();
      this.user = user;
      return "不错";
    }
  }

  private static class FakeRoleService extends RoleService {
    private final List<RoleEntity> roles;

    FakeRoleService(List<RoleEntity> roles) {
      super(null, new RoleKnowledgeBaseService(null, null));
      this.roles = roles;
    }

    @Override
    public List<RoleEntity> list(Long userId) {
      return roles;
    }
  }
}
