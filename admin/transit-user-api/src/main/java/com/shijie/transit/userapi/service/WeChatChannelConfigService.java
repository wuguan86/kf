package com.shijie.transit.userapi.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.shijie.transit.common.db.entity.SystemConfigEntity;
import com.shijie.transit.common.mapper.SystemConfigMapper;
import com.shijie.transit.common.tenant.TenantContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class WeChatChannelConfigService {
  public static final String CHANNEL_PERSONAL = "personal";
  public static final String CHANNEL_ENTERPRISE = "enterprise";
  public static final String ASSISTANT_MODE_CUSTOMER_SERVICE = "customer_service";
  public static final String ASSISTANT_MODE_SALES = "sales";

  private static final String CHANNEL_CONFIG_KEY = "wechat_channel";
  private static final String MANAGED_MODE_CONFIG_KEY = "wechat_managed_mode";
  private static final String ASSISTANT_MODE_CONFIG_KEY = "assistant_mode";

  private final SystemConfigMapper systemConfigMapper;

  public WeChatChannelConfigService(SystemConfigMapper systemConfigMapper) {
    this.systemConfigMapper = systemConfigMapper;
  }

  public WeChatChannelConfig getChannelConfig(long tenantId) {
    TenantContext.setTenantId(tenantId);
    try {
      return new WeChatChannelConfig(normalizeChannel(readConfig(CHANNEL_CONFIG_KEY)));
    } finally {
      TenantContext.clear();
    }
  }

  public String getManagedMode(long tenantId) {
    TenantContext.setTenantId(tenantId);
    try {
      return normalizeManagedMode(readConfig(MANAGED_MODE_CONFIG_KEY));
    } finally {
      TenantContext.clear();
    }
  }

  public String getAssistantMode(long tenantId) {
    TenantContext.setTenantId(tenantId);
    try {
      return normalizeAssistantMode(readConfig(ASSISTANT_MODE_CONFIG_KEY));
    } finally {
      TenantContext.clear();
    }
  }

  @Transactional
  public void saveTenantConfig(long tenantId, SaveWeChatChannelCommand command) {
    TenantContext.setTenantId(tenantId);
    try {
      saveConfig(CHANNEL_CONFIG_KEY, normalizeChannel(command == null ? null : command.channel()), "微信消息通道");
    } finally {
      TenantContext.clear();
    }
  }

  @Transactional
  public void saveManagedMode(long tenantId, String mode) {
    TenantContext.setTenantId(tenantId);
    try {
      saveConfig(MANAGED_MODE_CONFIG_KEY, normalizeManagedMode(mode), "微信托管模式");
    } finally {
      TenantContext.clear();
    }
  }

  @Transactional
  public void saveAssistantMode(long tenantId, String mode) {
    TenantContext.setTenantId(tenantId);
    try {
      saveConfig(ASSISTANT_MODE_CONFIG_KEY, normalizeAssistantMode(mode), "AI 运营助手业务模式");
    } finally {
      TenantContext.clear();
    }
  }

  private String readConfig(String key) {
    SystemConfigEntity entity = systemConfigMapper.selectOne(
        new LambdaQueryWrapper<SystemConfigEntity>().eq(SystemConfigEntity::getConfigKey, key));
    return entity == null ? null : entity.getConfigValue();
  }

  private void saveConfig(String key, String value, String description) {
    String normalized = value == null ? "" : value.trim();
    SystemConfigEntity entity = systemConfigMapper.selectOne(
        new LambdaQueryWrapper<SystemConfigEntity>().eq(SystemConfigEntity::getConfigKey, key));
    if (entity == null) {
      entity = new SystemConfigEntity();
      entity.setTenantId(TenantContext.getTenantId());
      entity.setConfigKey(key);
      entity.setConfigValue(normalized);
      entity.setDescription(description);
      systemConfigMapper.insert(entity);
      return;
    }
    entity.setConfigValue(normalized);
    entity.setDescription(description);
    systemConfigMapper.updateById(entity);
  }

  private String normalizeChannel(String value) {
    String normalized = StringUtils.hasText(value) ? value.trim().toLowerCase() : CHANNEL_PERSONAL;
    return CHANNEL_ENTERPRISE.equals(normalized) ? CHANNEL_ENTERPRISE : CHANNEL_PERSONAL;
  }

  private String normalizeManagedMode(String value) {
    return "semi".equalsIgnoreCase(StringUtils.hasText(value) ? value.trim() : "") ? "semi" : "full";
  }

  private String normalizeAssistantMode(String value) {
    String normalized = StringUtils.hasText(value) ? value.trim().toLowerCase() : ASSISTANT_MODE_CUSTOMER_SERVICE;
    return ASSISTANT_MODE_SALES.equals(normalized) ? ASSISTANT_MODE_SALES : ASSISTANT_MODE_CUSTOMER_SERVICE;
  }

  public record WeChatChannelConfig(String channel) {
  }

  public record SaveWeChatChannelCommand(String channel) {
  }
}
