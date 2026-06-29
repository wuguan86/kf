package com.shijie.transit.userapi.wechatvision;

public record WechatReplyTriggerResult(
    boolean hasNewUnrepliedMessage,
    String contact,
    String latestCustomerMessage,
    String imageSummary,
    String conversationType,
    String accountCategory,
    double confidence,
    String skipReason) {
}
