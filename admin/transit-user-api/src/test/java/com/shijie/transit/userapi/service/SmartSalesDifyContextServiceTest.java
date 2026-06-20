package com.shijie.transit.userapi.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.shijie.transit.common.db.entity.CrmCustomerEntity;
import com.shijie.transit.common.db.entity.UserIntentEntity;
import com.shijie.transit.common.tenant.TenantContext;
import org.junit.jupiter.api.Test;

class SmartSalesDifyContextServiceTest {

  @Test
  void buildContextFormatsSalesStageAndCustomerProfile() {
    CrmCustomerEntity customer = new CrmCustomerEntity();
    customer.setId(100L);
    customer.setContactKey("wxid_zhangsan");
    customer.setRemarkName("张三");
    customer.setStage("FOLLOWING");
    customer.setSource("GROUP");
    customer.setPhone("13800000000");
    customer.setRemark("重点关注企业微信方案");
    customer.setAiProfileJson("""
        {"communicationFocus":"先解释私域转化效果","interestTags":["企业微信","自动回复"],"suggestedNextAction":"约演示"}
        """);

    UserIntentEntity intent = new UserIntentEntity();
    intent.setIntentLevel(3);
    intent.setTotalScore(86);
    intent.setDemandLevel("HIGH");
    intent.setDailySummary("客户持续追问价格和落地周期");

    SmartSalesDifyContextService service = new SmartSalesDifyContextService(
        new FakeSmartSalesCustomerAccess(customer, intent),
        new ObjectMapper());

    TenantContext.setTenantId(9L);
    try {
      SmartSalesDifyContextService.SalesDifyContext context =
          service.buildContext(1L, "wxid_zhangsan");

      assertEquals("FOLLOWING（跟进中）", context.salesStage());
      assertTrue(context.customerProfile().contains("客户名称：张三"));
      assertTrue(context.customerProfile().contains("AI沟通重点：先解释私域转化效果"));
      assertTrue(context.customerProfile().contains("兴趣标签：企业微信、自动回复"));
      assertTrue(context.customerProfile().contains("建议下一步：约演示"));
      assertTrue(context.customerProfile().contains("意向等级：高意向"));
      assertTrue(context.customerProfile().contains("沟通摘要：客户持续追问价格和落地周期"));
    } finally {
      TenantContext.clear();
    }
  }

  private static class FakeSmartSalesCustomerAccess extends SmartSalesCustomerAccess {
    private final CrmCustomerEntity customer;
    private final UserIntentEntity intent;

    FakeSmartSalesCustomerAccess(CrmCustomerEntity customer, UserIntentEntity intent) {
      super(null, null, null);
      this.customer = customer;
      this.intent = intent;
    }

    @Override
    CrmCustomerEntity findCustomer(Long tenantId, Long ownerUserId, String contactKey) {
      return customer;
    }

    @Override
    UserIntentEntity getIntent(Long tenantId, Long ownerUserId, String contactKey) {
      return intent;
    }
  }
}
