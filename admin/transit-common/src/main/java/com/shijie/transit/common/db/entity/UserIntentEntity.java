package com.shijie.transit.common.db.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import java.time.LocalDateTime;

@TableName("user_intent")
public class UserIntentEntity extends BaseTenantEntity {
  @JsonSerialize(using = ToStringSerializer.class)
  private Long ownerUserId;
  private String contactKey;
  private String demandLevel;
  private String budgetLevel;
  private String timeLevel;
  private String budgetDesc;
  private String timeDesc;
  private String painPoints;
  private String competitors;
  private String latestEvent;
  private Integer totalScore;
  private Integer intentLevel;
  private String aiReason;
  private String dailySummary;
  private String analysisSource;
  @JsonSerialize(using = ToStringSerializer.class)
  private Long lastAnalyzedMsgId;
  private LocalDateTime lastAnalyzedAt;

  public Long getOwnerUserId() {
    return ownerUserId;
  }

  public void setOwnerUserId(Long ownerUserId) {
    this.ownerUserId = ownerUserId;
  }

  public String getContactKey() {
    return contactKey;
  }

  public void setContactKey(String contactKey) {
    this.contactKey = contactKey;
  }

  public String getDemandLevel() {
    return demandLevel;
  }

  public void setDemandLevel(String demandLevel) {
    this.demandLevel = demandLevel;
  }

  public String getBudgetLevel() {
    return budgetLevel;
  }

  public void setBudgetLevel(String budgetLevel) {
    this.budgetLevel = budgetLevel;
  }

  public String getTimeLevel() {
    return timeLevel;
  }

  public void setTimeLevel(String timeLevel) {
    this.timeLevel = timeLevel;
  }

  public String getBudgetDesc() {
    return budgetDesc;
  }

  public void setBudgetDesc(String budgetDesc) {
    this.budgetDesc = budgetDesc;
  }

  public String getTimeDesc() {
    return timeDesc;
  }

  public void setTimeDesc(String timeDesc) {
    this.timeDesc = timeDesc;
  }

  public String getPainPoints() {
    return painPoints;
  }

  public void setPainPoints(String painPoints) {
    this.painPoints = painPoints;
  }

  public String getCompetitors() {
    return competitors;
  }

  public void setCompetitors(String competitors) {
    this.competitors = competitors;
  }

  public String getLatestEvent() {
    return latestEvent;
  }

  public void setLatestEvent(String latestEvent) {
    this.latestEvent = latestEvent;
  }

  public Integer getTotalScore() {
    return totalScore;
  }

  public void setTotalScore(Integer totalScore) {
    this.totalScore = totalScore;
  }

  public Integer getIntentLevel() {
    return intentLevel;
  }

  public void setIntentLevel(Integer intentLevel) {
    this.intentLevel = intentLevel;
  }

  public String getAiReason() {
    return aiReason;
  }

  public void setAiReason(String aiReason) {
    this.aiReason = aiReason;
  }

  public String getDailySummary() {
    return dailySummary;
  }

  public void setDailySummary(String dailySummary) {
    this.dailySummary = dailySummary;
  }

  public String getAnalysisSource() {
    return analysisSource;
  }

  public void setAnalysisSource(String analysisSource) {
    this.analysisSource = analysisSource;
  }

  public Long getLastAnalyzedMsgId() {
    return lastAnalyzedMsgId;
  }

  public void setLastAnalyzedMsgId(Long lastAnalyzedMsgId) {
    this.lastAnalyzedMsgId = lastAnalyzedMsgId;
  }

  public LocalDateTime getLastAnalyzedAt() {
    return lastAnalyzedAt;
  }

  public void setLastAnalyzedAt(LocalDateTime lastAnalyzedAt) {
    this.lastAnalyzedAt = lastAnalyzedAt;
  }
}
