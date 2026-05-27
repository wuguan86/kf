package com.shijie.transit.userapi.enterprisewechat;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.shijie.transit.common.db.entity.SystemConfigEntity;
import com.shijie.transit.common.mapper.SystemConfigMapper;
import com.shijie.transit.common.tenant.TenantContext;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class EnterpriseWeChatConfigServiceTest {

  @AfterEach
  void tearDown() {
    TenantContext.clear();
  }

  @Test
  void saveTenantConfigKeepsExistingSecretWhenRequestSecretIsBlank() {
    SystemConfigMapper mapper = mock(SystemConfigMapper.class);
    EnterpriseWeChatProperties properties = new EnterpriseWeChatProperties();
    EnterpriseWeChatConfigService service = new EnterpriseWeChatConfigService(mapper, properties);

    when(mapper.selectOne(any())).thenReturn(null);

    service.saveTenantConfig(8L, new EnterpriseWeChatConfigService.SaveWeChatChannelCommand(
        "enterprise",
        "corp-1",
        "https://qyapi.weixin.qq.com",
        " ",
        "",
        null));

    ArgumentCaptor<SystemConfigEntity> captor = ArgumentCaptor.forClass(SystemConfigEntity.class);
    verify(mapper, never()).updateById(any(SystemConfigEntity.class));
    verify(mapper, times(3)).insert(captor.capture());
    Assertions.assertTrue(captor.getAllValues().stream()
        .noneMatch(item -> "enterprise_wechat_secret".equals(item.getConfigKey())));
  }

  @Test
  void saveTenantConfigCreatesMissingChannelForCurrentTenant() {
    SystemConfigMapper mapper = mock(SystemConfigMapper.class);
    EnterpriseWeChatProperties properties = new EnterpriseWeChatProperties();
    EnterpriseWeChatConfigService service = new EnterpriseWeChatConfigService(mapper, properties);

    when(mapper.selectOne(any())).thenReturn(null);

    service.saveTenantConfig(8L, new EnterpriseWeChatConfigService.SaveWeChatChannelCommand(
        "enterprise",
        "",
        "",
        "",
        "",
        ""));

    ArgumentCaptor<SystemConfigEntity> captor = ArgumentCaptor.forClass(SystemConfigEntity.class);
    verify(mapper, times(3)).insert(captor.capture());
    assertTrue(captor.getAllValues().stream()
        .anyMatch(item -> item.getTenantId() == 8L && "wechat_channel".equals(item.getConfigKey())));
    assertNull(TenantContext.getTenantId());
  }

  @Test
  void getRuntimeConfigCanReadTenantScopedConfigForCallbackWithoutHeader() {
    SystemConfigMapper mapper = mock(SystemConfigMapper.class);
    EnterpriseWeChatProperties properties = new EnterpriseWeChatProperties();
    EnterpriseWeChatConfigService service = new EnterpriseWeChatConfigService(mapper, properties);
    SystemConfigEntity corpId = new SystemConfigEntity();
    corpId.setConfigValue("corp-1");
    when(mapper.selectOne(any())).thenReturn(corpId);

    EnterpriseWeChatConfigService.EnterpriseWeChatRuntimeConfig config = service.getRuntimeConfig(1L);

    assertEquals("corp-1", config.corpId());
    assertNull(TenantContext.getTenantId());
  }

  @Test
  void saveManagedModeStoresSemiForCallbackTransferTiming() {
    SystemConfigMapper mapper = mock(SystemConfigMapper.class);
    EnterpriseWeChatConfigService service = new EnterpriseWeChatConfigService(mapper, new EnterpriseWeChatProperties());

    when(mapper.selectOne(any())).thenReturn(null);

    service.saveManagedMode(8L, "semi");

    ArgumentCaptor<SystemConfigEntity> captor = ArgumentCaptor.forClass(SystemConfigEntity.class);
    verify(mapper).insert(captor.capture());
    assertEquals(8L, captor.getValue().getTenantId());
    assertEquals("enterprise_wechat_managed_mode", captor.getValue().getConfigKey());
    assertEquals("semi", captor.getValue().getConfigValue());
    assertNull(TenantContext.getTenantId());
  }

  @Test
  void getManagedModeDefaultsToFullWhenConfigIsMissing() {
    SystemConfigMapper mapper = mock(SystemConfigMapper.class);
    EnterpriseWeChatConfigService service = new EnterpriseWeChatConfigService(mapper, new EnterpriseWeChatProperties());

    when(mapper.selectOne(any())).thenReturn(null);

    assertEquals("full", service.getManagedMode(8L));
    assertNull(TenantContext.getTenantId());
  }
}
