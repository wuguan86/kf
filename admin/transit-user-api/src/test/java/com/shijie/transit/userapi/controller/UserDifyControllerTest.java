package com.shijie.transit.userapi.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.shijie.transit.common.db.entity.KnowledgeBaseEntity;
import com.shijie.transit.common.db.entity.KnowledgeBaseFileEntity;
import com.shijie.transit.common.db.entity.OutboundMaterialEntity;
import com.shijie.transit.common.db.entity.RoleEntity;
import com.shijie.transit.common.security.TransitPrincipal;
import com.shijie.transit.common.web.Result;
import com.shijie.transit.common.web.TransitException;
import com.shijie.transit.userapi.dify.DifyClient;
import com.shijie.transit.userapi.dify.DifyProperties;
import com.shijie.transit.userapi.service.DifyContactConversationMappingService;
import com.shijie.transit.userapi.service.KnowledgeBaseService;
import com.shijie.transit.userapi.service.OutboundMaterialDecisionService;
import com.shijie.transit.userapi.service.OutboundMaterialService;
import com.shijie.transit.userapi.service.RoleKnowledgeBaseService;
import com.shijie.transit.userapi.service.RoleService;
import com.shijie.transit.userapi.service.SessionConfigService;
import com.shijie.transit.userapi.service.SessionHistoryService;
import java.time.Clock;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
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
    RoleEntity role = role("");
    RecordingDifyClient difyClient = new RecordingDifyClient(objectMapper);
    FakeRoleKnowledgeBaseService roleKnowledgeBaseService = new FakeRoleKnowledgeBaseService();
    FakeKnowledgeBaseService knowledgeBaseService = new FakeKnowledgeBaseService(objectMapper);

    UserDifyController controller = controller(
        objectMapper,
        difyClient,
        role,
        roleKnowledgeBaseService,
        knowledgeBaseService,
        null);

    SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
        new TransitPrincipal(1L, 1L, "USER"), null));
    try {
      Result<Object> result = controller.monitorChat(new UserDifyController.MonitorChatRequest(
          10L, "hello", "", "", "", "", "", ""));

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
    RoleEntity role = role("");
    KnowledgeBaseEntity emptyKnowledgeBase = new KnowledgeBaseEntity();
    emptyKnowledgeBase.setId(20L);
    emptyKnowledgeBase.setDifyDatasetId("empty-dataset");

    RecordingDifyClient difyClient = new RecordingDifyClient(objectMapper);
    FakeRoleKnowledgeBaseService roleKnowledgeBaseService = new FakeRoleKnowledgeBaseService(List.of(emptyKnowledgeBase));
    FakeKnowledgeBaseService knowledgeBaseService = new FakeKnowledgeBaseService(objectMapper);

    UserDifyController controller = controller(
        objectMapper,
        difyClient,
        role,
        roleKnowledgeBaseService,
        knowledgeBaseService,
        null);

    SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
        new TransitPrincipal(1L, 1L, "USER"), null));
    try {
      Result<Object> result = controller.monitorChat(new UserDifyController.MonitorChatRequest(
          10L, "hello", "", "", "", "", "", ""));

      JsonNode data = (JsonNode) result.getData();
      assertEquals("ok", data.path("answer").asText());
      assertEquals(0, knowledgeBaseService.createCount);
      assertEquals(1, knowledgeBaseService.listFilesCount);
      assertEquals(0, difyClient.retrieveCount);
    } finally {
      SecurityContextHolder.clearContext();
    }
  }

  @Test
  void monitorChatReturnsOnlyValidatedOutboundAttachmentsFromDifyPlan() throws Exception {
    ObjectMapper objectMapper = new ObjectMapper();
    RecordingDifyClient difyClient = new RecordingDifyClient(objectMapper);
    difyClient.answer = """
        {"reply_text":"Sure, I will send the product image.","attachments":[{"material_id":"31"},{"material_id":"32"}],"confidence":0.91}
        """;
    difyClient.rawJson = "{\"answer\":" + objectMapper.writeValueAsString(difyClient.answer) + "}";
    OutboundMaterialEntity material = material(31L, "Product image");
    FakeOutboundMaterialDecisionService decisionService = new FakeOutboundMaterialDecisionService();
    decisionService.materials.put(31L, material);

    UserDifyController controller = controller(
        objectMapper,
        difyClient,
        role(""),
        new FakeRoleKnowledgeBaseService(),
        new FakeKnowledgeBaseService(objectMapper),
        decisionService);

    SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
        new TransitPrincipal(1L, 1L, "USER"), null));
    try {
      Result<Object> result = controller.monitorChat(new UserDifyController.MonitorChatRequest(
          10L, "send product image", "", "", "", "", "", ""));

      JsonNode data = (JsonNode) result.getData();
      assertEquals("Sure, I will send the product image.", data.path("answer").asText());
      assertEquals(1, data.path("attachments").size());
      assertEquals("31", data.path("attachments").get(0).path("materialId").asText());
      assertEquals("Product image", data.path("attachments").get(0).path("name").asText());
      assertEquals("IMAGE", data.path("attachments").get(0).path("fileType").asText());
    } finally {
      SecurityContextHolder.clearContext();
    }
  }

  @Test
  void monitorChatAddsDecisionAttachmentsWhenDifyReturnsPlainText() throws Exception {
    ObjectMapper objectMapper = new ObjectMapper();
    RecordingDifyClient difyClient = new RecordingDifyClient(objectMapper);
    difyClient.answer = "I do not have an image, please search it online.";
    difyClient.rawJson = "{\"answer\":\"I do not have an image, please search it online.\"}";
    FakeOutboundMaterialDecisionService decisionService = new FakeOutboundMaterialDecisionService();
    decisionService.selectedMaterials = List.of(material(31L, "Product introduction image"));

    UserDifyController controller = controller(
        objectMapper,
        difyClient,
        role(""),
        new FakeRoleKnowledgeBaseService(),
        new FakeKnowledgeBaseService(objectMapper),
        decisionService);

    SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
        new TransitPrincipal(1L, 1L, "USER"), null));
    try {
      Result<Object> result = controller.monitorChat(new UserDifyController.MonitorChatRequest(
          10L, "send product image", "", "", "", "", "", ""));

      JsonNode data = (JsonNode) result.getData();
      assertEquals("可以的，我把「Product introduction image」发您。", data.path("answer").asText());
      assertEquals(1, data.path("attachments").size());
      assertEquals("31", data.path("attachments").get(0).path("materialId").asText());
      assertEquals("Product introduction image", data.path("attachments").get(0).path("name").asText());
    } finally {
      SecurityContextHolder.clearContext();
    }
  }

  @Test
  void monitorChatPassesSalesAssistantModeToDifyClient() throws Exception {
    ObjectMapper objectMapper = new ObjectMapper();
    RecordingDifyClient difyClient = new RecordingDifyClient(objectMapper);

    UserDifyController controller = controller(
        objectMapper,
        difyClient,
        salesRole(""),
        new FakeRoleKnowledgeBaseService(),
        new FakeKnowledgeBaseService(objectMapper),
        null);

    SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
        new TransitPrincipal(1L, 1L, "USER"), null));
    try {
      controller.monitorChat(new UserDifyController.MonitorChatRequest(
          10L, "hello", "", "", "", "", "", "", "sales"));

      assertEquals("sales", difyClient.assistantMode);
    } finally {
      SecurityContextHolder.clearContext();
    }
  }

  @Test
  void monitorChatRejectsSalesModeWithCustomerServiceRole() {
    ObjectMapper objectMapper = new ObjectMapper();

    UserDifyController controller = controller(
        objectMapper,
        new RecordingDifyClient(objectMapper),
        role(""),
        new FakeRoleKnowledgeBaseService(),
        new FakeKnowledgeBaseService(objectMapper),
        null);

    SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
        new TransitPrincipal(1L, 1L, "USER"), null));
    try {
      TransitException ex = assertThrows(TransitException.class, () -> controller.monitorChat(
          new UserDifyController.MonitorChatRequest(10L, "hello", "", "", "", "", "", "", "sales")));

      assertEquals("智能销售模式只能使用销售角色", ex.getMessage());
    } finally {
      SecurityContextHolder.clearContext();
    }
  }

  @Test
  void monitorChatRejectsCustomerServiceModeWithSalesRole() {
    ObjectMapper objectMapper = new ObjectMapper();

    UserDifyController controller = controller(
        objectMapper,
        new RecordingDifyClient(objectMapper),
        salesRole(""),
        new FakeRoleKnowledgeBaseService(),
        new FakeKnowledgeBaseService(objectMapper),
        null);

    SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
        new TransitPrincipal(1L, 1L, "USER"), null));
    try {
      TransitException ex = assertThrows(TransitException.class, () -> controller.monitorChat(
          new UserDifyController.MonitorChatRequest(10L, "hello", "", "", "", "", "", "", "customer_service")));

      assertEquals("智能客服模式只能使用客服角色", ex.getMessage());
    } finally {
      SecurityContextHolder.clearContext();
    }
  }

  private static UserDifyController controller(
      ObjectMapper objectMapper,
      RecordingDifyClient difyClient,
      RoleEntity role,
      FakeRoleKnowledgeBaseService roleKnowledgeBaseService,
      FakeKnowledgeBaseService knowledgeBaseService,
      OutboundMaterialDecisionService decisionService) {
    return new UserDifyController(
        difyClient,
        new DifyContactConversationMappingService(null, Clock.systemDefaultZone()),
        new FakeRoleService(role, roleKnowledgeBaseService),
        roleKnowledgeBaseService,
        knowledgeBaseService,
        new FakeSessionConfigService(objectMapper),
        new FakeSessionHistoryService(),
        null,
        null,
        decisionService,
        new DifyProperties(),
        objectMapper);
  }

  private static RoleEntity role(String knowledgeBaseId) {
    RoleEntity role = new RoleEntity();
    role.setId(10L);
    role.setName("assistant");
    role.setContent("reply politely");
    role.setKnowledgeBaseId(knowledgeBaseId);
    role.setRoleType("CUSTOMER_SERVICE");
    return role;
  }

  private static RoleEntity salesRole(String knowledgeBaseId) {
    RoleEntity role = role(knowledgeBaseId);
    role.setRoleType("SALES");
    return role;
  }

  private static OutboundMaterialEntity material(Long id, String name) {
    OutboundMaterialEntity material = new OutboundMaterialEntity();
    material.setId(id);
    material.setName(name);
    material.setFileType("IMAGE");
    material.setMimeType("image/png");
    material.setFileSize(2048L);
    material.setExtension("png");
    material.setAllowedChannels("personal,enterprise");
    return material;
  }

  private static class RecordingDifyClient extends DifyClient {
    int retrieveCount;
    String answer = "ok";
    String rawJson = "{\"answer\":\"ok\"}";
    String assistantMode;

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
      return new DifyChatResult(rawJson, "conv-1", answer);
    }

    @Override
    public DifyChatResult chatMessages(String requestBodyJson, String assistantMode) {
      this.assistantMode = assistantMode;
      return new DifyChatResult(rawJson, "conv-1", answer);
    }
  }

  private static class FakeOutboundMaterialDecisionService extends OutboundMaterialDecisionService {
    private final Map<Long, OutboundMaterialEntity> materials = new HashMap<>();
    private List<OutboundMaterialEntity> selectedMaterials = List.of();

    FakeOutboundMaterialDecisionService() {
      super(new FakeOutboundMaterialService(), new ObjectMapper());
    }

    @Override
    public OutboundMaterialEntity validateAutoSendMaterial(Long userId, Long id, String channel) {
      OutboundMaterialEntity material = materials.get(id);
      if (material == null) {
        throw new IllegalArgumentException("forbidden material");
      }
      return material;
    }

    @Override
    public List<OutboundMaterialEntity> selectAutoSendMaterials(Long userId, String customerMessage, String replyText, String channel) {
      return selectedMaterials;
    }
  }

  private static class FakeOutboundMaterialService extends OutboundMaterialService {
    FakeOutboundMaterialService() {
      super(null, "uploads/materials");
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
