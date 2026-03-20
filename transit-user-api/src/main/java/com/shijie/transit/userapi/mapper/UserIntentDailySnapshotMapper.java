package com.shijie.transit.userapi.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.shijie.transit.common.db.entity.UserIntentDailySnapshotEntity;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface UserIntentDailySnapshotMapper extends BaseMapper<UserIntentDailySnapshotEntity> {
  @Select("""
      <script>
      SELECT COUNT(1)
      FROM user_intent_daily_snapshot
      WHERE tenant_id = #{tenantId}
        AND owner_user_id = #{ownerUserId}
        AND stats_date = #{queryDate}
      <if test="customerName != null and customerName != ''">
        AND contact_key LIKE CONCAT('%', #{customerName}, '%')
      </if>
      <if test="intentLevel != null">
        AND intent_level = #{intentLevel}
      </if>
      </script>
      """)
  Long countCustomers(
      @Param("tenantId") Long tenantId,
      @Param("ownerUserId") Long ownerUserId,
      @Param("queryDate") LocalDate queryDate,
      @Param("customerName") String customerName,
      @Param("intentLevel") Integer intentLevel);

  @Select("""
      <script>
      SELECT
        contact_key AS customerName,
        intent_level AS intentLevel,
        daily_summary AS dailySummary,
        last_chat_time AS lastChatTime
      FROM user_intent_daily_snapshot
      WHERE tenant_id = #{tenantId}
        AND owner_user_id = #{ownerUserId}
        AND stats_date = #{queryDate}
      <if test="customerName != null and customerName != ''">
        AND contact_key LIKE CONCAT('%', #{customerName}, '%')
      </if>
      <if test="intentLevel != null">
        AND intent_level = #{intentLevel}
      </if>
      ORDER BY last_chat_time DESC, updated_at DESC
      LIMIT #{offset}, #{pageSize}
      </script>
      """)
  List<CustomerItem> listCustomers(
      @Param("tenantId") Long tenantId,
      @Param("ownerUserId") Long ownerUserId,
      @Param("queryDate") LocalDate queryDate,
      @Param("customerName") String customerName,
      @Param("intentLevel") Integer intentLevel,
      @Param("offset") long offset,
      @Param("pageSize") long pageSize);

  @Select("""
      SELECT MAX(sent_at)
      FROM session_message_history
      WHERE tenant_id = #{tenantId}
        AND user_id = #{ownerUserId}
        AND scene_type = 'SINGLE'
        AND session_key = #{contactKey}
      """)
  LocalDateTime findLatestChatTime(
      @Param("tenantId") Long tenantId,
      @Param("ownerUserId") Long ownerUserId,
      @Param("contactKey") String contactKey);

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
