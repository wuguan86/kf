package com.shijie.transit.adminapi.controller;

import com.shijie.transit.adminapi.service.PaymentConfigService;
import com.shijie.transit.common.db.entity.PaymentConfigEntity;
import com.shijie.transit.common.web.Result;
import jakarta.validation.constraints.NotBlank;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/payment/config")
public class AdminPaymentConfigController {
  private final PaymentConfigService paymentConfigService;

  public AdminPaymentConfigController(PaymentConfigService paymentConfigService) {
    this.paymentConfigService = paymentConfigService;
  }

  @GetMapping
  public Result<List<PaymentConfigEntity>> list() {
    return Result.success(paymentConfigService.listAll());
  }

  @GetMapping("/{method}")
  public Result<PaymentConfigEntity> get(@PathVariable("method") String method) {
    return Result.success(paymentConfigService.getByMethod(method.toUpperCase()));
  }

  @PutMapping("/{method}")
  public Result<PaymentConfigEntity> save(@PathVariable("method") String method, @RequestBody SaveRequest request) {
    return Result.success(paymentConfigService.upsert(method, request.enabled(), request.configJson()));
  }

  public record SaveRequest(Boolean enabled, @NotBlank String configJson) {
  }
}
