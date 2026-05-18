package com.shijie.transit.common.db.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;

import java.util.List;

/**
 * 评论互动配置
 */
@TableName(value = "marketing_comment_config", autoResultMap = true)
public class MarketingCommentConfigEntity extends BaseTenantEntity {
    @JsonSerialize(using = ToStringSerializer.class)
    private Long userId;

    /**
     * 是否启用
     */
    private Boolean enabled;

    /**
     * 评论间隔开始（秒）
     */
    private Integer commentIntervalStart;

    /**
     * 评论间隔结束（秒）
     */
    private Integer commentIntervalEnd;
    
    /**
     * 单好友每日次数
     */
    private Integer maxDailyCommentsPerFriend;
    
    /**
     * 每日总次数
     */
    private Integer maxDailyTotalComments;
    
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

    public Integer getCommentIntervalStart() {
        return commentIntervalStart;
    }

    public void setCommentIntervalStart(Integer commentIntervalStart) {
        this.commentIntervalStart = commentIntervalStart;
    }

    public Integer getCommentIntervalEnd() {
        return commentIntervalEnd;
    }

    public void setCommentIntervalEnd(Integer commentIntervalEnd) {
        this.commentIntervalEnd = commentIntervalEnd;
    }

    public Integer getMaxDailyCommentsPerFriend() {
        return maxDailyCommentsPerFriend;
    }

    public void setMaxDailyCommentsPerFriend(Integer maxDailyCommentsPerFriend) {
        this.maxDailyCommentsPerFriend = maxDailyCommentsPerFriend;
    }

    public Integer getMaxDailyTotalComments() {
        return maxDailyTotalComments;
    }

    public void setMaxDailyTotalComments(Integer maxDailyTotalComments) {
        this.maxDailyTotalComments = maxDailyTotalComments;
    }

    public List<String> getKeywordFilter() {
        return keywordFilter;
    }

    public void setKeywordFilter(List<String> keywordFilter) {
        this.keywordFilter = keywordFilter;
    }
}
