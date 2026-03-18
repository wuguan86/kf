package com.shijie.transit.userapi.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.shijie.transit.common.db.entity.UserIntentEntity;
import java.time.LocalDateTime;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface UserIntentMapper extends BaseMapper<UserIntentEntity> {
  @Select("""
      SELECT
        SUM(CASE WHEN intent_level = 3 AND IFNULL(last_analyzed_at, updated_at) >= #{todayStart} THEN 1 ELSE 0 END) AS todayHigh,
        SUM(CASE WHEN intent_level = 2 AND IFNULL(last_analyzed_at, updated_at) >= #{todayStart} THEN 1 ELSE 0 END) AS todayMid,
        SUM(CASE WHEN intent_level = 1 AND IFNULL(last_analyzed_at, updated_at) >= #{todayStart} THEN 1 ELSE 0 END) AS todayLow,
        SUM(CASE WHEN intent_level = 3 AND IFNULL(last_analyzed_at, updated_at) >= #{yesterdayStart} AND IFNULL(last_analyzed_at, updated_at) < #{todayStart} THEN 1 ELSE 0 END) AS yesterdayHigh,
        SUM(CASE WHEN intent_level = 2 AND IFNULL(last_analyzed_at, updated_at) >= #{yesterdayStart} AND IFNULL(last_analyzed_at, updated_at) < #{todayStart} THEN 1 ELSE 0 END) AS yesterdayMid,
        SUM(CASE WHEN intent_level = 1 AND IFNULL(last_analyzed_at, updated_at) >= #{yesterdayStart} AND IFNULL(last_analyzed_at, updated_at) < #{todayStart} THEN 1 ELSE 0 END) AS yesterdayLow,
        SUM(CASE WHEN intent_level = 3 AND IFNULL(last_analyzed_at, updated_at) >= #{sevenDaysStart} THEN 1 ELSE 0 END) AS sevenDaysHigh,
        SUM(CASE WHEN intent_level = 2 AND IFNULL(last_analyzed_at, updated_at) >= #{sevenDaysStart} THEN 1 ELSE 0 END) AS sevenDaysMid,
        SUM(CASE WHEN intent_level = 1 AND IFNULL(last_analyzed_at, updated_at) >= #{sevenDaysStart} THEN 1 ELSE 0 END) AS sevenDaysLow,
        SUM(CASE WHEN intent_level = 3 AND IFNULL(last_analyzed_at, updated_at) >= #{thirtyDaysStart} THEN 1 ELSE 0 END) AS thirtyDaysHigh,
        SUM(CASE WHEN intent_level = 2 AND IFNULL(last_analyzed_at, updated_at) >= #{thirtyDaysStart} THEN 1 ELSE 0 END) AS thirtyDaysMid,
        SUM(CASE WHEN intent_level = 1 AND IFNULL(last_analyzed_at, updated_at) >= #{thirtyDaysStart} THEN 1 ELSE 0 END) AS thirtyDaysLow
      FROM user_intent
      WHERE tenant_id = #{tenantId}
        AND owner_user_id = #{ownerUserId}
      """)
  IntentStatsAggregate aggregateStats(
      @Param("tenantId") Long tenantId,
      @Param("ownerUserId") Long ownerUserId,
      @Param("todayStart") LocalDateTime todayStart,
      @Param("yesterdayStart") LocalDateTime yesterdayStart,
      @Param("sevenDaysStart") LocalDateTime sevenDaysStart,
      @Param("thirtyDaysStart") LocalDateTime thirtyDaysStart);

  @Select("""
      SELECT COUNT(1)
      FROM user_intent
      WHERE tenant_id = #{tenantId}
        AND owner_user_id = #{ownerUserId}
      """)
  Long countCustomers(@Param("tenantId") Long tenantId, @Param("ownerUserId") Long ownerUserId);

  @Select("""
      SELECT
        ui.contact_key AS customerName,
        ui.intent_level AS intentLevel,
        ui.daily_summary AS dailySummary,
        (
          SELECT MAX(h.sent_at)
          FROM session_message_history h
          WHERE h.tenant_id = ui.tenant_id
            AND h.user_id = ui.owner_user_id
            AND h.scene_type = 'SINGLE'
            AND h.session_key = ui.contact_key
        ) AS lastChatTime
      FROM user_intent ui
      WHERE ui.tenant_id = #{tenantId}
        AND ui.owner_user_id = #{ownerUserId}
      ORDER BY lastChatTime DESC, ui.updated_at DESC
      LIMIT #{offset}, #{pageSize}
      """)
  List<CustomerItem> listCustomers(
      @Param("tenantId") Long tenantId,
      @Param("ownerUserId") Long ownerUserId,
      @Param("offset") long offset,
      @Param("pageSize") long pageSize);

  class IntentStatsAggregate {
    private Long todayHigh;
    private Long todayMid;
    private Long todayLow;
    private Long yesterdayHigh;
    private Long yesterdayMid;
    private Long yesterdayLow;
    private Long sevenDaysHigh;
    private Long sevenDaysMid;
    private Long sevenDaysLow;
    private Long thirtyDaysHigh;
    private Long thirtyDaysMid;
    private Long thirtyDaysLow;

    public Long getTodayHigh() {
      return todayHigh;
    }

    public void setTodayHigh(Long todayHigh) {
      this.todayHigh = todayHigh;
    }

    public Long getTodayMid() {
      return todayMid;
    }

    public void setTodayMid(Long todayMid) {
      this.todayMid = todayMid;
    }

    public Long getTodayLow() {
      return todayLow;
    }

    public void setTodayLow(Long todayLow) {
      this.todayLow = todayLow;
    }

    public Long getYesterdayHigh() {
      return yesterdayHigh;
    }

    public void setYesterdayHigh(Long yesterdayHigh) {
      this.yesterdayHigh = yesterdayHigh;
    }

    public Long getYesterdayMid() {
      return yesterdayMid;
    }

    public void setYesterdayMid(Long yesterdayMid) {
      this.yesterdayMid = yesterdayMid;
    }

    public Long getYesterdayLow() {
      return yesterdayLow;
    }

    public void setYesterdayLow(Long yesterdayLow) {
      this.yesterdayLow = yesterdayLow;
    }

    public Long getSevenDaysHigh() {
      return sevenDaysHigh;
    }

    public void setSevenDaysHigh(Long sevenDaysHigh) {
      this.sevenDaysHigh = sevenDaysHigh;
    }

    public Long getSevenDaysMid() {
      return sevenDaysMid;
    }

    public void setSevenDaysMid(Long sevenDaysMid) {
      this.sevenDaysMid = sevenDaysMid;
    }

    public Long getSevenDaysLow() {
      return sevenDaysLow;
    }

    public void setSevenDaysLow(Long sevenDaysLow) {
      this.sevenDaysLow = sevenDaysLow;
    }

    public Long getThirtyDaysHigh() {
      return thirtyDaysHigh;
    }

    public void setThirtyDaysHigh(Long thirtyDaysHigh) {
      this.thirtyDaysHigh = thirtyDaysHigh;
    }

    public Long getThirtyDaysMid() {
      return thirtyDaysMid;
    }

    public void setThirtyDaysMid(Long thirtyDaysMid) {
      this.thirtyDaysMid = thirtyDaysMid;
    }

    public Long getThirtyDaysLow() {
      return thirtyDaysLow;
    }

    public void setThirtyDaysLow(Long thirtyDaysLow) {
      this.thirtyDaysLow = thirtyDaysLow;
    }
  }

  class CustomerItem {
    private String customerName;
    private Integer intentLevel;
    private String dailySummary;
    private LocalDateTime lastChatTime;

    public String getCustomerName() {
      return customerName;
    }

    public void setCustomerName(String customerName) {
      this.customerName = customerName;
    }

    public Integer getIntentLevel() {
      return intentLevel;
    }

    public void setIntentLevel(Integer intentLevel) {
      this.intentLevel = intentLevel;
    }

    public String getDailySummary() {
      return dailySummary;
    }

    public void setDailySummary(String dailySummary) {
      this.dailySummary = dailySummary;
    }

    public LocalDateTime getLastChatTime() {
      return lastChatTime;
    }

    public void setLastChatTime(LocalDateTime lastChatTime) {
      this.lastChatTime = lastChatTime;
    }
  }
}
