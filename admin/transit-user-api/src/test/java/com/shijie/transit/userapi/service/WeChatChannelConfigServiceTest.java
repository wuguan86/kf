package com.shijie.transit.userapi.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.shijie.transit.common.db.entity.SystemConfigEntity;
import com.shijie.transit.common.mapper.SystemConfigMapper;
import com.shijie.transit.common.tenant.TenantContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class WeChatChannelConfigServiceTest {

  @AfterEach
  void tearDown() {
    TenantContext.clear();
  }

  @Test
  void getChannelConfigDefaultsToPersonalWhenMissing() {
    SystemConfigMapper mapper = mock(SystemConfigMapper.class);
    WeChatChannelConfigService service = new WeChatChannelConfigService(mapper);

    when(mapper.selectOne(any())).thenReturn(null);

    assertEquals("personal", service.getChannelConfig(8L).channel());
    assertNull(TenantContext.getTenantId());
  }

  @Test
  void saveTenantConfigStoresEnterpriseChannelForTenant() {
    SystemConfigMapper mapper = mock(SystemConfigMapper.class);
    WeChatChannelConfigService service = new WeChatChannelConfigService(mapper);
    when(mapper.selectOne(any())).thenReturn(null);

    service.saveTenantConfig(8L, new WeChatChannelConfigService.SaveWeChatChannelCommand("enterprise"));

    ArgumentCaptor<SystemConfigEntity> captor = ArgumentCaptor.forClass(SystemConfigEntity.class);
    verify(mapper).insert(captor.capture());
    assertEquals(8L, captor.getValue().getTenantId());
    assertEquals("wechat_channel", captor.getValue().getConfigKey());
    assertEquals("enterprise", captor.getValue().getConfigValue());
    assertNull(TenantContext.getTenantId());
  }

  @Test
  void saveManagedModeStoresGenericWechatManagedModeKey() {
    SystemConfigMapper mapper = mock(SystemConfigMapper.class);
    WeChatChannelConfigService service = new WeChatChannelConfigService(mapper);
    when(mapper.selectOne(any())).thenReturn(null);

    service.saveManagedMode(8L, "semi");

    ArgumentCaptor<SystemConfigEntity> captor = ArgumentCaptor.forClass(SystemConfigEntity.class);
    verify(mapper).insert(captor.capture());
    assertEquals("wechat_managed_mode", captor.getValue().getConfigKey());
    assertEquals("semi", captor.getValue().getConfigValue());
    assertNull(TenantContext.getTenantId());
  }
}
