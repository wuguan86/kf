package com.shijie.transit.common.db.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import java.time.LocalDateTime;

@TableName("enterprise_wechat_message")
public class EnterpriseWeChatMessageEntity extends BaseTenantEntity {
  private String messageId;
  private String enterpriseUserId;
  private String openKfid;
  @JsonSerialize(using = ToStringSerializer.class)
  private Long ownerUserId;
  private String customerId;
  private String customerName;
  private String content;
  private String messageType;
  private String direction;
  private String status;
  private String rawPayload;
  private String failReason;
  private LocalDateTime receivedAt;
  private LocalDateTime repliedAt;

  public String getMessageId() {
    return messageId;
  }

  public void setMessageId(String messageId) {
    this.messageId = messageId;
  }

  public String getEnterpriseUserId() {
    return enterpriseUserId;
  }

  public void setEnterpriseUserId(String enterpriseUserId) {
    this.enterpriseUserId = enterpriseUserId;
  }

  public String getOpenKfid() {
    return openKfid;
  }

  public void setOpenKfid(String openKfid) {
    this.openKfid = openKfid;
  }

  public Long getOwnerUserId() {
    return ownerUserId;
  }

  public void setOwnerUserId(Long ownerUserId) {
    this.ownerUserId = ownerUserId;
  }

  public String getCustomerId() {
    return customerId;
  }

  public void setCustomerId(String customerId) {
    this.customerId = customerId;
  }

  public String getCustomerName() {
    return customerName;
  }

  public void setCustomerName(String customerName) {
    this.customerName = customerName;
  }

  public String getContent() {
    return content;
  }

  public void setContent(String content) {
    this.content = content;
  }

  public String getMessageType() {
    return messageType;
  }

  public void setMessageType(String messageType) {
    this.messageType = messageType;
  }

  public String getDirection() {
    return direction;
  }

  public void setDirection(String direction) {
    this.direction = direction;
  }

  public String getStatus() {
    return status;
  }

  public void setStatus(String status) {
    this.status = status;
  }

  public String getRawPayload() {
    return rawPayload;
  }

  public void setRawPayload(String rawPayload) {
    this.rawPayload = rawPayload;
  }

  public String getFailReason() {
    return failReason;
  }

  public void setFailReason(String failReason) {
    this.failReason = failReason;
  }

  public LocalDateTime getReceivedAt() {
    return receivedAt;
  }

  public void setReceivedAt(LocalDateTime receivedAt) {
    this.receivedAt = receivedAt;
  }

  public LocalDateTime getRepliedAt() {
    return repliedAt;
  }

  public void setRepliedAt(LocalDateTime repliedAt) {
    this.repliedAt = repliedAt;
  }
}
