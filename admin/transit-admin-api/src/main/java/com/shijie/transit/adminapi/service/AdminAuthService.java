package com.shijie.transit.adminapi.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.shijie.transit.adminapi.mapper.AdminUserMapper;
import com.shijie.transit.common.db.entity.AdminUserEntity;
import com.shijie.transit.common.security.JwtService;
import com.shijie.transit.common.security.TransitJwtClaims;
import java.util.UUID;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
public class AdminAuthService {
  private final AdminUserMapper adminUserMapper;
  private final PasswordEncoder passwordEncoder;
  private final JwtService jwtService;

  public AdminAuthService(AdminUserMapper adminUserMapper, PasswordEncoder passwordEncoder, JwtService jwtService) {
    this.adminUserMapper = adminUserMapper;
    this.passwordEncoder = passwordEncoder;
    this.jwtService = jwtService;
  }

  public LoginResult login(String username, String password) {
    if (!StringUtils.hasText(username) || !StringUtils.hasText(password)) {
      throw new IllegalArgumentException("username/password required");
    }

    AdminUserEntity user = adminUserMapper.selectOne(
        new LambdaQueryWrapper<AdminUserEntity>().eq(AdminUserEntity::getUsername, username.trim()));
    if (user == null || Boolean.FALSE.equals(user.getEnabled())) {
      throw new IllegalArgumentException("invalid credentials");
    }
    if (!passwordEncoder.matches(password, user.getPasswordHash())) {
      throw new IllegalArgumentException("invalid credentials");
    }
    String adminSessionId = UUID.randomUUID().toString().replace("-", "");
    String token = jwtService.issueToken(new TransitJwtClaims(user.getId(), user.getTenantId(), "ADMIN", adminSessionId));
    return new LoginResult(token, user.getId(), user.getTenantId(), user.getDisplayName());
  }

  public record LoginResult(String token, long adminUserId, long tenantId, String displayName) {
  }
}
