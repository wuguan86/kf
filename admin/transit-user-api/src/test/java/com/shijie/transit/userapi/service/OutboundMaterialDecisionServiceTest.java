package com.shijie.transit.userapi.service;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.shijie.transit.common.db.entity.OutboundMaterialEntity;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.web.client.RestClient;

class OutboundMaterialDecisionServiceTest {

  @Test
  void springContextCanCreateOutboundMaterialDecisionServiceWithDependencies() {
    new ApplicationContextRunner()
        .withBean(OutboundMaterialService.class, FakeOutboundMaterialService::new)
        .withBean(ObjectMapper.class, ObjectMapper::new)
        .withBean(RestClient.Builder.class, RestClient::builder)
        .withPropertyValues("transit.material.decision.model=qwen3.6-plus")
        .withBean(OutboundMaterialDecisionService.class)
        .run(context -> assertEquals(true, context.containsBean("outboundMaterialDecisionService")));
  }

  @Test
  void springContextRequiresDedicatedMaterialDecisionModelConfiguration() {
    new ApplicationContextRunner()
        .withBean(OutboundMaterialService.class, FakeOutboundMaterialService::new)
        .withBean(ObjectMapper.class, ObjectMapper::new)
        .withBean(RestClient.Builder.class, RestClient::builder)
        .withPropertyValues(
            "spring.ai.dashscope.api-key=test-key",
            "spring.ai.dashscope.chat.options.model=qwen-plus")
        .withBean(OutboundMaterialDecisionService.class)
        .run(context -> {
          OutboundMaterialDecisionService service = context.getBean(OutboundMaterialDecisionService.class);
          assertEquals(false, readBooleanField(service, "modelConfigured"));
          assertEquals("", readStringField(service, "model"));
        });
  }

  @Test
  void springContextReadsDedicatedMaterialDecisionModelConfiguration() {
    new ApplicationContextRunner()
        .withBean(OutboundMaterialService.class, FakeOutboundMaterialService::new)
        .withBean(ObjectMapper.class, ObjectMapper::new)
        .withBean(RestClient.Builder.class, RestClient::builder)
        .withPropertyValues(
            "spring.ai.dashscope.api-key=test-key",
            "transit.material.decision.model=qwen-material")
        .withBean(OutboundMaterialDecisionService.class)
        .run(context -> {
          OutboundMaterialDecisionService service = context.getBean(OutboundMaterialDecisionService.class);
          assertEquals(true, readBooleanField(service, "modelConfigured"));
          assertEquals("qwen-material", readStringField(service, "model"));
        });
  }

  @Test
  void rankCandidatesKeepsOnlyMatchedTopMaterials() {
    FakeOutboundMaterialService materialService = new FakeOutboundMaterialService();
    materialService.summaries = List.of(
        summary("1", "产品介绍图", "用户索要产品外观、产品图片或产品介绍时发送", "产品,图片,介绍", "IMAGE"),
        summary("2", "报价说明图", "用户咨询价格、套餐费用、报价单时发送", "价格,报价,费用,套餐", "IMAGE"),
        summary("3", "售后政策文件", "用户咨询退换货和保修规则时发送", "售后,保修,退换货", "FILE"));
    OutboundMaterialDecisionService service = new OutboundMaterialDecisionService(materialService, new ObjectMapper());

    List<OutboundMaterialDecisionService.RankedMaterialCandidate> candidates =
        service.rankCandidates(7L, "有没有报价单，发我看下", "personal");

    assertEquals(1, candidates.size());
    assertEquals("2", candidates.get(0).summary().materialId());
  }

  @Test
  void selectAutoSendMaterialsReturnsMatchedMaterialWithoutModelGate() {
    FakeOutboundMaterialService materialService = new FakeOutboundMaterialService();
    materialService.summaries = List.of(
        summary("31", "产品介绍图", "客户索要产品图片时发送", "产品,图片", "IMAGE"));
    materialService.materials.put(31L, material(31L, "产品介绍图"));
    OutboundMaterialDecisionService service = new OutboundMaterialDecisionService(materialService, new ObjectMapper());

    List<OutboundMaterialEntity> selectedMaterials = service.selectAutoSendMaterials(
        7L,
        "发我产品图片看看",
        "抱歉，我无法满足这个请求。",
        "personal");

    assertEquals(1, selectedMaterials.size());
    assertEquals(31L, selectedMaterials.get(0).getId());
  }

  @Test
  void parseDecisionSupportsJsonFence() throws Exception {
    OutboundMaterialDecisionService service =
        new OutboundMaterialDecisionService(new FakeOutboundMaterialService(), new ObjectMapper());

    OutboundMaterialDecisionService.MaterialDecision decision = service.parseDecision("""
        ```json
        {"should_send":true,"material_id":"31","confidence":0.91,"reason":"客户明确索要产品图"}
        ```
        """);

    assertEquals(true, decision.shouldSend());
    assertEquals("31", decision.materialId());
    assertEquals(0.91d, decision.confidence());
  }

  private static OutboundMaterialService.OutboundMaterialSummary summary(
      String id,
      String name,
      String description,
      String tags,
      String fileType) {
    return new OutboundMaterialService.OutboundMaterialSummary(
        id,
        name,
        description,
        tags,
        fileType,
        "image/png",
        "png",
        "personal,enterprise",
        "COMPANY");
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
    material.setAutoSendEnabled(true);
    material.setStatus("ENABLED");
    return material;
  }

  private static boolean readBooleanField(Object target, String fieldName) throws Exception {
    return (boolean) readField(target, fieldName);
  }

  private static String readStringField(Object target, String fieldName) throws Exception {
    return (String) readField(target, fieldName);
  }

  private static Object readField(Object target, String fieldName) throws Exception {
    var field = target.getClass().getDeclaredField(fieldName);
    field.setAccessible(true);
    return field.get(target);
  }

  private static class FakeOutboundMaterialService extends OutboundMaterialService {
    private List<OutboundMaterialSummary> summaries = List.of();
    private final Map<Long, OutboundMaterialEntity> materials = new HashMap<>();

    FakeOutboundMaterialService() {
      super(null, "uploads/materials");
    }

    @Override
    public List<OutboundMaterialSummary> listAutoSendMaterialSummaries(Long userId, String channel) {
      return summaries;
    }

    @Override
    public OutboundMaterialEntity validateAutoSendMaterial(Long userId, Long id, String channel) {
      OutboundMaterialEntity material = materials.get(id);
      if (material == null) {
        throw new IllegalArgumentException("forbidden material");
      }
      return material;
    }
  }
}
