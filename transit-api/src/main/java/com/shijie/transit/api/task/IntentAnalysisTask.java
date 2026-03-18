package com.shijie.transit.api.task;

import com.shijie.transit.common.tenant.TenantContext;
import com.shijie.transit.userapi.service.IntentAnalysisService;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class IntentAnalysisTask {
  private static final Logger log = LoggerFactory.getLogger(IntentAnalysisTask.class);
  private final JdbcTemplate jdbcTemplate;
  private final IntentAnalysisService intentAnalysisService;

  public IntentAnalysisTask(JdbcTemplate jdbcTemplate, IntentAnalysisService intentAnalysisService) {
    this.jdbcTemplate = jdbcTemplate;
    this.intentAnalysisService = intentAnalysisService;
  }

  @Scheduled(fixedDelay = 300000, initialDelay = 60000)
  public void analyzeIntent() {
    log.info("Starting intent analysis task...");
    List<UserTenantPair> targets = jdbcTemplate.query(
        """
            SELECT DISTINCT tenant_id, user_id
            FROM session_message_history
            WHERE user_id IS NOT NULL
            """,
        (rs, rowNum) -> new UserTenantPair(rs.getLong("tenant_id"), rs.getLong("user_id")));
    
    if (targets.isEmpty()) {
      log.info("No users found in session_message_history for intent analysis.");
      return;
    }
    log.info("Found {} users in session_message_history for intent analysis.", targets.size());

    for (UserTenantPair target : targets) {
      TenantContext.setTenantId(target.tenantId());
      try {
        intentAnalysisService.analyzeUserPendingContacts(target.userId());
      } finally {
        TenantContext.clear();
      }
    }
  }

  private record UserTenantPair(Long tenantId, Long userId) {
  }
}
