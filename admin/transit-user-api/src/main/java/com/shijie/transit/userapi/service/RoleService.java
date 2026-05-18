package com.shijie.transit.userapi.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.shijie.transit.common.db.entity.RoleEntity;
import com.shijie.transit.common.tenant.TenantContext;
import com.shijie.transit.userapi.mapper.RoleMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class RoleService {
    private final RoleMapper roleMapper;
    private final RoleKnowledgeBaseService roleKnowledgeBaseService;

    public RoleService(RoleMapper roleMapper, RoleKnowledgeBaseService roleKnowledgeBaseService) {
        this.roleMapper = roleMapper;
        this.roleKnowledgeBaseService = roleKnowledgeBaseService;
    }

    public List<RoleEntity> list(Long userId) {
        LambdaQueryWrapper<RoleEntity> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(RoleEntity::getUserId, userId);
        wrapper.orderByDesc(RoleEntity::getCreatedAt);
        return roleMapper.selectList(wrapper);
    }

    public RoleEntity getById(Long userId, Long id) {
        RoleEntity existing = roleMapper.selectById(id);
        if (existing == null || !existing.getUserId().equals(userId)) {
            throw new RuntimeException("Role not found or permission denied");
        }
        return existing;
    }

    @Transactional
    public RoleEntity create(Long userId, RoleEntity entity) {
        validateName(entity.getName());
        entity.setUserId(userId);
        entity.setTenantId(TenantContext.getTenantId());
        entity.setStatus("PENDING");
        roleMapper.insert(entity);
        return entity;
    }

    @Transactional
    public RoleEntity update(Long userId, Long id, RoleEntity entity) {
        RoleEntity existing = roleMapper.selectById(id);
        if (existing == null || !existing.getUserId().equals(userId)) {
            throw new RuntimeException("Role not found or permission denied");
        }
        // Only allow updating editable fields
        if (entity.getName() != null) {
            validateName(entity.getName());
            existing.setName(entity.getName());
        }
        if (entity.getContent() != null) existing.setContent(entity.getContent());
        if (entity.getStatus() != null) existing.setStatus(entity.getStatus());
        if (entity.getPromptTemplateId() != null) existing.setPromptTemplateId(entity.getPromptTemplateId());
        if (entity.getKnowledgeBaseId() != null) existing.setKnowledgeBaseId(entity.getKnowledgeBaseId());
        
        roleMapper.updateById(existing);
        return existing;
    }

    @Transactional
    public void delete(Long userId, Long id) {
        RoleEntity existing = roleMapper.selectById(id);
        if (existing != null && existing.getUserId().equals(userId)) {
            roleKnowledgeBaseService.removeByRoleId(id);
            roleMapper.deleteById(id);
        }
    }

    @Transactional
    public RoleEntity bindKnowledgeBase(Long userId, Long id, String knowledgeBaseId) {
        RoleEntity existing = getById(userId, id);
        existing.setKnowledgeBaseId(knowledgeBaseId);
        roleMapper.updateById(existing);
        return existing;
    }

    private void validateName(String name) {
        if (name != null && name.length() > 15) {
            throw new IllegalArgumentException("Role name length must be <= 15");
        }
    }
}
