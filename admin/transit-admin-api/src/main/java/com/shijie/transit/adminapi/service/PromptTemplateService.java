package com.shijie.transit.adminapi.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.shijie.transit.common.db.entity.PromptTemplateEntity;
import com.shijie.transit.common.mapper.PromptTemplateMapper;
import com.shijie.transit.common.tenant.TenantContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 提示词模板管理服务
 */
@Service
public class PromptTemplateService {

    private final PromptTemplateMapper promptTemplateMapper;

    public PromptTemplateService(PromptTemplateMapper promptTemplateMapper) {
        this.promptTemplateMapper = promptTemplateMapper;
    }

    /**
     * 获取模板列表
     */
    public List<PromptTemplateEntity> list() {
        LambdaQueryWrapper<PromptTemplateEntity> wrapper = new LambdaQueryWrapper<>();
        wrapper.orderByDesc(PromptTemplateEntity::getCreatedAt);
        return promptTemplateMapper.selectList(wrapper);
    }

    /**
     * 创建模板
     */
    @Transactional
    public PromptTemplateEntity create(PromptTemplateEntity entity) {
        entity.setTenantId(TenantContext.getTenantId());
        if (entity.getContent() != null) {
            entity.setContent(normalizeLineBreaks(entity.getContent()));
        }
        promptTemplateMapper.insert(entity);
        return entity;
    }

    /**
     * 更新模板
     */
    @Transactional
    public PromptTemplateEntity update(Long id, PromptTemplateEntity changes) {
        PromptTemplateEntity updateEntity = new PromptTemplateEntity();
        updateEntity.setId(id);
        boolean hasChanges = false;

        if (changes.getName() != null) {
            updateEntity.setName(changes.getName());
            hasChanges = true;
        }
        if (changes.getContent() != null) {
            updateEntity.setContent(normalizeLineBreaks(changes.getContent()));
            hasChanges = true;
        }

        if (hasChanges) {
            promptTemplateMapper.updateById(updateEntity);
        }
        
        return promptTemplateMapper.selectById(id);
    }

    private String normalizeLineBreaks(String value) {
        return value.replace("\r\n", "\n").replace("\r", "\n");
    }

    /**
     * 删除模板
     */
    @Transactional
    public void delete(Long id) {
        promptTemplateMapper.deleteById(id);
    }

    /**
     * 获取单个模板详情
     */
    public PromptTemplateEntity getById(Long id) {
        return promptTemplateMapper.selectById(id);
    }
}
