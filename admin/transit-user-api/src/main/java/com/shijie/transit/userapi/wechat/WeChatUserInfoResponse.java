package com.shijie.transit.userapi.wechat;

import com.fasterxml.jackson.annotation.JsonProperty;

public class WeChatUserInfoResponse {
  @JsonProperty("nickname")
  private String nickname;

  @JsonProperty("headimgurl")
  private String headImgUrl;

  @JsonProperty("openid")
  private String openId;

  @JsonProperty("unionid")
  private String unionId;

  @JsonProperty("errcode")
  private Integer errCode;

  @JsonProperty("errmsg")
  private String errMsg;

  public String getNickname() {
    return nickname;
  }

  public void setNickname(String nickname) {
    this.nickname = nickname;
  }

  public String getHeadImgUrl() {
    return headImgUrl;
  }

  public void setHeadImgUrl(String headImgUrl) {
    this.headImgUrl = headImgUrl;
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
