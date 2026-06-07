package com.shijie.transit.userapi.wechatvision;

public record WechatMarketingMoment(
    String author,
    String content,
    Integer visualIndex,
    Boolean suitableForLike,
    Boolean alreadyLiked,
    String likeMenuAction,
    WechatMarketingVerticalRange verticalRange,
    WechatVisionBounds postBounds,
    WechatMarketingPoint likePoint,
    WechatMarketingPoint commentPoint,
    Double confidence) {

  public WechatMarketingMoment(
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
    // 兼容开发热加载时旧版 WechatVisionService 仍调用旧构造签名，避免朋友圈识别接口直接 500。
    this(author, content, visualIndex, suitableForLike, alreadyLiked, null,
        verticalRange, postBounds, likePoint, commentPoint, confidence);
  }
}
