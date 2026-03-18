package com.shijie.transit.api.task;

import com.shijie.transit.common.tenant.TenantContext;
import com.shijie.transit.userapi.service.MembershipEntitlementService;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class MembershipSettlementTask {
  private final JdbcTemplate jdbcTemplate;
  private final MembershipEntitlementService membershipEntitlementService;

  public MembershipSettlementTask(
      JdbcTemplate jdbcTemplate,
      MembershipEntitlementService membershipEntitlementService) {
    this.jdbcTemplate = jdbcTemplate;
    this.membershipEntitlementService = membershipEntitlementService;
  }

  @Scheduled(fixedDelay = 300000, initialDelay = 60000)
  public void settleMembershipPoints() {
    List<UserTenantPair> targets = jdbcTemplate.query(
        """
            SELECT DISTINCT tenant_id, user_id
            FROM user_membership
            WHERE points_balance > 0
               OR status IN ('active', 'scheduled')
            """,
        (rs, rowNum) -> new UserTenantPair(rs.getLong("tenant_id"), rs.getLong("user_id")));
    for (UserTenantPair target : targets) {
      TenantContext.setTenantId(target.tenantId());
      try {
        membershipEntitlementService.refreshMembershipStatus(target.userId());
      } finally {
        TenantContext.clear();
      }
    }
  }

  private record UserTenantPair(Long tenantId, Long userId) {
  }
}
