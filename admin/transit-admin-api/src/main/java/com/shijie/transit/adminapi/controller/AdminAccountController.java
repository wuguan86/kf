package com.shijie.transit.adminapi.controller;

import com.shijie.transit.adminapi.service.AdminAccountService;
import com.shijie.transit.common.db.entity.AdminUserEntity;
import com.shijie.transit.common.web.Result;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/admin/accounts")
public class AdminAccountController {

    private final AdminAccountService adminAccountService;

    public AdminAccountController(AdminAccountService adminAccountService) {
        this.adminAccountService = adminAccountService;
    }

    @GetMapping
    public Result<List<AdminUserEntity>> list() {
        return Result.success(adminAccountService.list());
    }

    @PostMapping
    public Result<AdminUserEntity> create(@Valid @RequestBody CreateAdminRequest request) {
        return Result.success(adminAccountService.create(request.username(), request.password(), request.displayName()));
    }

    @PutMapping("/{id}")
    public Result<AdminUserEntity> update(@PathVariable("id") Long id, @RequestBody UpdateAdminRequest request) {
        return Result.success(adminAccountService.update(id, request.displayName(), request.enabled()));
    }

    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable("id") Long id) {
        adminAccountService.delete(id);
        return Result.success(null);
    }

    @PostMapping("/{id}/password")
    public Result<Void> resetPassword(@PathVariable("id") Long id, @Valid @RequestBody ResetPasswordRequest request) {
        adminAccountService.resetPassword(id, request.password());
        return Result.success(null);
    }

    public record CreateAdminRequest(
            @NotBlank String username,
            @NotBlank String password,
            String displayName) {
    }

    public record UpdateAdminRequest(
            String displayName,
            Boolean enabled) {
    }

    public record ResetPasswordRequest(
            @NotBlank String password) {
    }
}
