package com.shijie.transit.userapi.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.shijie.transit.common.db.entity.CrmCustomerEntity;
import com.shijie.transit.common.tenant.TenantContext;
import com.shijie.transit.userapi.dto.SmartSalesDto.ConfirmBasicInfoRequest;
import com.shijie.transit.userapi.mapper.CrmCustomerMapper;
import com.shijie.transit.userapi.mapper.UserIntentDailySnapshotMapper;
import com.shijie.transit.userapi.mapper.UserIntentMapper;
import com.shijie.transit.userapi.vo.SmartSalesVo.AiProfile;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

class SmartSalesCustomerServiceTest {

  private final Clock fixedClock = Clock.fixed(
      Instant.parse("2026-06-30T08:00:00Z"),
      ZoneId.of("Asia/Shanghai"));

  @AfterEach
  void tearDown() {
    TenantContext.clear();
  }

  @Test
  void confirmBasicInfoWritesOfficialFieldsAndClearsSuggestion() {
    TenantContext.setTenantId(88L);
    CrmCustomerMapper customerMapper = mock(CrmCustomerMapper.class);
    CrmCustomerEntity customer = existingCustomer();
    customer.setBasicInfoSuggestionJson("{\"remarkName\":\"张三\",\"phone\":\"13800000000\"}");
    when(customerMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(customer);

    SmartSalesCustomerService service = createService(customerMapper);

    service.confirmBasicInfo(7L, "wxid_zhangsan", new ConfirmBasicInfoRequest(
        "张三",
        "13800000000",
        "MALE",
        "REFERRAL",
        "朋友介绍，优先发案例"));

    assertEquals("张三", customer.getRemarkName());
    assertEquals("13800000000", customer.getPhone());
    assertEquals("MALE", customer.getGender());
    assertEquals("REFERRAL", customer.getSource());
    assertEquals("朋友介绍，优先发案例", customer.getRemark());
    assertEquals(null, customer.getBasicInfoSuggestionJson());
    assertEquals(null, customer.getBasicInfoSuggestionUpdatedAt());
    verify(customerMapper).updateById(customer);
  }

  @Test
  void updateAiProfilePersistsCommunicationAssistFieldsOnly() throws Exception {
    TenantContext.setTenantId(88L);
    CrmCustomerMapper customerMapper = mock(CrmCustomerMapper.class);
    CrmCustomerEntity customer = existingCustomer();
    when(customerMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(customer);

    SmartSalesCustomerService service = createService(customerMapper);

    service.updateAiProfile(7L, "wxid_zhangsan", new AiProfile(
        "客户直接问价格，回复要简洁",
        "朋友介绍进群，已看过演示",
        List.of("偏好微信沟通", "关注案例"),
        List.of("不要承诺固定折扣"),
        "先发同行案例，再约试用",
        "适合轻量跟进",
        null));

    var node = new ObjectMapper().readTree(customer.getAiProfileJson());
    assertEquals("客户直接问价格，回复要简洁", node.path("communicationStyle").asText());
    assertEquals("朋友介绍进群，已看过演示", node.path("relationshipContext").asText());
    assertEquals("偏好微信沟通", node.path("preferenceHints").path(0).asText());
    assertEquals("不要承诺固定折扣", node.path("riskWarnings").path(0).asText());
    assertEquals("先发同行案例，再约试用", node.path("nextConversationTips").asText());
    assertEquals("适合轻量跟进", node.path("profileNote").asText());
    assertEquals(false, node.has("customerNeeds"));
    assertEquals(false, node.has("budgetAndTimeline"));
    verify(customerMapper).updateById(customer);
  }

  private SmartSalesCustomerService createService(CrmCustomerMapper customerMapper) {
    SmartSalesCustomerAccess customerAccess = new SmartSalesCustomerAccess(
        customerMapper,
        mock(UserIntentMapper.class),
        mock(UserIntentDailySnapshotMapper.class));
    return new SmartSalesCustomerService(
        customerMapper,
        new ObjectMapper(),
        fixedClock,
        customerAccess,
        new FakeSmartSalesTagService(),
        new FakeSmartSalesFollowUpService());
  }

  private CrmCustomerEntity existingCustomer() {
    CrmCustomerEntity customer = new CrmCustomerEntity();
    customer.setId(100L);
    customer.setTenantId(88L);
    customer.setOwnerUserId(7L);
    customer.setContactKey("wxid_zhangsan");
    customer.setRemarkName("旧备注");
    customer.setPhone("");
    customer.setGender("UNKNOWN");
    customer.setSource("UNKNOWN");
    customer.setStage("LEAD");
    customer.setStarred(0);
    return customer;
  }

  private static class FakeSmartSalesTagService extends SmartSalesTagService {
    FakeSmartSalesTagService() {
      super(null, null, null);
    }

    @Override
    List<com.shijie.transit.userapi.vo.SmartSalesVo.TagView> loadTagsOfCustomer(Long tenantId, Long customerId) {
      return List.of();
    }
  }

  private static class FakeSmartSalesFollowUpService extends SmartSalesFollowUpService {
    FakeSmartSalesFollowUpService() {
      super(null, null, null);
    }

    @Override
    List<com.shijie.transit.userapi.vo.SmartSalesVo.FollowUpView> loadFollowUps(Long tenantId, Long customerId) {
      return List.of();
    }
  }
}
