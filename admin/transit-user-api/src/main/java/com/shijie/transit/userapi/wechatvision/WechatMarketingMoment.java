package com.shijie.transit.userapi.wechatvision;

public record WechatMarketingMoment(
    String author,
    String content,
    String timeText,
    Integer visualIndex,
    Boolean suitableForLike,
    Boolean suitableForComment,
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
    // 兼容旧构造签名，避免开发热加载期间旧调用直接触发朋友圈视觉解析异常。
    this(author, content, null, visualIndex, suitableForLike, null, alreadyLiked, null,
        verticalRange, postBounds, likePoint, commentPoint, confidence);
  }
}
