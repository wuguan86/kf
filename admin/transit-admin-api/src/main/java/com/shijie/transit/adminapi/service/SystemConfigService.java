package com.shijie.transit.adminapi.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.shijie.transit.common.db.entity.SystemConfigEntity;
import com.shijie.transit.common.mapper.SystemConfigMapper;
import com.shijie.transit.common.tenant.TenantContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class SystemConfigService {

    private final SystemConfigMapper systemConfigMapper;

    public SystemConfigService(SystemConfigMapper systemConfigMapper) {
        this.systemConfigMapper = systemConfigMapper;
    }

    public List<SystemConfigEntity> list() {
        return systemConfigMapper.selectList(new LambdaQueryWrapper<>());
    }

    public String getValue(String key) {
        SystemConfigEntity entity = systemConfigMapper.selectOne(
                new LambdaQueryWrapper<SystemConfigEntity>().eq(SystemConfigEntity::getConfigKey, key)
        );
        return entity != null ? entity.getConfigValue() : null;
    }

    @Transactional
    public void setValue(String key, String value, String description) {
        SystemConfigEntity existing = systemConfigMapper.selectOne(
                new LambdaQueryWrapper<SystemConfigEntity>().eq(SystemConfigEntity::getConfigKey, key)
        );

        if (existing != null) {
            existing.setConfigValue(value);
            if (description != null) {
                existing.setDescription(description);
            }
            systemConfigMapper.updateById(existing);
        } else {
            SystemConfigEntity newEntity = new SystemConfigEntity();
            newEntity.setTenantId(TenantContext.getTenantId());
            newEntity.setConfigKey(key);
            newEntity.setConfigValue(value);
            newEntity.setDescription(description);
            systemConfigMapper.insert(newEntity);
        }
    }

    @Transactional
    public void setValues(Map<String, String> configs) {
        for (Map.Entry<String, String> entry : configs.entrySet()) {
            setValue(entry.getKey(), entry.getValue(), null);
        }
    }
}
