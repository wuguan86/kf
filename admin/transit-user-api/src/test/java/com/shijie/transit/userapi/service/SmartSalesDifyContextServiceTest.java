package com.shijie.transit.userapi.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.shijie.transit.common.db.entity.CrmCustomerEntity;
import com.shijie.transit.common.db.entity.UserIntentEntity;
import com.shijie.transit.common.tenant.TenantContext;
import com.shijie.transit.userapi.vo.SmartSalesVo.TagView;
import java.util.List;
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
    customer.setGender("MALE");
    customer.setRemark("重点关注企业微信方案");
    customer.setAiProfileJson("""
        {"communicationStyle":"客户关注效率，适合直接给案例","relationshipContext":"群聊加好友后咨询","preferenceHints":["偏好微信沟通","关注落地案例"],"riskWarnings":["不要承诺固定折扣"],"nextConversationTips":"先发同行案例再约试用","profileNote":"适合轻量跟进"}
        """);

    UserIntentEntity intent = new UserIntentEntity();
    intent.setIntentLevel(3);
    intent.setTotalScore(86);
    intent.setDemandLevel("HIGH");
    intent.setBudgetDesc("预算在 3 万以内，关注年付优惠");
    intent.setTimeDesc("希望本周完成试用并尽快上线");
    intent.setPainPoints("人工回复慢，夜间咨询容易漏掉");
    intent.setCompetitors("竞品A、竞品B");
    intent.setDailySummary("客户持续追问价格和落地周期");

    SmartSalesDifyContextService service = new SmartSalesDifyContextService(
        new FakeSmartSalesCustomerAccess(customer, intent),
        new ObjectMapper(),
        new FakeSmartSalesTagService(List.of(
            new TagView(1L, "高价值客户", "#F59E0B", "CUSTOM"),
            new TagView(2L, "已约演示", "#22C55E", "CUSTOM"))));

    TenantContext.setTenantId(9L);
    try {
      SmartSalesDifyContextService.SalesDifyContext context =
          service.buildContext(1L, "wxid_zhangsan");

      assertEquals("FOLLOWING（跟进中）", context.salesStage());
      assertTrue(context.customerProfile().contains("客户名称：张三"));
      assertTrue(context.customerProfile().contains("客户性别：MALE"));
      assertTrue(context.customerProfile().contains("沟通风格：客户关注效率，适合直接给案例"));
      assertTrue(context.customerProfile().contains("关系背景：群聊加好友后咨询"));
      assertTrue(context.customerProfile().contains("偏好线索：偏好微信沟通、关注落地案例"));
      assertTrue(context.customerProfile().contains("风险提醒：不要承诺固定折扣"));
      assertTrue(context.customerProfile().contains("客户标签：高价值客户、已约演示"));
      assertTrue(context.customerProfile().contains("下次沟通提示：先发同行案例再约试用"));
      assertTrue(context.customerProfile().contains("画像备注：适合轻量跟进"));
      assertTrue(context.customerProfile().contains("意向等级：高意向"));
      assertTrue(context.customerProfile().contains("预算描述：预算在 3 万以内，关注年付优惠"));
      assertTrue(context.customerProfile().contains("购买时间描述：希望本周完成试用并尽快上线"));
      assertTrue(context.customerProfile().contains("核心痛点：人工回复慢，夜间咨询容易漏掉"));
      assertTrue(context.customerProfile().contains("提及竞品：竞品A、竞品B"));
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

  private static class FakeSmartSalesTagService extends SmartSalesTagService {
    private final List<TagView> tags;

    FakeSmartSalesTagService(List<TagView> tags) {
      super(null, null, null);
      this.tags = tags;
    }

    @Override
    List<TagView> loadTagsOfCustomer(Long tenantId, Long customerId) {
      return tags;
    }
  }
}
