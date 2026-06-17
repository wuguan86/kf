package com.shijie.transit.userapi.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.shijie.transit.common.db.entity.RoleEntity;
import com.shijie.transit.userapi.mapper.RoleMapper;
import org.junit.jupiter.api.Test;

class RoleServiceTest {

  @Test
  void createDefaultsRoleTypeToCustomerService() {
    RoleMapper roleMapper = mock(RoleMapper.class);
    RoleService service = new RoleService(roleMapper, new RoleKnowledgeBaseService(null, null));

    RoleEntity entity = new RoleEntity();
    entity.setName("客服角色");
    entity.setContent("请礼貌回复");

    service.create(7L, entity);

    assertEquals("CUSTOMER_SERVICE", entity.getRoleType());
    verify(roleMapper).insert(any(RoleEntity.class));
  }

  @Test
  void updateAllowsChangingRoleType() {
    RoleMapper roleMapper = mock(RoleMapper.class);
    RoleService service = new RoleService(roleMapper, new RoleKnowledgeBaseService(null, null));

    RoleEntity existing = new RoleEntity();
    existing.setId(11L);
    existing.setUserId(7L);
    existing.setName("原角色");
    existing.setContent("原内容");
    existing.setRoleType("CUSTOMER_SERVICE");
    when(roleMapper.selectById(11L)).thenReturn(existing);

    RoleEntity request = new RoleEntity();
    request.setRoleType("SALES");

    RoleEntity updated = service.update(7L, 11L, request);

    assertEquals("SALES", updated.getRoleType());
    verify(roleMapper).updateById(existing);
  }
}
