package com.shijie.transit.common.db.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;

import java.util.List;

/**
 * 点赞互动配置
 */
@TableName(value = "marketing_like_config", autoResultMap = true)
public class MarketingLikeConfigEntity extends BaseTenantEntity {
    @JsonSerialize(using = ToStringSerializer.class)
    private Long userId;

    /**
     * 是否启用
     */
    private Boolean enabled;
    
    /**
     * 点赞间隔开始（秒）
     */
    private Integer likeIntervalStart;

    /**
     * 点赞间隔结束（秒）
     */
    private Integer likeIntervalEnd;
    
    /**
     * 单好友每日次数
     */
    private Integer maxDailyLikesPerFriend;
    
    /**
     * 每日总次数
     */
    private Integer maxDailyTotalLikes;
    
    /**
     * 关键词过滤（包含关键词时不进行互动）
     */
    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<String> keywordFilter;

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public Boolean getEnabled() {
        return enabled;
    }

    public void setEnabled(Boolean enabled) {
        this.enabled = enabled;
    }

    public Integer getLikeIntervalStart() {
        return likeIntervalStart;
    }

    public void setLikeIntervalStart(Integer likeIntervalStart) {
        this.likeIntervalStart = likeIntervalStart;
    }

    public Integer getLikeIntervalEnd() {
        return likeIntervalEnd;
    }

    public void setLikeIntervalEnd(Integer likeIntervalEnd) {
        this.likeIntervalEnd = likeIntervalEnd;
    }

    public Integer getMaxDailyLikesPerFriend() {
        return maxDailyLikesPerFriend;
    }

    public void setMaxDailyLikesPerFriend(Integer maxDailyLikesPerFriend) {
        this.maxDailyLikesPerFriend = maxDailyLikesPerFriend;
    }

    public Integer getMaxDailyTotalLikes() {
        return maxDailyTotalLikes;
    }

    public void setMaxDailyTotalLikes(Integer maxDailyTotalLikes) {
        this.maxDailyTotalLikes = maxDailyTotalLikes;
    }

    public List<String> getKeywordFilter() {
        return keywordFilter;
    }

    public void setKeywordFilter(List<String> keywordFilter) {
        this.keywordFilter = keywordFilter;
    }
}
