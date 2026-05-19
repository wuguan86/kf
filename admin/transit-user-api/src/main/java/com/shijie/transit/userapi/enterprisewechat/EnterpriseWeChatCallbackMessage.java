package com.shijie.transit.userapi.enterprisewechat;

public record EnterpriseWeChatCallbackMessage(
    String enterpriseUserId,
    String openKfid,
    String customerId,
    String customerName,
    String content,
    String messageType) {
}
