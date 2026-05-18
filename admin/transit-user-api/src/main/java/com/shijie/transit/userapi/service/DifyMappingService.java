package com.shijie.transit.userapi.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.shijie.transit.common.db.entity.UserDifyKnowledgeBaseMapEntity;
import com.shijie.transit.common.tenant.TenantContext;
import com.shijie.transit.userapi.mapper.UserDifyKnowledgeBaseMapMapper;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class DifyMappingService {
  private final UserDifyKnowledgeBaseMapMapper kbMapMapper;

  public DifyMappingService(UserDifyKnowledgeBaseMapMapper kbMapMapper) {
    this.kbMapMapper = kbMapMapper;
  }

  @Transactional
  public void bindKnowledgeBase(long userId, String knowledgeBaseId) {
    if (!StringUtils.hasText(knowledgeBaseId)) {
      throw new IllegalArgumentException("knowledgeBaseId required");
    }
    UserDifyKnowledgeBaseMapEntity existing = kbMapMapper.selectOne(
        new LambdaQueryWrapper<UserDifyKnowledgeBaseMapEntity>().eq(UserDifyKnowledgeBaseMapEntity::getUserId, userId));
    if (existing == null) {
      UserDifyKnowledgeBaseMapEntity entity = new UserDifyKnowledgeBaseMapEntity();
      entity.setTenantId(TenantContext.getTenantId());
      entity.setUserId(userId);
      entity.setDifyKnowledgeBaseId(knowledgeBaseId.trim());
      kbMapMapper.insert(entity);
      return;
    }
    existing.setDifyKnowledgeBaseId(knowledgeBaseId.trim());
    kbMapMapper.updateById(existing);
  }

  public String getBoundKnowledgeBase(long userId) {
    UserDifyKnowledgeBaseMapEntity existing = kbMapMapper.selectOne(
        new LambdaQueryWrapper<UserDifyKnowledgeBaseMapEntity>().eq(UserDifyKnowledgeBaseMapEntity::getUserId, userId));
    return existing == null ? null : existing.getDifyKnowledgeBaseId();
  }
}
