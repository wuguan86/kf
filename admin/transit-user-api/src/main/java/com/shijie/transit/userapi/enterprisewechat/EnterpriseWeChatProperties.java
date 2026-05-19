package com.shijie.transit.userapi.enterprisewechat;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "enterprise-wechat")
public class EnterpriseWeChatProperties {
  private String corpId;
  private String secret;
  private String token;
  private String encodingAesKey;
  private String apiBaseUrl = "https://qyapi.weixin.qq.com";

  public String getCorpId() {
    return corpId;
  }

  public void setCorpId(String corpId) {
    this.corpId = corpId;
  }

  public String getSecret() {
    return secret;
  }

  public void setSecret(String secret) {
    this.secret = secret;
  }

  public String getToken() {
    return token;
  }

  public void setToken(String token) {
    this.token = token;
  }

  public String getEncodingAesKey() {
    return encodingAesKey;
  }

  public void setEncodingAesKey(String encodingAesKey) {
    this.encodingAesKey = encodingAesKey;
  }

  public String getApiBaseUrl() {
    return apiBaseUrl;
  }

  public void setApiBaseUrl(String apiBaseUrl) {
    this.apiBaseUrl = apiBaseUrl;
  }
}
