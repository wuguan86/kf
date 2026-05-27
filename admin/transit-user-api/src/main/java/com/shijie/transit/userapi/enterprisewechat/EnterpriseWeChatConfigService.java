package com.shijie.transit.userapi.enterprisewechat;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.shijie.transit.common.db.entity.SystemConfigEntity;
import com.shijie.transit.common.mapper.SystemConfigMapper;
import com.shijie.transit.common.tenant.TenantContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class EnterpriseWeChatConfigService {
  public static final String CHANNEL_PERSONAL = "personal";
  public static final String CHANNEL_ENTERPRISE = "enterprise";
  private final SystemConfigMapper systemConfigMapper;
  private final EnterpriseWeChatProperties properties;

  public EnterpriseWeChatConfigService(SystemConfigMapper systemConfigMapper, EnterpriseWeChatProperties properties) {
    this.systemConfigMapper = systemConfigMapper;
    this.properties = properties;
  }

  public WeChatChannelConfig getChannelConfig() {
    String channel = normalizeChannel(readConfig("wechat_channel"));
    return new WeChatChannelConfig(channel);
  }

  public WeChatChannelConfig getChannelConfig(long tenantId) {
    TenantContext.setTenantId(tenantId);
    try {
      return getChannelConfig();
    } finally {
      TenantContext.clear();
    }
  }

  public String getManagedMode(long tenantId) {
    TenantContext.setTenantId(tenantId);
    try {
      return normalizeManagedMode(readConfig("enterprise_wechat_managed_mode"));
    } finally {
      TenantContext.clear();
    }
  }

  @Transactional
  public void saveManagedMode(long tenantId, String mode) {
    TenantContext.setTenantId(tenantId);
    try {
      saveConfig("enterprise_wechat_managed_mode", normalizeManagedMode(mode), "企业微信托管模式", true);
    } finally {
      TenantContext.clear();
    }
  }

  public EnterpriseWeChatRuntimeConfig getRuntimeConfig() {
    String corpId = firstText(System.getenv("ENTERPRISE_WECHAT_CORP_ID"), readConfig("enterprise_wechat_corp_id"), properties.getCorpId());
    String secret = firstText(System.getenv("ENTERPRISE_WECHAT_SECRET"), readConfig("enterprise_wechat_secret"), properties.getSecret());
    String token = firstText(System.getenv("ENTERPRISE_WECHAT_TOKEN"), readConfig("enterprise_wechat_token"), properties.getToken());
    String aesKey = firstText(
        System.getenv("ENTERPRISE_WECHAT_ENCODING_AES_KEY"),
        readConfig("enterprise_wechat_encoding_aes_key"),
        properties.getEncodingAesKey());
    String apiBaseUrl = firstText(readConfig("enterprise_wechat_api_base_url"), properties.getApiBaseUrl(), "https://qyapi.weixin.qq.com");
    return new EnterpriseWeChatRuntimeConfig(corpId, secret, token, aesKey, apiBaseUrl);
  }

  public EnterpriseWeChatRuntimeConfig getRuntimeConfig(long tenantId) {
    TenantContext.setTenantId(tenantId);
    try {
      return getRuntimeConfig();
    } finally {
      TenantContext.clear();
    }
  }

  @Transactional
  public void saveTenantConfig(long tenantId, SaveWeChatChannelCommand command) {
    TenantContext.setTenantId(tenantId);
    try {
      saveConfig("wechat_channel", normalizeChannel(command.channel()), "微信消息通道", true);
      saveConfig("enterprise_wechat_corp_id", command.corpId(), "企业微信 CorpID", true);
      saveConfig("enterprise_wechat_api_base_url", command.apiBaseUrl(), "企业微信 API 地址", true);
      saveConfig("enterprise_wechat_secret", command.secret(), "企业微信 Secret", false);
      saveConfig("enterprise_wechat_token", command.token(), "企业微信回调 Token", false);
      saveConfig("enterprise_wechat_encoding_aes_key", command.encodingAesKey(), "企业微信回调 EncodingAESKey", false);
    } finally {
      TenantContext.clear();
    }
  }

  private String readConfig(String key) {
    SystemConfigEntity entity = systemConfigMapper.selectOne(
        new LambdaQueryWrapper<SystemConfigEntity>().eq(SystemConfigEntity::getConfigKey, key));
    return entity == null ? null : entity.getConfigValue();
  }

  private void saveConfig(String key, String value, String description, boolean allowBlank) {
    if (!allowBlank && !StringUtils.hasText(value)) {
      return;
    }
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
    if (!CHANNEL_ENTERPRISE.equals(normalized)) {
      return CHANNEL_PERSONAL;
    }
    return CHANNEL_ENTERPRISE;
  }

  private String normalizeManagedMode(String value) {
    return "semi".equalsIgnoreCase(StringUtils.hasText(value) ? value.trim() : "") ? "semi" : "full";
  }

  private String firstText(String... values) {
    for (String value : values) {
      if (StringUtils.hasText(value)) {
        return value.trim();
      }
    }
    return "";
  }

  public record WeChatChannelConfig(String channel) {
  }

  public record SaveWeChatChannelCommand(
      String channel,
      String corpId,
      String apiBaseUrl,
      String secret,
      String token,
      String encodingAesKey) {
  }

  public record EnterpriseWeChatRuntimeConfig(
      String corpId,
      String secret,
      String token,
      String encodingAesKey,
      String apiBaseUrl) {
  }
}
