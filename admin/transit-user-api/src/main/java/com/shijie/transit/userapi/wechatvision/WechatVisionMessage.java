package com.shijie.transit.userapi.wechatvision;

public record WechatVisionMessage(
    String content,
    boolean isSelf,
    String uiId,
    String type,
    WechatVisionBounds bounds,
    Double confidence) {

  public WechatVisionMessage(String content, boolean isSelf, String uiId, String type, Double confidence) {
    // 兼容 IDEA 热更新或增量编译时旧版服务类仍调用旧构造器的场景，避免运行中类版本不一致导致 500。
    this(content, isSelf, uiId, type, null, confidence);
  }
}
