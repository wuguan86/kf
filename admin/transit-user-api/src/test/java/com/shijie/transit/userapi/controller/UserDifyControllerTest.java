package com.shijie.transit.userapi.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.shijie.transit.common.db.entity.KnowledgeBaseEntity;
import com.shijie.transit.common.db.entity.KnowledgeBaseFileEntity;
import com.shijie.transit.common.db.entity.RoleEntity;
import com.shijie.transit.common.security.TransitPrincipal;
import com.shijie.transit.common.web.Result;
import com.shijie.transit.userapi.dify.DifyClient;
import com.shijie.transit.userapi.dify.DifyProperties;
import com.shijie.transit.userapi.service.DifyContactConversationMappingService;
import com.shijie.transit.userapi.service.KnowledgeBaseService;
import com.shijie.transit.userapi.service.MembershipEntitlementService;
import com.shijie.transit.userapi.service.MembershipQueryService;
import com.shijie.transit.userapi.service.RoleKnowledgeBaseService;
import com.shijie.transit.userapi.service.RoleService;
import com.shijie.transit.userapi.service.SessionConfigService;
import com.shijie.transit.userapi.service.SessionHistoryService;
import java.time.Clock;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

class UserDifyControllerTest {

  @Test
  void resolveContactDisplayNamePrefersCustomerNameOverSessionKey() {
    UserDifyController.MonitorChatRequest request = new UserDifyController.MonitorChatRequest(
        1L,
        "hello",
        "",
        "",
        "enterprise:contact-id",
        "customer-name",
        "",
        "");

    assertEquals("customer-name", UserDifyController.resolveContactDisplayName(request));
  }

  @Test
  void monitorChatSkipsKnowledgeRetrievalWhenRoleHasNoKnowledgeBase() throws Exception {
    ObjectMapper objectMapper = new ObjectMapper();

    RoleEntity role = new RoleEntity();
    role.setId(10L);
    role.setName("assistant");
    role.setContent("reply politely");
    role.setKnowledgeBaseId("");

    RecordingDifyClient difyClient = new RecordingDifyClient(objectMapper);
    FakeRoleKnowledgeBaseService roleKnowledgeBaseService = new FakeRoleKnowledgeBaseService();
    FakeKnowledgeBaseService knowledgeBaseService = new FakeKnowledgeBaseService(objectMapper);

    UserDifyController controller = new UserDifyController(
        difyClient,
        new DifyContactConversationMappingService(null, Clock.systemDefaultZone()),
        new FakeRoleService(role, roleKnowledgeBaseService),
        roleKnowledgeBaseService,
        knowledgeBaseService,
        new FakeSessionConfigService(objectMapper),
        new FakeSessionHistoryService(),
        null,
        null,
        new DifyProperties(),
        objectMapper);

    SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
        new TransitPrincipal(1L, 1L, "USER"), null));
    try {
      Result<Object> result = controller.monitorChat(new UserDifyController.MonitorChatRequest(
          10L,
          "hello",
          "",
          "",
          "",
          "",
          "",
          ""));

      JsonNode data = (JsonNode) result.getData();
      assertEquals("ok", data.path("answer").asText());
      assertEquals(0, knowledgeBaseService.createCount);
      assertEquals(0, difyClient.retrieveCount);
    } finally {
      SecurityContextHolder.clearContext();
    }
  }

  @Test
  void monitorChatSkipsRetrievalWhenBoundKnowledgeBaseHasNoFiles() throws Exception {
    ObjectMapper objectMapper = new ObjectMapper();
    RoleEntity role = new RoleEntity();
    role.setId(10L);
    role.setName("assistant");
    role.setContent("reply politely");
    role.setKnowledgeBaseId("");

    KnowledgeBaseEntity emptyKnowledgeBase = new KnowledgeBaseEntity();
    emptyKnowledgeBase.setId(20L);
    emptyKnowledgeBase.setDifyDatasetId("empty-dataset");

    RecordingDifyClient difyClient = new RecordingDifyClient(objectMapper);
    FakeRoleKnowledgeBaseService roleKnowledgeBaseService = new FakeRoleKnowledgeBaseService(List.of(emptyKnowledgeBase));
    FakeKnowledgeBaseService knowledgeBaseService = new FakeKnowledgeBaseService(objectMapper);

    UserDifyController controller = new UserDifyController(
        difyClient,
        new DifyContactConversationMappingService(null, Clock.systemDefaultZone()),
        new FakeRoleService(role, roleKnowledgeBaseService),
        roleKnowledgeBaseService,
        knowledgeBaseService,
        new FakeSessionConfigService(objectMapper),
        new FakeSessionHistoryService(),
        null,
        null,
        new DifyProperties(),
        objectMapper);

    SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
        new TransitPrincipal(1L, 1L, "USER"), null));
    try {
      Result<Object> result = controller.monitorChat(new UserDifyController.MonitorChatRequest(
          10L,
          "hello",
          "",
          "",
          "",
          "",
          "",
          ""));

      JsonNode data = (JsonNode) result.getData();
      assertEquals("ok", data.path("answer").asText());
      assertEquals(0, knowledgeBaseService.createCount);
      assertEquals(1, knowledgeBaseService.listFilesCount);
      assertEquals(0, difyClient.retrieveCount);
    } finally {
      SecurityContextHolder.clearContext();
    }
  }

  private static class RecordingDifyClient extends DifyClient {
    int retrieveCount;

    RecordingDifyClient(ObjectMapper objectMapper) {
      super(new DifyProperties(), objectMapper);
    }

    @Override
    public String retrieveDataset(String datasetId, String query) {
      retrieveCount++;
      return "{\"records\":[]}";
    }

    @Override
    public DifyChatResult chatMessages(String requestBodyJson) {
      return new DifyChatResult("{\"answer\":\"ok\"}", "conv-1", "ok");
    }
  }

  private static class FakeRoleService extends RoleService {
    private final RoleEntity role;

    FakeRoleService(RoleEntity role, RoleKnowledgeBaseService roleKnowledgeBaseService) {
      super(null, roleKnowledgeBaseService);
      this.role = role;
    }

    @Override
    public RoleEntity getById(Long userId, Long id) {
      return role;
    }
  }

  private static class FakeRoleKnowledgeBaseService extends RoleKnowledgeBaseService {
    private final List<KnowledgeBaseEntity> knowledgeBases;

    FakeRoleKnowledgeBaseService() {
      this(List.of());
    }

    FakeRoleKnowledgeBaseService(List<KnowledgeBaseEntity> knowledgeBases) {
      super(null, null);
      this.knowledgeBases = knowledgeBases;
    }

    @Override
    public List<KnowledgeBaseEntity> listRoleKnowledgeBases(Long userId, Long roleId) {
      return knowledgeBases;
    }

    @Override
    public void bindKnowledgeBase(Long userId, Long roleId, Long kbId) {
    }
  }

  private static class FakeKnowledgeBaseService extends KnowledgeBaseService {
    int createCount;
    int listFilesCount;

    FakeKnowledgeBaseService(ObjectMapper objectMapper) {
      super(null, null, null, null, objectMapper);
    }

    @Override
    public KnowledgeBaseEntity create(Long userId, KnowledgeBaseEntity request) {
      createCount++;
      KnowledgeBaseEntity entity = new KnowledgeBaseEntity();
      entity.setId(20L);
      entity.setDifyDatasetId("default-dataset");
      return entity;
    }

    @Override
    public List<KnowledgeBaseFileEntity> listFiles(Long userId, Long knowledgeBaseId) {
      listFilesCount++;
      return List.of();
    }
  }

  private static class FakeSessionConfigService extends SessionConfigService {
    FakeSessionConfigService(ObjectMapper objectMapper) {
      super(null, null, objectMapper);
    }

    @Override
    public SessionConfigView getConfig(Long userId, String sceneType) {
      return null;
    }
  }

  private static class FakeSessionHistoryService extends SessionHistoryService {
    FakeSessionHistoryService() {
      super(null, Clock.systemDefaultZone());
    }

    @Override
    public void appendMessage(Long userId, Long roleId, String sceneType, String sessionKey, String senderType, String messageContent) {
    }

    @Override
    public List<HistoryInputItem> buildDifyHistory(Long userId, Long roleId, String sceneType, String sessionKey, int memoryRounds) {
      return List.of();
    }
  }
}
