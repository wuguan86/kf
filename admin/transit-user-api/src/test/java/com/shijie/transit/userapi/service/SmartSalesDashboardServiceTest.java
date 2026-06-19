package com.shijie.transit.userapi.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.shijie.transit.common.db.entity.CrmCustomerEntity;
import com.shijie.transit.common.tenant.TenantContext;
import com.shijie.transit.userapi.mapper.CrmCustomerMapper;
import com.shijie.transit.userapi.vo.SmartSalesVo.DashboardView;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

class SmartSalesDashboardServiceTest {

  @AfterEach
  void tearDown() {
    TenantContext.clear();
  }

  @Test
  void highIntentWithoutStageUsesNotExistsStatistic() {
    TenantContext.setTenantId(88L);
    CrmCustomerMapper customerMapper = mock(CrmCustomerMapper.class);
    SmartSalesDashboardService service = new SmartSalesDashboardService(
        customerMapper,
        Clock.fixed(Instant.parse("2026-06-19T03:00:00Z"), ZoneId.of("Asia/Shanghai")));
    CrmCustomerMapper.StageCount lead = new CrmCustomerMapper.StageCount();
    lead.setStage("LEAD");
    lead.setCnt(4);
    when(customerMapper.countByStage(88L, 7L)).thenReturn(List.of(lead));
    when(customerMapper.countHighIntentWithoutCustomer(88L, 7L)).thenReturn(3L);
    when(customerMapper.listPendingFollowUps(88L, 7L, java.time.LocalDateTime.of(2026, 6, 19, 11, 0), 20))
        .thenReturn(List.of());
    when(customerMapper.selectCount(org.mockito.ArgumentMatchers.<LambdaQueryWrapper<CrmCustomerEntity>>any()))
        .thenReturn(0L);

    DashboardView dashboard = service.getDashboard(7L);

    assertEquals(3, dashboard.highIntentWithoutStageCount());
    verify(customerMapper).countHighIntentWithoutCustomer(88L, 7L);
  }
}
