package com.shijie.transit.userapi.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.shijie.transit.common.db.entity.KnowledgeBaseEntity;
import com.shijie.transit.common.db.entity.RoleKnowledgeBaseRelEntity;
import com.shijie.transit.common.tenant.TenantContext;
import com.shijie.transit.userapi.mapper.KnowledgeBaseMapper;
import com.shijie.transit.userapi.mapper.RoleKnowledgeBaseRelMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class RoleKnowledgeBaseService {
  private final RoleKnowledgeBaseRelMapper roleKnowledgeBaseRelMapper;
  private final KnowledgeBaseMapper knowledgeBaseMapper;

  public RoleKnowledgeBaseService(
      RoleKnowledgeBaseRelMapper roleKnowledgeBaseRelMapper,
      KnowledgeBaseMapper knowledgeBaseMapper) {
    this.roleKnowledgeBaseRelMapper = roleKnowledgeBaseRelMapper;
    this.knowledgeBaseMapper = knowledgeBaseMapper;
  }

  public List<KnowledgeBaseEntity> listRoleKnowledgeBases(Long userId, Long roleId) {
    List<RoleKnowledgeBaseRelEntity> relations = roleKnowledgeBaseRelMapper.selectList(
        new LambdaQueryWrapper<RoleKnowledgeBaseRelEntity>()
            .eq(RoleKnowledgeBaseRelEntity::getRoleId, roleId)
            .orderByDesc(RoleKnowledgeBaseRelEntity::getCreatedAt));
    if (relations.isEmpty()) {
      return List.of();
    }
    List<Long> kbIds = relations.stream().map(RoleKnowledgeBaseRelEntity::getKbId).toList();
    List<KnowledgeBaseEntity> knowledgeBases = knowledgeBaseMapper.selectList(
        new LambdaQueryWrapper<KnowledgeBaseEntity>()
            .eq(KnowledgeBaseEntity::getUserId, userId)
            .in(KnowledgeBaseEntity::getId, kbIds));
    if (knowledgeBases.isEmpty()) {
      return List.of();
    }
    Map<Long, KnowledgeBaseEntity> kbMap = new LinkedHashMap<>();
    for (KnowledgeBaseEntity knowledgeBase : knowledgeBases) {
      kbMap.put(knowledgeBase.getId(), knowledgeBase);
    }
    List<KnowledgeBaseEntity> sorted = new ArrayList<>();
    for (Long kbId : kbIds) {
      KnowledgeBaseEntity hit = kbMap.get(kbId);
      if (hit != null) {
        sorted.add(hit);
      }
    }
    return sorted;
  }

  @Transactional
  public void replaceRoleKnowledgeBases(Long userId, Long roleId, List<Long> knowledgeBaseIds) {
    roleKnowledgeBaseRelMapper.delete(new LambdaQueryWrapper<RoleKnowledgeBaseRelEntity>()
        .eq(RoleKnowledgeBaseRelEntity::getRoleId, roleId));
    if (knowledgeBaseIds == null || knowledgeBaseIds.isEmpty()) {
      return;
    }
    Set<Long> uniqueKbIds = knowledgeBaseIds.stream()
        .filter(id -> id != null && id > 0)
        .collect(Collectors.toCollection(LinkedHashSet::new));
    if (uniqueKbIds.isEmpty()) {
      return;
    }
    List<KnowledgeBaseEntity> existingKnowledgeBases = knowledgeBaseMapper.selectList(
        new LambdaQueryWrapper<KnowledgeBaseEntity>()
            .eq(KnowledgeBaseEntity::getUserId, userId)
            .in(KnowledgeBaseEntity::getId, uniqueKbIds));
    Set<Long> existingIds = existingKnowledgeBases.stream().map(KnowledgeBaseEntity::getId).collect(Collectors.toSet());
    for (Long kbId : uniqueKbIds) {
      if (!existingIds.contains(kbId)) {
        throw new IllegalArgumentException("knowledge base not found: " + kbId);
      }
      RoleKnowledgeBaseRelEntity relation = new RoleKnowledgeBaseRelEntity();
      relation.setTenantId(TenantContext.getTenantId());
      relation.setRoleId(roleId);
      relation.setKbId(kbId);
      roleKnowledgeBaseRelMapper.insert(relation);
    }
  }

  @Transactional
  public void removeByKnowledgeBaseId(Long kbId) {
    roleKnowledgeBaseRelMapper.delete(new LambdaQueryWrapper<RoleKnowledgeBaseRelEntity>()
        .eq(RoleKnowledgeBaseRelEntity::getKbId, kbId));
  }

  @Transactional
  public void removeByRoleId(Long roleId) {
    roleKnowledgeBaseRelMapper.delete(new LambdaQueryWrapper<RoleKnowledgeBaseRelEntity>()
        .eq(RoleKnowledgeBaseRelEntity::getRoleId, roleId));
  }

  @Transactional
  public void bindKnowledgeBase(Long userId, Long roleId, Long kbId) {
    List<KnowledgeBaseEntity> found = knowledgeBaseMapper.selectList(
        new LambdaQueryWrapper<KnowledgeBaseEntity>()
            .eq(KnowledgeBaseEntity::getUserId, userId)
            .eq(KnowledgeBaseEntity::getId, kbId)
            .last("limit 1"));
    if (found.isEmpty()) {
      throw new IllegalArgumentException("knowledge base not found: " + kbId);
    }
    RoleKnowledgeBaseRelEntity existing = roleKnowledgeBaseRelMapper.selectOne(
        new LambdaQueryWrapper<RoleKnowledgeBaseRelEntity>()
            .eq(RoleKnowledgeBaseRelEntity::getRoleId, roleId)
            .eq(RoleKnowledgeBaseRelEntity::getKbId, kbId)
            .last("limit 1"));
    if (existing != null) {
      return;
    }
    RoleKnowledgeBaseRelEntity relation = new RoleKnowledgeBaseRelEntity();
    relation.setTenantId(TenantContext.getTenantId());
    relation.setRoleId(roleId);
    relation.setKbId(kbId);
    roleKnowledgeBaseRelMapper.insert(relation);
  }
}
