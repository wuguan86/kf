package com.shijie.transit.adminapi.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.shijie.transit.common.db.entity.UserAccountEntity;
import com.shijie.transit.common.mapper.UserAccountMapper;
import com.shijie.transit.common.web.Result;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/admin/user-accounts")
public class AdminUserAccountController {

    private final UserAccountMapper userAccountMapper;

    public AdminUserAccountController(UserAccountMapper userAccountMapper) {
        this.userAccountMapper = userAccountMapper;
    }

    @GetMapping
    public Result<List<UserAccountEntity>> list() {
        return Result.success(userAccountMapper.selectList(new LambdaQueryWrapper<UserAccountEntity>()
                .orderByDesc(UserAccountEntity::getCreatedAt)));
    }
}
