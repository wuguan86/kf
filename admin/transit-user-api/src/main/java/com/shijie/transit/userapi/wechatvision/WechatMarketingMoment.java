package com.shijie.transit.userapi.wechatvision;

public record WechatMarketingMoment(
    String author,
    String content,
    Integer visualIndex,
    Boolean suitableForLike,
    Boolean alreadyLiked,
    WechatMarketingVerticalRange verticalRange,
    WechatVisionBounds postBounds,
    WechatMarketingPoint likePoint,
    WechatMarketingPoint commentPoint,
    Double confidence) {
}
