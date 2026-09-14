package com.shijie.transit.userapi.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.shijie.transit.common.db.entity.UserAccountEntity;
import com.shijie.transit.common.mapper.UserAccountMapper;
import com.shijie.transit.common.tenant.TenantContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DuplicateKeyException;

class UserAccountServiceTest {
  private final UserAccountMapper accountMapper = mock(UserAccountMapper.class);
  private final MembershipEntitlementService entitlementService = mock(MembershipEntitlementService.class);
  private final RoleService roleService = mock(RoleService.class);
  private final UserAccountService service = new UserAccountService(accountMapper, entitlementService, roleService);

  @AfterEach
  void clearTenant() {
    TenantContext.clear();
  }

  @Test
  void newAccountGetsResourcesOnlyOnceAcrossRepeatedLogins() {
    TenantContext.setTenantId(9L);
    when(accountMapper.insert(any(UserAccountEntity.class))).thenAnswer(invocation -> {
      UserAccountEntity account = invocation.getArgument(0);
      account.setId(71L);
      return 1;
    });
    var created = service.upsertByWeChat("open-id", "", "昵称", "");
    assertTrue(created.created());
    assertEquals(9L, created.user().getTenantId());
    when(accountMapper.selectOne(any(Wrapper.class))).thenReturn(created.user());

    // 知识库尚未初始化完成时再次登录，也不得重复赠送或创建角色。
    var repeated = service.upsertByWeChat("open-id", "", "昵称", "");
    assertFalse(repeated.created());
    assertTrue(repeated.needInitialize());
    verify(entitlementService, times(1)).grantSignupPoints(71L);
    verify(roleService, times(1)).createDefaultRole(71L);
  }

  @Test
  void existingAccountDoesNotReceiveSignupResources() {
    UserAccountEntity existing = new UserAccountEntity();
    existing.setId(71L);
    existing.setIsInitialized(true);
    when(accountMapper.selectOne(any(Wrapper.class))).thenReturn(existing);
    assertFalse(service.upsertByWeChat("open-id", "union-id", "", "").created());
    verifyNoInteractions(entitlementService, roleService);
  }

  @Test
  void concurrentDuplicateInsertDoesNotGrantResources() {
    when(accountMapper.insert(any(UserAccountEntity.class))).thenThrow(new DuplicateKeyException("账号已存在"));
    assertThrows(DuplicateKeyException.class, () -> service.upsertByWeChat("open-id", "", "", ""));
    verifyNoInteractions(entitlementService, roleService);
  }

  @Test
  void resourceFailurePropagatesToRegistrationTransaction() {
    when(accountMapper.insert(any(UserAccountEntity.class))).thenAnswer(invocation -> {
      ((UserAccountEntity) invocation.getArgument(0)).setId(71L);
      return 1;
    });
    doThrow(new IllegalStateException("角色写入失败")).when(roleService).createDefaultRole(71L);
    assertThrows(IllegalStateException.class, () -> service.upsertByWeChat("open-id", "", "", ""));
  }
}
