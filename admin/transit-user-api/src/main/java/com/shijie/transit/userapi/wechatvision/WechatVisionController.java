package com.shijie.transit.userapi.wechatvision;

import com.shijie.transit.common.web.Result;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/user/wechat-vision")
public class WechatVisionController {
  private static final Logger log = LoggerFactory.getLogger(WechatVisionController.class);

  private final WechatVisionService wechatVisionService;

  public WechatVisionController(WechatVisionService wechatVisionService) {
    this.wechatVisionService = wechatVisionService;
  }

  @PostMapping(value = "/parse", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
  public Result<Object> parse(@RequestBody WechatVisionParseRequest request) {
    log.info("收到微信视觉解析请求 driverMode={} windowTitle={} sceneHint={}",
        request == null ? null : request.driverMode(),
        request == null ? null : request.windowTitle(),
        request == null ? null : request.sceneHint());
    if (request != null && "CHAT_REPLY_TRIGGER".equalsIgnoreCase(String.valueOf(request.sceneHint()).trim())) {
      return Result.success(wechatVisionService.parseReplyTrigger(request));
    }
    return Result.success(wechatVisionService.parse(request));
  }
}
