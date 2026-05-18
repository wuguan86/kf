package com.shijie.transit.userapi.controller;

import com.shijie.transit.common.db.entity.RoleEntity;
import com.shijie.transit.common.db.entity.KnowledgeBaseEntity;
import com.shijie.transit.common.security.TransitPrincipal;
import com.shijie.transit.common.web.Result;
import com.shijie.transit.userapi.service.RoleKnowledgeBaseService;
import com.shijie.transit.userapi.service.RoleService;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/user/roles")
public class UserRoleController {
    private final RoleService roleService;
    private final RoleKnowledgeBaseService roleKnowledgeBaseService;

    public UserRoleController(RoleService roleService, RoleKnowledgeBaseService roleKnowledgeBaseService) {
        this.roleService = roleService;
        this.roleKnowledgeBaseService = roleKnowledgeBaseService;
    }

    private Long currentUserId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        TransitPrincipal principal = (TransitPrincipal) authentication.getPrincipal();
        return principal.subjectId();
    }

    @GetMapping
    public Result<List<RoleEntity>> list() {
        return Result.success(roleService.list(currentUserId()));
    }

    @PostMapping
    public Result<RoleEntity> create(@RequestBody RoleEntity entity) {
        return Result.success(roleService.create(currentUserId(), entity));
    }

    @PutMapping("/{id}")
    public Result<RoleEntity> update(@PathVariable("id") Long id, @RequestBody RoleEntity entity) {
        return Result.success(roleService.update(currentUserId(), id, entity));
    }

    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable("id") Long id) {
        roleService.delete(currentUserId(), id);
        return Result.success(null);
    }

    @GetMapping("/{id}/knowledge-bases")
    public Result<List<KnowledgeBaseEntity>> listRoleKnowledgeBases(@PathVariable("id") Long id) {
        Long userId = currentUserId();
        roleService.getById(userId, id);
        return Result.success(roleKnowledgeBaseService.listRoleKnowledgeBases(userId, id));
    }

    @PutMapping("/{id}/knowledge-bases")
    public Result<Void> replaceRoleKnowledgeBases(@PathVariable("id") Long id, @RequestBody ReplaceRoleKnowledgeBasesRequest request) {
        Long userId = currentUserId();
        roleService.getById(userId, id);
        roleKnowledgeBaseService.replaceRoleKnowledgeBases(userId, id, request.knowledgeBaseIds());
        return Result.success(null);
    }

    public record ReplaceRoleKnowledgeBasesRequest(List<Long> knowledgeBaseIds) {
    }
}
