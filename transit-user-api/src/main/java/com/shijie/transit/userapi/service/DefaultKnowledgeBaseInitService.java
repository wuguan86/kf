package com.shijie.transit.userapi.service;

import com.shijie.transit.common.db.entity.KnowledgeBaseEntity;
import com.shijie.transit.common.tenant.TenantContext;
import com.shijie.transit.userapi.mapper.KnowledgeBaseMapper;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.task.TaskExecutor;
import org.springframework.stereotype.Service;

@Service
public class DefaultKnowledgeBaseInitService {
  private static final Logger log = LoggerFactory.getLogger(DefaultKnowledgeBaseInitService.class);
  private static final List<String> DEFAULT_KB_NAMES = List.of("行业知识库", "项目/公司库", "流程库", "话术库");

  private final KnowledgeBaseService knowledgeBaseService;
  private final KnowledgeBaseMapper knowledgeBaseMapper;
  private final UserAccountService userAccountService;
  private final TaskExecutor taskExecutor;

  public DefaultKnowledgeBaseInitService(
      KnowledgeBaseService knowledgeBaseService,
      KnowledgeBaseMapper knowledgeBaseMapper,
      UserAccountService userAccountService,
      @Qualifier("applicationTaskExecutor") TaskExecutor taskExecutor) {
    this.knowledgeBaseService = knowledgeBaseService;
    this.knowledgeBaseMapper = knowledgeBaseMapper;
    this.userAccountService = userAccountService;
    this.taskExecutor = taskExecutor;
  }

  public void initOnFirstLoginAsync(Long tenantId, Long userId) {
    if (tenantId == null || userId == null) {
      return;
    }
    taskExecutor.execute(() -> initOnFirstLogin(tenantId, userId));
  }

  private void initOnFirstLogin(Long tenantId, Long userId) {
    TenantContext.setTenantId(tenantId);
    try {
      List<KnowledgeBaseEntity> existing = knowledgeBaseService.list(userId);
      Map<String, KnowledgeBaseEntity> byName = new LinkedHashMap<>();
      for (KnowledgeBaseEntity item : existing) {
        if (item != null && item.getName() != null && !byName.containsKey(item.getName())) {
          byName.put(item.getName(), item);
        }
      }
      for (String name : DEFAULT_KB_NAMES) {
        KnowledgeBaseEntity hit = byName.get(name);
        if (hit == null) {
          KnowledgeBaseEntity request = new KnowledgeBaseEntity();
          request.setName(name);
          request.setDescription("");
          request.setPermission("only_me");
          request.setStatus("ENABLED");
          request.setIsDefault(true);
          KnowledgeBaseEntity created = knowledgeBaseService.create(userId, request);
          log.info("首次登录初始化默认知识库成功 userId={} kbName={} kbId={}", userId, name, created.getId());
          continue;
        }
        if (!Boolean.TRUE.equals(hit.getIsDefault())) {
          hit.setIsDefault(true);
          knowledgeBaseMapper.updateById(hit);
        }
      }
      userAccountService.markInitialized(userId);
    } catch (Exception ex) {
      log.error("首次登录初始化默认知识库失败 userId={} error={}", userId, ex.getMessage(), ex);
    } finally {
      TenantContext.clear();
    }
  }
}
