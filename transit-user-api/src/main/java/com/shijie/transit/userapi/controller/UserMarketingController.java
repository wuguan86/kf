package com.shijie.transit.userapi.controller;

import com.shijie.transit.common.db.entity.MarketingCommentConfigEntity;
import com.shijie.transit.common.db.entity.MarketingLikeConfigEntity;
import com.shijie.transit.common.db.entity.MarketingScheduledTaskEntity;
import com.shijie.transit.common.security.TransitPrincipal;
import com.shijie.transit.common.web.Result;
import com.shijie.transit.userapi.service.MarketingService;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/user/marketing")
public class UserMarketingController {

    private final MarketingService marketingService;

    public UserMarketingController(MarketingService marketingService) {
        this.marketingService = marketingService;
    }

    @GetMapping("/like")
    public Result<MarketingLikeConfigEntity> getLikeConfig() {
        return Result.success(marketingService.getLikeConfig(currentUserId()));
    }

    @PostMapping("/like")
    public Result<MarketingLikeConfigEntity> saveLikeConfig(@RequestBody MarketingLikeConfigEntity config) {
        return Result.success(marketingService.saveLikeConfig(currentUserId(), config));
    }

    @GetMapping("/comment")
    public Result<MarketingCommentConfigEntity> getCommentConfig() {
        return Result.success(marketingService.getCommentConfig(currentUserId()));
    }

    @PostMapping("/comment")
    public Result<MarketingCommentConfigEntity> saveCommentConfig(@RequestBody MarketingCommentConfigEntity config) {
        return Result.success(marketingService.saveCommentConfig(currentUserId(), config));
    }

    @GetMapping("/tasks")
    public Result<List<MarketingScheduledTaskEntity>> getScheduledTasks(@RequestParam(value = "taskType", required = false) String taskType) {
        return Result.success(marketingService.getScheduledTasks(currentUserId(), taskType));
    }

    @PostMapping("/tasks")
    public Result<MarketingScheduledTaskEntity> saveScheduledTask(@RequestBody MarketingScheduledTaskEntity task) {
        return Result.success(marketingService.saveScheduledTask(currentUserId(), task));
    }

    @DeleteMapping("/tasks/{taskId}")
    public Result<Boolean> deleteScheduledTask(@PathVariable("taskId") Long taskId) {
        marketingService.deleteScheduledTask(currentUserId(), taskId);
        return Result.success(true);
    }

    @GetMapping("/statistics/overview")
    public Result<MarketingService.IntentOverviewStats> getIntentOverviewStats() {
        return Result.success(marketingService.getIntentOverviewStats(currentUserId()));
    }

    @GetMapping("/statistics/customers")
    public Result<MarketingService.CustomerListResponse> getIntentCustomers(
            @RequestParam(value = "pageNo", defaultValue = "1") Long pageNo,
            @RequestParam(value = "pageSize", defaultValue = "20") Long pageSize) {
        return Result.success(marketingService.getIntentCustomers(currentUserId(), pageNo, pageSize));
    }

    private Long currentUserId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof TransitPrincipal)) {
             // For testing or development if security context is missing
             // return 1L; 
             throw new RuntimeException("User not authenticated");
        }
        TransitPrincipal principal = (TransitPrincipal) authentication.getPrincipal();
        return principal.subjectId();
    }
}
