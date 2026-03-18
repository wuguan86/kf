package com.shijie.transit.adminapi.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.shijie.transit.adminapi.service.InvitationCodeService;
import com.shijie.transit.common.db.entity.InvitationCodeEntity;
import com.shijie.transit.common.web.Result;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;

@RestController
@RequestMapping("/api/admin/invitation-codes")
public class AdminInvitationCodeController {

    private final InvitationCodeService invitationCodeService;

    public AdminInvitationCodeController(InvitationCodeService invitationCodeService) {
        this.invitationCodeService = invitationCodeService;
    }

    @GetMapping
    public Result<IPage<InvitationCodeEntity>> page(
            @RequestParam(name = "current", defaultValue = "1") long current,
            @RequestParam(name = "size", defaultValue = "10") long size,
            @RequestParam(name = "code", required = false) String code,
            @RequestParam(name = "channel", required = false) String channel) {
        return Result.success(invitationCodeService.page(new Page<>(current, size), code, channel));
    }

    @PostMapping
    public Result<List<InvitationCodeEntity>> create(@Valid @RequestBody CreateInvitationCodeRequest request) {
        return Result.success(invitationCodeService.create(
                request.count(),
                request.type(),
                request.planId(),
                request.duration(),
                request.durationUnit(),
                request.points(),
                request.totalCount(),
                request.channel(),
                request.startTime(),
                request.endTime()
        ));
    }

    @PutMapping("/{id}")
    public Result<Void> update(@PathVariable("id") Long id, @Valid @RequestBody UpdateInvitationCodeRequest request) {
        invitationCodeService.update(
                id,
                request.planId(),
                request.duration(),
                request.durationUnit(),
                request.points(),
                request.totalCount(),
                request.channel(),
                request.startTime(),
                request.endTime()
        );
        return Result.success(null);
    }

    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable("id") Long id) {
        invitationCodeService.delete(id);
        return Result.success(null);
    }

    public record CreateInvitationCodeRequest(
            @NotNull @Min(1) Integer count,
            @NotNull Integer type,
            Long planId,
            Integer duration,
            String durationUnit,
            Integer points,
            Integer totalCount,
            String channel,
            LocalDateTime startTime,
            LocalDateTime endTime
    ) {}

    public record UpdateInvitationCodeRequest(
            Long planId,
            Integer duration,
            String durationUnit,
            Integer points,
            Integer totalCount,
            String channel,
            LocalDateTime startTime,
            LocalDateTime endTime
    ) {}
}
