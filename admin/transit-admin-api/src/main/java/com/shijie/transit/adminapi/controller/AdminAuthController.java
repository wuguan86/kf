package com.shijie.transit.adminapi.controller;

import com.shijie.transit.adminapi.service.AdminAuthService;
import com.shijie.transit.common.web.Result;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/auth")
public class AdminAuthController {
  private final AdminAuthService adminAuthService;

  public AdminAuthController(AdminAuthService adminAuthService) {
    this.adminAuthService = adminAuthService;
  }

  @PostMapping("/login")
  public Result<AdminAuthService.LoginResult> login(@Valid @RequestBody LoginRequest request) {
    return Result.success(adminAuthService.login(request.username(), request.password()));
  }

  public record LoginRequest(@NotBlank String username, @NotBlank String password) {
  }
}
