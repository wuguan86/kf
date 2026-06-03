package com.shijie.transit.userapi.wechatvision;

import java.util.List;

public record WechatVisionParseResponse(
    String contact,
    List<WechatVisionMessage> messages,
    String snapshotDigest,
    boolean changed) {
}
