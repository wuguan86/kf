package com.shijie.transit.userapi.wechat;

import com.fasterxml.jackson.annotation.JsonProperty;

public class WeChatAccessTokenResponse {
  @JsonProperty("access_token")
  private String accessToken;

  @JsonProperty("openid")
  private String openId;

  @JsonProperty("unionid")
  private String unionId;

  @JsonProperty("errcode")
  private Integer errCode;

  @JsonProperty("errmsg")
  private String errMsg;

  public String getAccessToken() {
    return accessToken;
  }

  public void setAccessToken(String accessToken) {
    this.accessToken = accessToken;
  }

  public String getOpenId() {
    return openId;
  }

  public void setOpenId(String openId) {
    this.openId = openId;
  }

  public String getUnionId() {
    return unionId;
  }

  public void setUnionId(String unionId) {
    this.unionId = unionId;
  }

  public Integer getErrCode() {
    return errCode;
  }

  public void setErrCode(Integer errCode) {
    this.errCode = errCode;
  }

  public String getErrMsg() {
    return errMsg;
  }

  public void setErrMsg(String errMsg) {
    this.errMsg = errMsg;
  }
}
