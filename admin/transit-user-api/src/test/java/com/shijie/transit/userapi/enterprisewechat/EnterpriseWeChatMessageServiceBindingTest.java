package com.shijie.transit.userapi.enterprisewechat;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.shijie.transit.common.db.entity.EnterpriseWeChatUserBindingEntity;
import com.shijie.transit.common.mapper.EnterpriseWeChatUserBindingMapper;
import java.time.Clock;
import java.util.List;
import org.junit.jupiter.api.Test;

class EnterpriseWeChatMessageServiceBindingTest {

  @Test
  void saveMyBindingUsesCurrentLoginUserAsSystemUser() {
    EnterpriseWeChatUserBindingMapper bindingMapper = mock(EnterpriseWeChatUserBindingMapper.class);
    EnterpriseWeChatMessageService service = new EnterpriseWeChatMessageService(null, bindingMapper, Clock.systemUTC());

    EnterpriseWeChatUserBindingEntity saved = service.saveMyBinding(
        8L,
        99L,
        new EnterpriseWeChatMessageService.MyBindingCommand(
            " zhangsan ",
            " 张三 ",
            " 主客服 ",
            "DISABLED"));

    assertEquals(8L, saved.getTenantId());
    assertEquals(99L, saved.getUserId());
    assertEquals("zhangsan", saved.getEnterpriseUserId());
    assertEquals("张三", saved.getEnterpriseUserName());
    assertEquals("主客服", saved.getRemark());
    assertEquals("DISABLED", saved.getStatus());
    verify(bindingMapper).insert(any(EnterpriseWeChatUserBindingEntity.class));
  }

  @Test
  void saveMyBindingUpdatesExistingCurrentUserBinding() {
    EnterpriseWeChatUserBindingMapper bindingMapper = mock(EnterpriseWeChatUserBindingMapper.class);
    EnterpriseWeChatUserBindingEntity existing = new EnterpriseWeChatUserBindingEntity();
    existing.setId(123L);
    existing.setTenantId(8L);
    existing.setUserId(99L);
    when(bindingMapper.selectOne(any())).thenReturn(existing);
    EnterpriseWeChatMessageService service = new EnterpriseWeChatMessageService(null, bindingMapper, Clock.systemUTC());

    EnterpriseWeChatUserBindingEntity saved = service.saveMyBinding(
        8L,
        99L,
        new EnterpriseWeChatMessageService.MyBindingCommand("lisi", "", "", "ENABLED"));

    assertEquals(123L, saved.getId());
    assertEquals(99L, saved.getUserId());
    assertEquals("lisi", saved.getEnterpriseUserId());
    verify(bindingMapper).updateById(existing);
  }

  @Test
  void resolveOwnerUserIdFallsBackToSingleEnabledBindingWhenServicerUserIdMissing() {
    EnterpriseWeChatUserBindingMapper bindingMapper = mock(EnterpriseWeChatUserBindingMapper.class);
    EnterpriseWeChatUserBindingEntity defaultBinding = new EnterpriseWeChatUserBindingEntity();
    defaultBinding.setTenantId(8L);
    defaultBinding.setUserId(99L);
    defaultBinding.setEnterpriseUserId("WuGuanZhong");
    defaultBinding.setStatus("ENABLED");
    when(bindingMapper.selectList(any())).thenReturn(List.of(defaultBinding));
    EnterpriseWeChatMessageService service = new EnterpriseWeChatMessageService(null, bindingMapper, Clock.systemUTC());

    Long ownerUserId = service.resolveOwnerUserId(8L, "");

    assertEquals(99L, ownerUserId);
  }
}
