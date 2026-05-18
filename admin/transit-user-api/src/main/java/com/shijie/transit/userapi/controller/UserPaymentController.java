package com.shijie.transit.userapi.controller;

import com.shijie.transit.common.security.TransitPrincipal;
import com.shijie.transit.common.web.Result;
import com.shijie.transit.userapi.service.AlipayPayService;
import com.shijie.transit.userapi.service.WeChatPayService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/user/payment")
public class UserPaymentController {
  private final WeChatPayService weChatPayService;
  private final AlipayPayService alipayPayService;

  public UserPaymentController(WeChatPayService weChatPayService, AlipayPayService alipayPayService) {
    this.weChatPayService = weChatPayService;
    this.alipayPayService = alipayPayService;
  }

  @PostMapping("/wechat/native")
  public Result<WeChatPayService.NativeOrderResult> createNativeOrder(
      @Valid @RequestBody CreateNativeOrderRequest request,
      HttpServletRequest httpServletRequest) {
    TransitPrincipal principal = currentPrincipal();
    String clientIp = request.clientIp();
    if (clientIp == null || clientIp.isBlank()) {
      clientIp = httpServletRequest.getRemoteAddr();
    }
    return Result.success(
        weChatPayService.createNativeOrder(
            principal.subjectId(),
            request.planId(),
            request.purchaseCount(),
            clientIp));
  }

  @PostMapping("/alipay/native")
  public Result<AlipayPayService.NativeOrderResult> createAlipayNativeOrder(
      @Valid @RequestBody CreateNativeOrderRequest request,
      HttpServletRequest httpServletRequest) {
    TransitPrincipal principal = currentPrincipal();
    String clientIp = request.clientIp();
    if (clientIp == null || clientIp.isBlank()) {
      clientIp = httpServletRequest.getRemoteAddr();
    }
    return Result.success(
        alipayPayService.createNativeOrder(
            principal.subjectId(),
            request.planId(),
            request.purchaseCount(),
            clientIp));
  }

  @GetMapping("/orders/{outTradeNo}")
  public Result<WeChatPayService.PaymentOrderStatusResult> queryOrder(@PathVariable("outTradeNo") String outTradeNo) {
    TransitPrincipal principal = currentPrincipal();
    return Result.success(weChatPayService.queryOrder(principal.subjectId(), outTradeNo));
  }

  @PostMapping(value = "/wechat/notify", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
  public ResponseEntity<String> notify(
      @RequestHeader(name = "Wechatpay-Serial", required = false) String serial,
      @RequestHeader(name = "Wechatpay-Signature", required = false) String signature,
      @RequestHeader(name = "Wechatpay-Timestamp", required = false) String timestamp,
      @RequestHeader(name = "Wechatpay-Nonce", required = false) String nonce,
      @RequestBody String requestBody) {
    try {
      WeChatPayService.NotifyAck ack = weChatPayService.handleNotify(serial, signature, timestamp, nonce, requestBody);
      if (ack.success()) {
        return ResponseEntity.ok(ack.responseBody());
      }
    } catch (Exception ex) {
      return ResponseEntity.status(HttpStatus.OK).body("{\"code\":\"FAIL\",\"message\":\"处理失败\"}");
    }
    return ResponseEntity.status(HttpStatus.OK).body("{\"code\":\"FAIL\",\"message\":\"处理失败\"}");
  }

  @PostMapping(value = "/alipay/notify", consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE)
  public ResponseEntity<String> alipayNotify(@RequestParam Map<String, String> params) {
    try {
      AlipayPayService.NotifyAck ack = alipayPayService.handleNotify(params);
      if (ack.success()) {
        return ResponseEntity.ok(ack.responseBody());
      }
    } catch (Exception ex) {
      return ResponseEntity.status(HttpStatus.OK).body("failure");
    }
    return ResponseEntity.status(HttpStatus.OK).body("failure");
  }

  private TransitPrincipal currentPrincipal() {
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    return (TransitPrincipal) authentication.getPrincipal();
  }

  public record CreateNativeOrderRequest(@NotNull Long planId, Integer purchaseCount, String clientIp) {
  }

}
