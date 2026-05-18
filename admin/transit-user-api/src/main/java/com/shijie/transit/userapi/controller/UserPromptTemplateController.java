package com.shijie.transit.userapi.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.shijie.transit.common.db.entity.PromptTemplateEntity;
import com.shijie.transit.common.mapper.PromptTemplateMapper;
import com.shijie.transit.common.web.Result;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/user/prompt-templates")
public class UserPromptTemplateController {

    private final PromptTemplateMapper promptTemplateMapper;

    public UserPromptTemplateController(PromptTemplateMapper promptTemplateMapper) {
        this.promptTemplateMapper = promptTemplateMapper;
    }

    @GetMapping
    public Result<List<PromptTemplateEntity>> list() {
        LambdaQueryWrapper<PromptTemplateEntity> wrapper = new LambdaQueryWrapper<>();
        wrapper.orderByDesc(PromptTemplateEntity::getCreatedAt);
        return Result.success(promptTemplateMapper.selectList(wrapper));
    }
}
