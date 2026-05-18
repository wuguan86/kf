package com.shijie.transit.common.db.entity;

import com.baomidou.mybatisplus.annotation.TableName;

@TableName("user_dify_kb_map")
public class UserDifyKnowledgeBaseMapEntity extends BaseTenantEntity {
  private Long userId;
  private String difyKnowledgeBaseId;

  public Long getUserId() {
    return userId;
  }

  public void setUserId(Long userId) {
    this.userId = userId;
  }

  public String getDifyKnowledgeBaseId() {
    return difyKnowledgeBaseId;
  }

  public void setDifyKnowledgeBaseId(String difyKnowledgeBaseId) {
    this.difyKnowledgeBaseId = difyKnowledgeBaseId;
  }
}
