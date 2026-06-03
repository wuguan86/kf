package com.shijie.transit.userapi.wechatvision;

public record WechatVisionMessage(
    String content,
    boolean isSelf,
    String uiId,
    String type,
    Double confidence) {
}
