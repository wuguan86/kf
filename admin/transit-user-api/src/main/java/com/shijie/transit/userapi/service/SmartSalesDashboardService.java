package com.shijie.transit.userapi.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.shijie.transit.common.db.entity.CrmCustomerEntity;
import com.shijie.transit.common.tenant.TenantContext;
import com.shijie.transit.userapi.mapper.CrmCustomerMapper;
import com.shijie.transit.userapi.vo.SmartSalesVo.DashboardView;
import com.shijie.transit.userapi.vo.SmartSalesVo.PendingFollowUpView;
import com.shijie.transit.userapi.vo.SmartSalesVo.StageCountView;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

/**
 * 智能销售工作台统计服务。统计以微信消息分析沉淀出的意向客户为事实源。
 */
@Service
public class SmartSalesDashboardService {
  private static final int PENDING_FOLLOW_UP_LIMIT = 20;

  private final CrmCustomerMapper customerMapper;
  private final Clock clock;

  public SmartSalesDashboardService(CrmCustomerMapper customerMapper, Clock clock) {
    this.customerMapper = customerMapper;
    this.clock = clock;
  }

  public DashboardView getDashboard(Long ownerUserId) {
    Long tenantId = TenantContext.getTenantId();
    Map<String, Integer> stageCountMap = new HashMap<>();
    List<CrmCustomerMapper.StageCount> rawStageCounts = customerMapper.countByStage(tenantId, ownerUserId);
    if (rawStageCounts != null) {
      for (CrmCustomerMapper.StageCount sc : rawStageCounts) {
        if (sc.getStage() != null) {
          stageCountMap.put(sc.getStage(), sc.getCnt() == null ? 0 : sc.getCnt());
        }
      }
    }
    List<StageCountView> funnel = SmartSalesConstants.STAGE_ORDER.stream()
        .map(stage -> new StageCountView(
            stage,
            SmartSalesConstants.STAGE_LABELS.getOrDefault(stage, stage),
            stageCountMap.getOrDefault(stage, 0)))
        .toList();

    Integer starredCount = toInt(customerMapper.selectCount(new LambdaQueryWrapper<CrmCustomerEntity>()
        .eq(CrmCustomerEntity::getTenantId, tenantId)
        .eq(CrmCustomerEntity::getOwnerUserId, ownerUserId)
        .eq(CrmCustomerEntity::getStarred, 1)));

    Integer highIntentWithoutCustomer = toInt(
        customerMapper.countHighIntentWithoutCustomer(tenantId, ownerUserId));
    LocalDateTime now = LocalDateTime.now(clock);
    List<PendingFollowUpView> pendingViews =
        customerMapper.listPendingFollowUps(tenantId, ownerUserId, now, PENDING_FOLLOW_UP_LIMIT)
            .stream()
            .map(p -> new PendingFollowUpView(
                p.getContactKey(),
                p.getCustomerName(),
                p.getIntentLevel(),
                toIntentLabel(p.getIntentLevel()),
                p.getNextFollowUpAt()))
            .toList();
    Integer todayPendingTotal = toInt(customerMapper.selectCount(new LambdaQueryWrapper<CrmCustomerEntity>()
        .eq(CrmCustomerEntity::getTenantId, tenantId)
        .eq(CrmCustomerEntity::getOwnerUserId, ownerUserId)
        .le(CrmCustomerEntity::getNextFollowUpAt, now)
        .isNotNull(CrmCustomerEntity::getNextFollowUpAt)));

    return new DashboardView(
        funnel,
        starredCount,
        highIntentWithoutCustomer,
        pendingViews,
        todayPendingTotal);
  }

  private String toIntentLabel(Integer intentLevel) {
    if (intentLevel == null) {
      return "未知";
    }
    return switch (intentLevel) {
      case 3 -> "高意向";
      case 2 -> "中意向";
      case 1 -> "低意向";
      default -> "未知";
    };
  }

  private int toInt(Long value) {
    return value == null ? 0 : value.intValue();
  }
}
