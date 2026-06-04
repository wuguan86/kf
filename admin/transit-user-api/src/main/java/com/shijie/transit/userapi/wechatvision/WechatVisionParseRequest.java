package com.shijie.transit.userapi.wechatvision;

public record WechatVisionParseRequest(
    String imageDataUrl,
    String windowTitle,
    String previousDigest,
    String driverMode,
    String sceneHint) {
}
