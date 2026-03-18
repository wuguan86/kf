package com.shijie.transit.common.db.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import java.time.LocalDateTime;

@TableName("payment_order")
public class PaymentOrderEntity extends BaseTenantEntity {
  private String outTradeNo;
  private String channel;
  private String bizType;
  @JsonSerialize(using = ToStringSerializer.class)
  private Long userId;
  @JsonSerialize(using = ToStringSerializer.class)
  private Long planId;
  private Integer totalAmountCents;
  private String currency;
  private String status;
  private String codeUrl;
  private String prepayId;
  private String transactionId;
  private String tradeState;
  private String attachData;
  private String rawNotify;
  private String errorMessage;
  private Integer grantApplied;
  private LocalDateTime paidAt;
  private LocalDateTime expireAt;

  public String getOutTradeNo() {
    return outTradeNo;
  }

  public void setOutTradeNo(String outTradeNo) {
    this.outTradeNo = outTradeNo;
  }

  public String getChannel() {
    return channel;
  }

  public void setChannel(String channel) {
    this.channel = channel;
  }

  public String getBizType() {
    return bizType;
  }

  public void setBizType(String bizType) {
    this.bizType = bizType;
  }

  public Long getUserId() {
    return userId;
  }

  public void setUserId(Long userId) {
    this.userId = userId;
  }

  public Long getPlanId() {
    return planId;
  }

  public void setPlanId(Long planId) {
    this.planId = planId;
  }

  public Integer getTotalAmountCents() {
    return totalAmountCents;
  }

  public void setTotalAmountCents(Integer totalAmountCents) {
    this.totalAmountCents = totalAmountCents;
  }

  public String getCurrency() {
    return currency;
  }

  public void setCurrency(String currency) {
    this.currency = currency;
  }

  public String getStatus() {
    return status;
  }

  public void setStatus(String status) {
    this.status = status;
  }

  public String getCodeUrl() {
    return codeUrl;
  }

  public void setCodeUrl(String codeUrl) {
    this.codeUrl = codeUrl;
  }

  public String getPrepayId() {
    return prepayId;
  }

  public void setPrepayId(String prepayId) {
    this.prepayId = prepayId;
  }

  public String getTransactionId() {
    return transactionId;
  }

  public void setTransactionId(String transactionId) {
    this.transactionId = transactionId;
  }

  public String getTradeState() {
    return tradeState;
  }

  public void setTradeState(String tradeState) {
    this.tradeState = tradeState;
  }

  public String getAttachData() {
    return attachData;
  }

  public void setAttachData(String attachData) {
    this.attachData = attachData;
  }

  public String getRawNotify() {
    return rawNotify;
  }

  public void setRawNotify(String rawNotify) {
    this.rawNotify = rawNotify;
  }

  public String getErrorMessage() {
    return errorMessage;
  }

  public void setErrorMessage(String errorMessage) {
    this.errorMessage = errorMessage;
  }

  public Integer getGrantApplied() {
    return grantApplied;
  }

  public void setGrantApplied(Integer grantApplied) {
    this.grantApplied = grantApplied;
  }

  public LocalDateTime getPaidAt() {
    return paidAt;
  }

  public void setPaidAt(LocalDateTime paidAt) {
    this.paidAt = paidAt;
  }

  public LocalDateTime getExpireAt() {
    return expireAt;
  }

  public void setExpireAt(LocalDateTime expireAt) {
    this.expireAt = expireAt;
  }
}
