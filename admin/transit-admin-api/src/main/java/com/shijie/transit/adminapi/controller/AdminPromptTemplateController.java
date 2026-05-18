package com.shijie.transit.adminapi.controller;

import com.shijie.transit.adminapi.service.PromptTemplateService;
import com.shijie.transit.common.db.entity.PromptTemplateEntity;
import com.shijie.transit.common.web.Result;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 提示词模板管理接口
 */
@RestController
@RequestMapping("/api/admin/prompt-templates")
public class AdminPromptTemplateController {

    private final PromptTemplateService promptTemplateService;

    public AdminPromptTemplateController(PromptTemplateService promptTemplateService) {
        this.promptTemplateService = promptTemplateService;
    }

    @GetMapping
    public Result<List<PromptTemplateEntity>> list() {
        return Result.success(promptTemplateService.list());
    }

    @PostMapping
    public Result<PromptTemplateEntity> create(@RequestBody PromptTemplateEntity entity) {
        return Result.success(promptTemplateService.create(entity));
    }

    @PutMapping("/{id}")
    public Result<PromptTemplateEntity> update(@PathVariable("id") Long id, @RequestBody PromptTemplateEntity entity) {
        return Result.success(promptTemplateService.update(id, entity));
    }

    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable("id") Long id) {
        promptTemplateService.delete(id);
        return Result.success(null);
    }

    @GetMapping("/{id}")
    public Result<PromptTemplateEntity> getById(@PathVariable("id") Long id) {
        return Result.success(promptTemplateService.getById(id));
    }
}
