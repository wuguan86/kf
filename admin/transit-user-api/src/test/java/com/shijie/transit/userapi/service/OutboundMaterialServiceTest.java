package com.shijie.transit.userapi.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.shijie.transit.common.db.entity.OutboundMaterialEntity;
import com.shijie.transit.common.tenant.TenantContext;
import com.shijie.transit.userapi.mapper.OutboundMaterialMapper;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;

class OutboundMaterialServiceTest {

  @TempDir
  Path uploadRoot;

  @AfterEach
  void clearTenant() {
    TenantContext.clear();
  }

  @Test
  void listVisibleMaterialsIncludesOwnPrivateAndSameTenantCompanyOnly() {
    TenantContext.setTenantId(10L);
    OutboundMaterialMapper mapper = mock(OutboundMaterialMapper.class);
    when(mapper.selectList(any())).thenReturn(List.of(
        material(1L, 10L, 7L, "PRIVATE", "ENABLED"),
        material(2L, 10L, 8L, "PRIVATE", "ENABLED"),
        material(3L, 10L, 8L, "COMPANY", "ENABLED"),
        material(4L, 11L, 9L, "COMPANY", "ENABLED")));

    OutboundMaterialService service = new OutboundMaterialService(mapper, uploadRoot);

    List<OutboundMaterialEntity> materials = service.listVisibleMaterials(7L);

    assertEquals(List.of(1L, 3L), materials.stream().map(OutboundMaterialEntity::getId).toList());
  }

  @Test
  void validateAutoSendMaterialRejectsUnsafeMaterials() {
    TenantContext.setTenantId(10L);
    OutboundMaterialMapper mapper = mock(OutboundMaterialMapper.class);
    OutboundMaterialEntity disabled = material(1L, 10L, 7L, "PRIVATE", "DISABLED");
    disabled.setAutoSendEnabled(true);
    disabled.setAllowedChannels("personal,enterprise");
    OutboundMaterialEntity manualOnly = material(2L, 10L, 7L, "COMPANY", "ENABLED");
    manualOnly.setAutoSendEnabled(false);
    manualOnly.setAllowedChannels("personal,enterprise");
    OutboundMaterialEntity enterpriseOnly = material(3L, 10L, 7L, "COMPANY", "ENABLED");
    enterpriseOnly.setAutoSendEnabled(true);
    enterpriseOnly.setAllowedChannels("enterprise");

    OutboundMaterialService service = new OutboundMaterialService(mapper, uploadRoot);

    when(mapper.selectById(1L)).thenReturn(disabled);
    assertThrows(IllegalArgumentException.class, () -> service.validateAutoSendMaterial(7L, 1L, "personal"));

    when(mapper.selectById(2L)).thenReturn(manualOnly);
    assertThrows(IllegalArgumentException.class, () -> service.validateAutoSendMaterial(7L, 2L, "personal"));

    when(mapper.selectById(3L)).thenReturn(enterpriseOnly);
    assertThrows(IllegalArgumentException.class, () -> service.validateAutoSendMaterial(7L, 3L, "personal"));
  }

  @Test
  void uploadMaterialStoresMetadataAndFileUnderUploadRoot() throws Exception {
    TenantContext.setTenantId(10L);
    OutboundMaterialMapper mapper = mock(OutboundMaterialMapper.class);
    MockMultipartFile file = new MockMultipartFile(
        "file",
        "product.png",
        "image/png",
        new byte[] {1, 2, 3});
    OutboundMaterialService service = new OutboundMaterialService(mapper, uploadRoot);

    OutboundMaterialEntity saved = service.uploadMaterial(
        7L,
        "COMPANY",
        "产品图",
        "主推产品图片",
        "产品,图片",
        "personal,enterprise",
        true,
        file);

    assertEquals(10L, saved.getTenantId());
    assertEquals(7L, saved.getOwnerUserId());
    assertEquals("COMPANY", saved.getScope());
    assertEquals("IMAGE", saved.getFileType());
    assertEquals("png", saved.getExtension());
    assertEquals("ENABLED", saved.getStatus());
    assertEquals(3L, saved.getFileSize());
    assertEquals(true, saved.getAutoSendEnabled());
    assertEquals(true, Files.exists(uploadRoot.resolve(saved.getFileKey())));
  }

  private static OutboundMaterialEntity material(Long id, Long tenantId, Long ownerUserId, String scope, String status) {
    OutboundMaterialEntity entity = new OutboundMaterialEntity();
    entity.setId(id);
    entity.setTenantId(tenantId);
    entity.setOwnerUserId(ownerUserId);
    entity.setScope(scope);
    entity.setStatus(status);
    entity.setName("material-" + id);
    entity.setFileType("IMAGE");
    entity.setFileKey("file-" + id + ".png");
    entity.setMimeType("image/png");
    entity.setFileSize(1024L);
    entity.setExtension("png");
    return entity;
  }
}
