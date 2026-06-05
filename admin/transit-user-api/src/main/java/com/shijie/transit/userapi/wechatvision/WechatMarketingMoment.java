package com.shijie.transit.userapi.wechatvision;

public record WechatMarketingMoment(
    String author,
    String content,
    WechatVisionBounds postBounds,
    WechatMarketingPoint likePoint,
    WechatMarketingPoint commentPoint,
    Double confidence) {
}
