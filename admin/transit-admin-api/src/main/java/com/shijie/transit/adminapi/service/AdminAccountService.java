package com.shijie.transit.adminapi.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.shijie.transit.adminapi.mapper.AdminUserMapper;
import com.shijie.transit.common.db.entity.AdminUserEntity;
import com.shijie.transit.common.tenant.TenantContext;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.List;

@Service
public class AdminAccountService {
    private final AdminUserMapper adminUserMapper;
    private final PasswordEncoder passwordEncoder;

    public AdminAccountService(AdminUserMapper adminUserMapper, PasswordEncoder passwordEncoder) {
        this.adminUserMapper = adminUserMapper;
        this.passwordEncoder = passwordEncoder;
    }

    public List<AdminUserEntity> list() {
        return adminUserMapper.selectList(new LambdaQueryWrapper<AdminUserEntity>()
                .orderByDesc(AdminUserEntity::getCreatedAt));
    }

    @Transactional
    public AdminUserEntity create(String username, String password, String displayName) {
        if (!StringUtils.hasText(username) || !StringUtils.hasText(password)) {
            throw new IllegalArgumentException("Username and password are required");
        }
        
        Long tenantId = TenantContext.getTenantId();
        // Check if username exists within the tenant (if tenantId is used for isolation)
        // Usually Mybatis Plus with tenant plugin handles tenant isolation automatically,
        // but here we might need to set it explicitly if not using the plugin.
        // Assuming we need to set it.
        
        Long count = adminUserMapper.selectCount(new LambdaQueryWrapper<AdminUserEntity>()
                .eq(AdminUserEntity::getUsername, username));
        
        if (count > 0) {
            throw new IllegalArgumentException("Username already exists");
        }

        AdminUserEntity user = new AdminUserEntity();
        user.setUsername(username);
        user.setPasswordHash(passwordEncoder.encode(password));
        user.setDisplayName(displayName);
        user.setEnabled(true);
        user.setTenantId(tenantId);
        
        adminUserMapper.insert(user);
        return user;
    }

    @Transactional
    public AdminUserEntity update(Long id, String displayName, Boolean enabled) {
        AdminUserEntity user = adminUserMapper.selectById(id);
        if (user == null) {
            throw new IllegalArgumentException("User not found");
        }
        if (displayName != null) { // Allow empty string if needed, but usually we check hasText
            user.setDisplayName(displayName);
        }
        if (enabled != null) {
            user.setEnabled(enabled);
        }
        adminUserMapper.updateById(user);
        return user;
    }

    @Transactional
    public void delete(Long id) {
        adminUserMapper.deleteById(id);
    }

    @Transactional
    public void resetPassword(Long id, String newPassword) {
        if (!StringUtils.hasText(newPassword)) {
            throw new IllegalArgumentException("New password cannot be empty");
        }
        AdminUserEntity user = adminUserMapper.selectById(id);
        if (user == null) {
            throw new IllegalArgumentException("User not found");
        }
        user.setPasswordHash(passwordEncoder.encode(newPassword));
        adminUserMapper.updateById(user);
    }
}
