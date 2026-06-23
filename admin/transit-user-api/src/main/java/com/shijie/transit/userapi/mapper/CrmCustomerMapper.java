package com.shijie.transit.userapi.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.shijie.transit.common.db.entity.CrmCustomerEntity;
import java.time.LocalDateTime;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * CRM 客户档案 Mapper。
 * 客户列表与画像聚合查询以 user_intent 为主表左联 crm_customer，
 * 保证即使尚未建档的意向客户也能出现在列表中。
 */
@Mapper
public interface CrmCustomerMapper extends BaseMapper<CrmCustomerEntity> {

  /**
   * 分页查询客户列表，左联 user_intent 取意向数据、左联会话历史取最后聊天时间。
   * 以 user_intent 为主表，未建档客户也能展示。
   */
  @Select("""
      <script>
      SELECT
        ui.contact_key AS contactKey,
        IFNULL(NULLIF(c.remark_name, ''), ui.contact_key) AS customerName,
        ui.intent_level AS intentLevel,
        ui.total_score AS totalScore,
        ui.daily_summary AS dailySummary,
        ui.demand_level AS demandLevel,
        ui.budget_level AS budgetLevel,
        ui.time_level AS timeLevel,
        ui.budget_desc AS budgetDesc,
        ui.time_desc AS timeDesc,
        ui.pain_points AS painPoints,
        ui.competitors AS competitors,
        ui.latest_event AS latestEvent,
        c.id AS customerId,
        c.remark_name AS remarkName,
        c.phone AS phone,
        c.source AS source,
        c.stage AS stage,
        c.starred AS starred,
        c.next_follow_up_at AS nextFollowUpAt,
        (
          SELECT MAX(h.sent_at)
          FROM session_message_history h
          WHERE h.tenant_id = ui.tenant_id
            AND h.user_id = ui.owner_user_id
            AND h.scene_type = 'SINGLE'
            AND h.session_key = ui.contact_key
        ) AS lastChatTime
      FROM user_intent ui
      LEFT JOIN crm_customer c
        ON c.tenant_id = ui.tenant_id
       AND c.owner_user_id = ui.owner_user_id
       AND c.contact_key = ui.contact_key
      <where>
        ui.tenant_id = #{tenantId}
        AND ui.owner_user_id = #{ownerUserId}
        <if test="intentLevel != null">
          AND ui.intent_level = #{intentLevel}
        </if>
        <if test="stage != null and stage != ''">
          AND c.stage = #{stage}
        </if>
        <if test="starred != null and starred == true">
          AND c.starred = 1
        </if>
        <if test="keyword != null and keyword != ''">
          AND (ui.contact_key LIKE CONCAT('%', #{keyword}, '%')
               OR c.remark_name LIKE CONCAT('%', #{keyword}, '%'))
        </if>
      </where>
      ORDER BY c.starred DESC, lastChatTime DESC, ui.updated_at DESC
      LIMIT #{offset}, #{pageSize}
      </script>
      """)
  List<CustomerListItem> listCustomers(
      @Param("tenantId") Long tenantId,
      @Param("ownerUserId") Long ownerUserId,
      @Param("intentLevel") Integer intentLevel,
      @Param("stage") String stage,
      @Param("starred") Boolean starred,
      @Param("keyword") String keyword,
      @Param("offset") long offset,
      @Param("pageSize") long pageSize);

  /**
   * 统计符合条件的客户总数。
   */
  @Select("""
      <script>
      SELECT COUNT(1)
      FROM user_intent ui
      LEFT JOIN crm_customer c
        ON c.tenant_id = ui.tenant_id
       AND c.owner_user_id = ui.owner_user_id
       AND c.contact_key = ui.contact_key
      <where>
        ui.tenant_id = #{tenantId}
        AND ui.owner_user_id = #{ownerUserId}
        <if test="intentLevel != null">
          AND ui.intent_level = #{intentLevel}
        </if>
        <if test="stage != null and stage != ''">
          AND c.stage = #{stage}
        </if>
        <if test="starred != null and starred == true">
          AND c.starred = 1
        </if>
        <if test="keyword != null and keyword != ''">
          AND (ui.contact_key LIKE CONCAT('%', #{keyword}, '%')
               OR c.remark_name LIKE CONCAT('%', #{keyword}, '%'))
        </if>
      </where>
      </script>
      """)
  Long countCustomers(
      @Param("tenantId") Long tenantId,
      @Param("ownerUserId") Long ownerUserId,
      @Param("intentLevel") Integer intentLevel,
      @Param("stage") String stage,
      @Param("starred") Boolean starred,
      @Param("keyword") String keyword);

  /**
   * 按商机阶段统计客户数(漏斗)。仅统计已建档客户。
   */
  @Select("""
      SELECT IFNULL(stage, 'LEAD') AS stage, COUNT(1) AS cnt
      FROM crm_customer
      WHERE tenant_id = #{tenantId}
        AND owner_user_id = #{ownerUserId}
      GROUP BY stage
      """)
  List<StageCount> countByStage(
      @Param("tenantId") Long tenantId,
      @Param("ownerUserId") Long ownerUserId);

  /**
   * 统计高意向但尚未建 CRM 档案的微信联系人数量。
   */
  @Select("""
      SELECT COUNT(1)
      FROM user_intent ui
      WHERE ui.tenant_id = #{tenantId}
        AND ui.owner_user_id = #{ownerUserId}
        AND ui.intent_level = 3
        AND NOT EXISTS (
          SELECT 1
          FROM crm_customer c
          WHERE c.tenant_id = ui.tenant_id
            AND c.owner_user_id = ui.owner_user_id
            AND c.contact_key = ui.contact_key
        )
      """)
  Long countHighIntentWithoutCustomer(
      @Param("tenantId") Long tenantId,
      @Param("ownerUserId") Long ownerUserId);

  /** 待跟进：已建档且 next_follow_up_at 不为空且早于截止时间的客户。 */
  @Select("""
      SELECT c.contact_key AS contactKey,
             IFNULL(NULLIF(c.remark_name, ''), c.contact_key) AS customerName,
             c.next_follow_up_at AS nextFollowUpAt,
             ui.intent_level AS intentLevel
      FROM crm_customer c
      LEFT JOIN user_intent ui
        ON ui.tenant_id = c.tenant_id
       AND ui.owner_user_id = c.owner_user_id
       AND ui.contact_key = c.contact_key
      WHERE c.tenant_id = #{tenantId}
        AND c.owner_user_id = #{ownerUserId}
        AND c.next_follow_up_at IS NOT NULL
        AND c.next_follow_up_at <= #{deadline}
      ORDER BY c.next_follow_up_at ASC
      LIMIT #{limit}
      """)
  List<PendingFollowUpItem> listPendingFollowUps(
      @Param("tenantId") Long tenantId,
      @Param("ownerUserId") Long ownerUserId,
      @Param("deadline") LocalDateTime deadline,
      @Param("limit") int limit);

  /** 客户列表项(聚合 user_intent + crm_customer)。 */
  class CustomerListItem {
    private String contactKey;
    private String customerName;
    private Integer intentLevel;
    private Integer totalScore;
    private String dailySummary;
    private String demandLevel;
    private String budgetLevel;
    private String timeLevel;
    private String budgetDesc;
    private String timeDesc;
    private String painPoints;
    private String competitors;
    private String latestEvent;
    private Long customerId;
    private String remarkName;
    private String phone;
    private String source;
    private String stage;
    private Integer starred;
    private LocalDateTime nextFollowUpAt;
    private LocalDateTime lastChatTime;

    public String getContactKey() { return contactKey; }
    public void setContactKey(String contactKey) { this.contactKey = contactKey; }
    public String getCustomerName() { return customerName; }
    public void setCustomerName(String customerName) { this.customerName = customerName; }
    public Integer getIntentLevel() { return intentLevel; }
    public void setIntentLevel(Integer intentLevel) { this.intentLevel = intentLevel; }
    public Integer getTotalScore() { return totalScore; }
    public void setTotalScore(Integer totalScore) { this.totalScore = totalScore; }
    public String getDailySummary() { return dailySummary; }
    public void setDailySummary(String dailySummary) { this.dailySummary = dailySummary; }
    public String getDemandLevel() { return demandLevel; }
    public void setDemandLevel(String demandLevel) { this.demandLevel = demandLevel; }
    public String getBudgetLevel() { return budgetLevel; }
    public void setBudgetLevel(String budgetLevel) { this.budgetLevel = budgetLevel; }
    public String getTimeLevel() { return timeLevel; }
    public void setTimeLevel(String timeLevel) { this.timeLevel = timeLevel; }
    public String getBudgetDesc() { return budgetDesc; }
    public void setBudgetDesc(String budgetDesc) { this.budgetDesc = budgetDesc; }
    public String getTimeDesc() { return timeDesc; }
    public void setTimeDesc(String timeDesc) { this.timeDesc = timeDesc; }
    public String getPainPoints() { return painPoints; }
    public void setPainPoints(String painPoints) { this.painPoints = painPoints; }
    public String getCompetitors() { return competitors; }
    public void setCompetitors(String competitors) { this.competitors = competitors; }
    public String getLatestEvent() { return latestEvent; }
    public void setLatestEvent(String latestEvent) { this.latestEvent = latestEvent; }
    public Long getCustomerId() { return customerId; }
    public void setCustomerId(Long customerId) { this.customerId = customerId; }
    public String getRemarkName() { return remarkName; }
    public void setRemarkName(String remarkName) { this.remarkName = remarkName; }
    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }
    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }
    public String getStage() { return stage; }
    public void setStage(String stage) { this.stage = stage; }
    public Integer getStarred() { return starred; }
    public void setStarred(Integer starred) { this.starred = starred; }
    public LocalDateTime getNextFollowUpAt() { return nextFollowUpAt; }
    public void setNextFollowUpAt(LocalDateTime nextFollowUpAt) { this.nextFollowUpAt = nextFollowUpAt; }
    public LocalDateTime getLastChatTime() { return lastChatTime; }
    public void setLastChatTime(LocalDateTime lastChatTime) { this.lastChatTime = lastChatTime; }
  }

  class StageCount {
    private String stage;
    private Integer cnt;

    public String getStage() { return stage; }
    public void setStage(String stage) { this.stage = stage; }
    public Integer getCnt() { return cnt; }
    public void setCnt(Integer cnt) { this.cnt = cnt; }
  }

  class PendingFollowUpItem {
    private String contactKey;
    private String customerName;
    private LocalDateTime nextFollowUpAt;
    private Integer intentLevel;

    public String getContactKey() { return contactKey; }
    public void setContactKey(String contactKey) { this.contactKey = contactKey; }
    public String getCustomerName() { return customerName; }
    public void setCustomerName(String customerName) { this.customerName = customerName; }
    public LocalDateTime getNextFollowUpAt() { return nextFollowUpAt; }
    public void setNextFollowUpAt(LocalDateTime nextFollowUpAt) { this.nextFollowUpAt = nextFollowUpAt; }
    public Integer getIntentLevel() { return intentLevel; }
    public void setIntentLevel(Integer intentLevel) { this.intentLevel = intentLevel; }
  }
}
