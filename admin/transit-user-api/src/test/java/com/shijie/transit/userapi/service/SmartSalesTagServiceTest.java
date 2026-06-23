package com.shijie.transit.userapi.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.shijie.transit.common.db.entity.CrmCustomerEntity;
import com.shijie.transit.common.db.entity.CrmCustomerTagEntity;
import com.shijie.transit.common.db.entity.CrmCustomerTagRelEntity;
import com.shijie.transit.common.tenant.TenantContext;
import com.shijie.transit.common.web.TransitException;
import com.shijie.transit.userapi.dto.SmartSalesDto.UpdateTagRequest;
import com.shijie.transit.userapi.dto.SmartSalesDto.UpdateCustomerTagsRequest;
import com.shijie.transit.userapi.mapper.CrmCustomerMapper;
import com.shijie.transit.userapi.mapper.CrmCustomerTagMapper;
import com.shijie.transit.userapi.mapper.CrmCustomerTagRelMapper;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class SmartSalesTagServiceTest {

  @AfterEach
  void tearDown() {
    TenantContext.clear();
  }

  @Test
  void presetTagCanBeAppliedByAnyTenant() {
    TenantContext.setTenantId(88L);
    CrmCustomerMapper customerMapper = mock(CrmCustomerMapper.class);
    CrmCustomerTagMapper tagMapper = mock(CrmCustomerTagMapper.class);
    CrmCustomerTagRelMapper tagRelMapper = mock(CrmCustomerTagRelMapper.class);
    SmartSalesTagService service = new SmartSalesTagService(customerMapper, tagMapper, tagRelMapper);

    CrmCustomerEntity customer = new CrmCustomerEntity();
    customer.setId(11L);
    customer.setTenantId(88L);
    customer.setOwnerUserId(7L);
    customer.setContactKey("客户A");
    when(customerMapper.selectOne(any())).thenReturn(customer);
    when(tagRelMapper.findTagIdsByCustomer(88L, 11L)).thenReturn(List.of());
    when(tagRelMapper.findTagsByCustomers(88L, List.of(11L))).thenReturn(List.of());
    CrmCustomerTagEntity preset = new CrmCustomerTagEntity();
    preset.setId(9000000000000000001L);
    preset.setTenantId(0L);
    preset.setOwnerUserId(0L);
    preset.setName("高意向");
    preset.setCategory("PRESET");
    when(tagMapper.selectById(9000000000000000001L)).thenReturn(preset);

    service.updateCustomerTags(
        7L,
        "客户A",
        new UpdateCustomerTagsRequest(List.of(9000000000000000001L), List.of()));

    ArgumentCaptor<CrmCustomerTagRelEntity> captor = ArgumentCaptor.forClass(CrmCustomerTagRelEntity.class);
    verify(tagRelMapper).insert(captor.capture());
    assertEquals(88L, captor.getValue().getTenantId());
    assertEquals(11L, captor.getValue().getCustomerId());
    assertEquals(9000000000000000001L, captor.getValue().getTagId());
  }

  @Test
  void customTagFromOtherTenantCannotBeApplied() {
    TenantContext.setTenantId(88L);
    CrmCustomerMapper customerMapper = mock(CrmCustomerMapper.class);
    CrmCustomerTagMapper tagMapper = mock(CrmCustomerTagMapper.class);
    CrmCustomerTagRelMapper tagRelMapper = mock(CrmCustomerTagRelMapper.class);
    SmartSalesTagService service = new SmartSalesTagService(customerMapper, tagMapper, tagRelMapper);

    CrmCustomerEntity customer = new CrmCustomerEntity();
    customer.setId(11L);
    customer.setTenantId(88L);
    customer.setOwnerUserId(7L);
    customer.setContactKey("客户A");
    when(customerMapper.selectOne(any())).thenReturn(customer);
    when(tagRelMapper.findTagIdsByCustomer(88L, 11L)).thenReturn(List.of());
    CrmCustomerTagEntity otherTenantTag = new CrmCustomerTagEntity();
    otherTenantTag.setId(22L);
    otherTenantTag.setTenantId(99L);
    otherTenantTag.setOwnerUserId(7L);
    otherTenantTag.setName("私有标签");
    otherTenantTag.setCategory("CUSTOM");
    when(tagMapper.selectById(22L)).thenReturn(otherTenantTag);

    assertThrows(TransitException.class, () -> service.updateCustomerTags(
        7L,
        "客户A",
        new UpdateCustomerTagsRequest(List.of(22L), List.of())));
  }

  @Test
  void ownedCustomTagCanBeRenamedAndRecolored() {
    TenantContext.setTenantId(88L);
    CrmCustomerMapper customerMapper = mock(CrmCustomerMapper.class);
    CrmCustomerTagMapper tagMapper = mock(CrmCustomerTagMapper.class);
    CrmCustomerTagRelMapper tagRelMapper = mock(CrmCustomerTagRelMapper.class);
    SmartSalesTagService service = new SmartSalesTagService(customerMapper, tagMapper, tagRelMapper);

    CrmCustomerTagEntity tag = new CrmCustomerTagEntity();
    tag.setId(22L);
    tag.setTenantId(88L);
    tag.setOwnerUserId(7L);
    tag.setName("旧标签");
    tag.setColor("#5B8FF9");
    tag.setCategory("CUSTOM");
    when(tagMapper.selectById(22L)).thenReturn(tag);
    when(tagMapper.selectCount(any())).thenReturn(0L);

    service.updateTag(7L, 22L, new UpdateTagRequest("高价值客户", "#F59E0B"));

    ArgumentCaptor<CrmCustomerTagEntity> captor = ArgumentCaptor.forClass(CrmCustomerTagEntity.class);
    verify(tagMapper).updateById(captor.capture());
    assertEquals(22L, captor.getValue().getId());
    assertEquals("高价值客户", captor.getValue().getName());
    assertEquals("#F59E0B", captor.getValue().getColor());
  }

  @Test
  void presetTagCannotBeRenamed() {
    TenantContext.setTenantId(88L);
    CrmCustomerMapper customerMapper = mock(CrmCustomerMapper.class);
    CrmCustomerTagMapper tagMapper = mock(CrmCustomerTagMapper.class);
    CrmCustomerTagRelMapper tagRelMapper = mock(CrmCustomerTagRelMapper.class);
    SmartSalesTagService service = new SmartSalesTagService(customerMapper, tagMapper, tagRelMapper);

    CrmCustomerTagEntity preset = new CrmCustomerTagEntity();
    preset.setId(9000000000000000001L);
    preset.setTenantId(0L);
    preset.setOwnerUserId(0L);
    preset.setName("预设标签");
    preset.setCategory("PRESET");
    when(tagMapper.selectById(9000000000000000001L)).thenReturn(preset);

    assertThrows(TransitException.class, () -> service.updateTag(
        7L,
        9000000000000000001L,
        new UpdateTagRequest("新名称", "#1677FF")));
  }

  @Test
  void deletingOwnedCustomTagAlsoClearsCustomerRelations() {
    TenantContext.setTenantId(88L);
    CrmCustomerMapper customerMapper = mock(CrmCustomerMapper.class);
    CrmCustomerTagMapper tagMapper = mock(CrmCustomerTagMapper.class);
    CrmCustomerTagRelMapper tagRelMapper = mock(CrmCustomerTagRelMapper.class);
    SmartSalesTagService service = new SmartSalesTagService(customerMapper, tagMapper, tagRelMapper);

    CrmCustomerTagEntity tag = new CrmCustomerTagEntity();
    tag.setId(22L);
    tag.setTenantId(88L);
    tag.setOwnerUserId(7L);
    tag.setName("可删除标签");
    tag.setCategory("CUSTOM");
    when(tagMapper.selectById(22L)).thenReturn(tag);

    service.deleteTag(7L, 22L);

    verify(tagRelMapper).delete(any());
    verify(tagMapper).deleteById(22L);
  }
}
