package com.shijie.transit.userapi.enterprisewechat;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.shijie.transit.common.db.entity.SystemConfigEntity;
import com.shijie.transit.common.mapper.SystemConfigMapper;
import org.springframework.stereotype.Service;
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

  private String readConfig(String key) {
    SystemConfigEntity entity = systemConfigMapper.selectOne(
        new LambdaQueryWrapper<SystemConfigEntity>().eq(SystemConfigEntity::getConfigKey, key));
    return entity == null ? null : entity.getConfigValue();
  }

  private String normalizeChannel(String value) {
    String normalized = StringUtils.hasText(value) ? value.trim().toLowerCase() : CHANNEL_PERSONAL;
    if (!CHANNEL_ENTERPRISE.equals(normalized)) {
      return CHANNEL_PERSONAL;
    }
    return CHANNEL_ENTERPRISE;
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

  public record EnterpriseWeChatRuntimeConfig(
      String corpId,
      String secret,
      String token,
      String encodingAesKey,
      String apiBaseUrl) {
  }
}
