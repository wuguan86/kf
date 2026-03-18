package com.shijie.transit.common.db.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import java.time.LocalDateTime;

@TableName("invitation_code")
public class InvitationCodeEntity extends BaseTenantEntity {

    /**
     * 邀请码
     */
    private String code;

    /**
     * 类型：1-会员(赠送权益) 2-普通(赠送积分)
     */
    private Integer type;

    /**
     * 会员套餐ID (type=1时有效)
     */
    @JsonSerialize(using = ToStringSerializer.class)
    private Long planId;

    /**
     * 会员时长 (type=1时有效)
     */
    private Integer duration;

    /**
     * 会员时长单位：Month/Year/Day (type=1时有效)
     */
    private String durationUnit;

    /**
     * 赠送积分数 (type=2时有效)
     */
    private Integer points;

    /**
     * 总可用次数
     */
    private Integer totalCount;

    /**
     * 已使用次数
     */
    private Integer usedCount;

    /**
     * 渠道
     */
    private String channel;

    /**
     * 开始时间
     */
    private LocalDateTime startTime;

    /**
     * 结束时间
     */
    private LocalDateTime endTime;

    public String getCode() {
        return code;
    }

    public void setCode(String code) {
        this.code = code;
    }

    public Integer getType() {
        return type;
    }

    public void setType(Integer type) {
        this.type = type;
    }

    public Long getPlanId() {
        return planId;
    }

    public void setPlanId(Long planId) {
        this.planId = planId;
    }

    public Integer getDuration() {
        return duration;
    }

    public void setDuration(Integer duration) {
        this.duration = duration;
    }

    public String getDurationUnit() {
        return durationUnit;
    }

    public void setDurationUnit(String durationUnit) {
        this.durationUnit = durationUnit;
    }

    public Integer getPoints() {
        return points;
    }

    public void setPoints(Integer points) {
        this.points = points;
    }

    public Integer getTotalCount() {
        return totalCount;
    }

    public void setTotalCount(Integer totalCount) {
        this.totalCount = totalCount;
    }

    public Integer getUsedCount() {
        return usedCount;
    }

    public void setUsedCount(Integer usedCount) {
        this.usedCount = usedCount;
    }

    public String getChannel() {
        return channel;
    }

    public void setChannel(String channel) {
        this.channel = channel;
    }

    public LocalDateTime getStartTime() {
        return startTime;
    }

    public void setStartTime(LocalDateTime startTime) {
        this.startTime = startTime;
    }

    public LocalDateTime getEndTime() {
        return endTime;
    }

    public void setEndTime(LocalDateTime endTime) {
        this.endTime = endTime;
    }
}
