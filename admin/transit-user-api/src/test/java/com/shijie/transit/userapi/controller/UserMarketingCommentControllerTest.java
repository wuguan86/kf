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
        new FakeRoleService(),
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
    FakeRoleService() {
      super(null, new RoleKnowledgeBaseService(null, null));
    }

    @Override
    public List<RoleEntity> list(Long userId) {
      RoleEntity role = new RoleEntity();
      role.setId(10L);
      role.setStatus("RUNNING");
      role.setContent("保持自然短评");
      return List.of(role);
    }
  }
}
