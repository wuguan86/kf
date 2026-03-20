package com.shijie.transit.userapi.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.shijie.transit.common.db.entity.MarketingCommentConfigEntity;
import com.shijie.transit.common.db.entity.MarketingLikeConfigEntity;
import com.shijie.transit.common.db.entity.MarketingScheduledTaskEntity;
import com.shijie.transit.common.tenant.TenantContext;
import com.shijie.transit.common.web.ErrorCode;
import com.shijie.transit.common.web.TransitException;
import com.shijie.transit.userapi.mapper.MarketingCommentConfigMapper;
import com.shijie.transit.userapi.mapper.MarketingLikeConfigMapper;
import com.shijie.transit.userapi.mapper.MarketingScheduledTaskMapper;
import com.shijie.transit.userapi.mapper.UserIntentDailySnapshotMapper;
import com.shijie.transit.userapi.mapper.UserIntentMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.util.StringUtils;

@Service
public class MarketingService {
    private static final Logger log = LoggerFactory.getLogger(MarketingService.class);
    private final MarketingLikeConfigMapper likeConfigMapper;
    private final MarketingCommentConfigMapper commentConfigMapper;
    private final MarketingScheduledTaskMapper scheduledTaskMapper;
    private final UserIntentMapper userIntentMapper;
    private final UserIntentDailySnapshotMapper userIntentDailySnapshotMapper;
    private final Clock clock;

    public MarketingService(MarketingLikeConfigMapper likeConfigMapper,
                            MarketingCommentConfigMapper commentConfigMapper,
                            MarketingScheduledTaskMapper scheduledTaskMapper,
                            UserIntentMapper userIntentMapper,
                            UserIntentDailySnapshotMapper userIntentDailySnapshotMapper,
                            Clock clock) {
        this.likeConfigMapper = likeConfigMapper;
        this.commentConfigMapper = commentConfigMapper;
        this.scheduledTaskMapper = scheduledTaskMapper;
        this.userIntentMapper = userIntentMapper;
        this.userIntentDailySnapshotMapper = userIntentDailySnapshotMapper;
        this.clock = clock;
    }

    public MarketingLikeConfigEntity getLikeConfig(Long userId) {
        LambdaQueryWrapper<MarketingLikeConfigEntity> query = new LambdaQueryWrapper<>();
        query.eq(MarketingLikeConfigEntity::getUserId, userId);
        return likeConfigMapper.selectOne(query);
    }

    @Transactional
    public MarketingLikeConfigEntity saveLikeConfig(Long userId, MarketingLikeConfigEntity config) {
        MarketingLikeConfigEntity existing = getLikeConfig(userId);
        if (existing == null) {
            config.setUserId(userId);
            likeConfigMapper.insert(config);
            return config;
        } else {
            config.setId(existing.getId());
            config.setUserId(userId);
            likeConfigMapper.updateById(config);
            return config;
        }
    }

    public MarketingCommentConfigEntity getCommentConfig(Long userId) {
        LambdaQueryWrapper<MarketingCommentConfigEntity> query = new LambdaQueryWrapper<>();
        query.eq(MarketingCommentConfigEntity::getUserId, userId);
        return commentConfigMapper.selectOne(query);
    }

    @Transactional
    public MarketingCommentConfigEntity saveCommentConfig(Long userId, MarketingCommentConfigEntity config) {
        MarketingCommentConfigEntity existing = getCommentConfig(userId);
        if (existing == null) {
            config.setUserId(userId);
            commentConfigMapper.insert(config);
            return config;
        } else {
            config.setId(existing.getId());
            config.setUserId(userId);
            commentConfigMapper.updateById(config);
            return config;
        }
    }

    public List<MarketingScheduledTaskEntity> getScheduledTasks(Long userId, String taskType) {
        LambdaQueryWrapper<MarketingScheduledTaskEntity> query = new LambdaQueryWrapper<>();
        query.eq(MarketingScheduledTaskEntity::getUserId, userId);
        if (taskType != null && !taskType.isEmpty()) {
            query.eq(MarketingScheduledTaskEntity::getTaskType, taskType);
        }
        query.orderByDesc(MarketingScheduledTaskEntity::getCreatedAt);
        return scheduledTaskMapper.selectList(query);
    }

    @Transactional
    public MarketingScheduledTaskEntity saveScheduledTask(Long userId, MarketingScheduledTaskEntity task) {
        task.setUserId(userId);
        if (task.getId() == null) {
            scheduledTaskMapper.insert(task);
        } else {
            // Ensure user owns the task
            MarketingScheduledTaskEntity existing = scheduledTaskMapper.selectById(task.getId());
            if (existing != null && existing.getUserId().equals(userId)) {
                scheduledTaskMapper.updateById(task);
            } else {
                throw new RuntimeException("Task not found or permission denied");
            }
        }
        return task;
    }

    @Transactional
    public void deleteScheduledTask(Long userId, Long taskId) {
        LambdaQueryWrapper<MarketingScheduledTaskEntity> query = new LambdaQueryWrapper<>();
        query.eq(MarketingScheduledTaskEntity::getId, taskId);
        query.eq(MarketingScheduledTaskEntity::getUserId, userId);
        scheduledTaskMapper.delete(query);
    }

    public IntentOverviewStats getIntentOverviewStats(Long userId) {
        Long tenantId = TenantContext.getTenantId();
        LocalDate today = LocalDate.now(clock);
        LocalDateTime todayStart = today.atStartOfDay();
        LocalDateTime yesterdayStart = today.minusDays(1).atStartOfDay();
        LocalDateTime sevenDaysStart = today.minusDays(6).atStartOfDay();
        LocalDateTime thirtyDaysStart = today.minusDays(29).atStartOfDay();
        UserIntentMapper.IntentStatsAggregate aggregate = userIntentMapper.aggregateStats(
                tenantId,
                userId,
                todayStart,
                yesterdayStart,
                sevenDaysStart,
                thirtyDaysStart);
        if (aggregate == null) {
            return new IntentOverviewStats(zeroPeriod(), zeroPeriod(), zeroPeriod(), zeroPeriod());
        }
        return new IntentOverviewStats(
                new PeriodStats(toInt(aggregate.getTodayHigh()), toInt(aggregate.getTodayMid()), toInt(aggregate.getTodayLow())),
                new PeriodStats(toInt(aggregate.getYesterdayHigh()), toInt(aggregate.getYesterdayMid()), toInt(aggregate.getYesterdayLow())),
                new PeriodStats(toInt(aggregate.getSevenDaysHigh()), toInt(aggregate.getSevenDaysMid()), toInt(aggregate.getSevenDaysLow())),
                new PeriodStats(toInt(aggregate.getThirtyDaysHigh()), toInt(aggregate.getThirtyDaysMid()), toInt(aggregate.getThirtyDaysLow())));
    }

    public CustomerListResponse getIntentCustomers(Long userId,
                                                   long pageNo,
                                                   long pageSize,
                                                   LocalDate queryDate,
                                                   String customerName,
                                                   Integer intentLevel) {
        Long tenantId = TenantContext.getTenantId();
        long normalizedPageNo = Math.max(pageNo, 1);
        long normalizedPageSize = Math.max(1, Math.min(pageSize, 200));
        long offset = (normalizedPageNo - 1) * normalizedPageSize;
        LocalDate normalizedDate = queryDate == null ? LocalDate.now(clock) : queryDate;
        String normalizedCustomerName = StringUtils.hasText(customerName) ? customerName.trim() : null;
        validateIntentLevel(intentLevel);
        log.info("查询客户列表 tenantId={} userId={} queryDate={} customerName={} intentLevel={} pageNo={} pageSize={}",
                tenantId, userId, normalizedDate, normalizedCustomerName, intentLevel, normalizedPageNo, normalizedPageSize);
        Long total = userIntentDailySnapshotMapper.countCustomers(
                tenantId, userId, normalizedDate, normalizedCustomerName, intentLevel);
        List<UserIntentDailySnapshotMapper.CustomerItem> rawItems = userIntentDailySnapshotMapper.listCustomers(
                tenantId, userId, normalizedDate, normalizedCustomerName, intentLevel, offset, normalizedPageSize);
        List<CustomerItem> list = rawItems.stream()
                .map(item -> new CustomerItem(
                        item.getCustomerName(),
                        item.getIntentLevel(),
                        toIntentLabel(item.getIntentLevel()),
                        item.getDailySummary(),
                        item.getLastChatTime()))
                .toList();
        log.info("查询客户列表完成 tenantId={} userId={} queryDate={} total={} returned={}",
                tenantId, userId, normalizedDate, total == null ? 0 : total, list.size());
        return new CustomerListResponse(total == null ? 0L : total, list);
    }

    private void validateIntentLevel(Integer intentLevel) {
        if (intentLevel == null) {
            return;
        }
        // 仅允许高/中/低意向等级，避免无效条件进入查询层。
        if (intentLevel == 1 || intentLevel == 2 || intentLevel == 3) {
            return;
        }
        throw new TransitException(ErrorCode.BAD_REQUEST, "意向度参数不合法");
    }

    private int toInt(Long value) {
        return value == null ? 0 : value.intValue();
    }

    private PeriodStats zeroPeriod() {
        return new PeriodStats(0, 0, 0);
    }

    private String toIntentLabel(Integer intentLevel) {
        if (intentLevel == null) {
            return "未知";
        }
        if (intentLevel == 3) {
            return "高意向";
        }
        if (intentLevel == 2) {
            return "中意向";
        }
        if (intentLevel == 1) {
            return "低意向";
        }
        return "未知";
    }

    public record PeriodStats(int highIntentCount, int midIntentCount, int lowIntentCount) {
    }

    public record IntentOverviewStats(
            PeriodStats today,
            PeriodStats yesterday,
            PeriodStats sevenDays,
            PeriodStats thirtyDays) {
    }

    public record CustomerItem(
            String customerName,
            Integer intentLevel,
            String intentLabel,
            String dailySummary,
            LocalDateTime lastChatTime) {
    }

    public record CustomerListResponse(
            Long total,
            List<CustomerItem> list) {
    }
}
