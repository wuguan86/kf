package com.shijie.transit.userapi.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.shijie.transit.common.db.entity.CrmCustomerEntity;
import com.shijie.transit.common.db.entity.UserIntentEntity;
import com.shijie.transit.common.tenant.TenantContext;
import java.util.List;
import java.util.Map;
import java.util.StringJoiner;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

/**
 * 智能销售 Dify 回复上下文服务。
 * 仅负责把 CRM 档案和意向分析结果整理成 Chatflow 文本输入，避免控制器直接拼装销售业务字段。
 */
@Service
public class SmartSalesDifyContextService {
  private static final Logger log = LoggerFactory.getLogger(SmartSalesDifyContextService.class);

  private final SmartSalesCustomerAccess customerAccess;
  private final ObjectMapper objectMapper;

  public SmartSalesDifyContextService(SmartSalesCustomerAccess customerAccess, ObjectMapper objectMapper) {
    this.customerAccess = customerAccess;
    this.objectMapper = objectMapper;
  }

  public SalesDifyContext buildContext(Long ownerUserId, String contactKey) {
    if (ownerUserId == null || !StringUtils.hasText(contactKey) || customerAccess == null) {
      return SalesDifyContext.empty();
    }
    Long tenantId = TenantContext.getTenantId();
    String normalizedContactKey = contactKey.trim();
    try {
      CrmCustomerEntity customer = customerAccess.findCustomer(tenantId, ownerUserId, normalizedContactKey);
      UserIntentEntity intent = customerAccess.getIntent(tenantId, ownerUserId, normalizedContactKey);
      String salesStage = buildSalesStage(customer);
      String customerProfile = buildCustomerProfile(normalizedContactKey, customer, intent);
      return new SalesDifyContext(salesStage, customerProfile);
    } catch (Exception ex) {
      log.warn("构建智能销售 Dify 上下文失败，已降级为空上下文 tenantId={} userId={} contactKey={}",
          tenantId, ownerUserId, normalizedContactKey, ex);
      return SalesDifyContext.empty();
    }
  }

  private String buildSalesStage(CrmCustomerEntity customer) {
    if (customer == null || !StringUtils.hasText(customer.getStage())) {
      return "";
    }
    String stage = customer.getStage().trim();
    String label = SmartSalesConstants.STAGE_LABELS.get(stage);
    return StringUtils.hasText(label) ? stage + "（" + label + "）" : stage;
  }

  private String buildCustomerProfile(String contactKey, CrmCustomerEntity customer, UserIntentEntity intent) {
    StringJoiner profile = new StringJoiner("\n");
    appendLine(profile, "客户标识", contactKey);
    if (customer != null) {
      appendLine(profile, "客户名称", resolveCustomerName(customer, contactKey));
      appendLine(profile, "销售阶段", buildSalesStage(customer));
      appendLine(profile, "客户来源", customer.getSource());
      appendLine(profile, "联系电话", customer.getPhone());
      appendLine(profile, "客户备注", customer.getRemark());
      if (customer.getNextFollowUpAt() != null) {
        appendLine(profile, "下次跟进时间", customer.getNextFollowUpAt().toString());
      }
      appendAiProfile(profile, customer);
    }
    if (intent != null) {
      appendLine(profile, "意向等级", customerAccess.toIntentLabel(intent.getIntentLevel()));
      appendLine(profile, "综合评分", intent.getTotalScore() == null ? null : String.valueOf(intent.getTotalScore()));
      appendLine(profile, "需求强度", intent.getDemandLevel());
      appendLine(profile, "预算匹配", intent.getBudgetLevel());
      appendLine(profile, "时间紧迫", intent.getTimeLevel());
      appendLine(profile, "最近事件", intent.getLatestEvent());
      appendLine(profile, "沟通摘要", intent.getDailySummary());
      appendLine(profile, "AI判断原因", intent.getAiReason());
    }
    return profile.toString();
  }

  private String resolveCustomerName(CrmCustomerEntity customer, String contactKey) {
    if (customer != null && StringUtils.hasText(customer.getRemarkName())) {
      return customer.getRemarkName().trim();
    }
    return contactKey;
  }

  private void appendAiProfile(StringJoiner profile, CrmCustomerEntity customer) {
    if (objectMapper == null || customer == null || !StringUtils.hasText(customer.getAiProfileJson())) {
      return;
    }
    try {
      Map<String, Object> payload = objectMapper.readValue(
          customer.getAiProfileJson(), new TypeReference<Map<String, Object>>() {});
      appendLine(profile, "AI沟通重点", asText(payload.get("communicationFocus")));
      List<String> interestTags = asTextList(payload.get("interestTags"));
      if (!interestTags.isEmpty()) {
        appendLine(profile, "兴趣标签", String.join("、", interestTags));
      }
      appendLine(profile, "建议下一步", asText(payload.get("suggestedNextAction")));
    } catch (Exception ex) {
      log.warn("解析智能销售 AI 画像失败，已跳过画像补充 customerId={} contactKey={}",
          customer.getId(), customer.getContactKey(), ex);
    }
  }

  private void appendLine(StringJoiner profile, String label, String value) {
    if (StringUtils.hasText(value)) {
      profile.add(label + "：" + value.trim());
    }
  }

  private String asText(Object value) {
    if (value == null) {
      return null;
    }
    String text = String.valueOf(value).trim();
    return text.isEmpty() || "null".equalsIgnoreCase(text) ? null : text;
  }

  private List<String> asTextList(Object value) {
    if (value instanceof List<?> list) {
      return list.stream()
          .filter(java.util.Objects::nonNull)
          .map(String::valueOf)
          .map(String::trim)
          .filter(StringUtils::hasText)
          .toList();
    }
    return List.of();
  }

  public record SalesDifyContext(String salesStage, String customerProfile) {
    static SalesDifyContext empty() {
      return new SalesDifyContext("", "");
    }
  }
}
