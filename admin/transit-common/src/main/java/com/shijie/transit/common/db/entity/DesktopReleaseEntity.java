package com.shijie.transit.common.db.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import java.time.LocalDateTime;

/**
 * 桌面客户端发布记录。
 *
 * <p>该表是全局发布配置，不携带租户信息，避免不同租户获得不一致的软件版本。</p>
 */
@TableName("desktop_release")
public class DesktopReleaseEntity {
  @TableId
  @JsonSerialize(using = ToStringSerializer.class)
  private Long id;
  private String version;
  private String platform;
  private String architecture;
  private String channel;
  private String status;
  private Boolean mandatory;
  private String minimumSupportedVersion;
  private Integer rolloutPercentage;
  private String releaseNotes;
  private String feedUrl;
  private String installerUrl;
  private String sha512;
  private Long fileSize;
  private LocalDateTime publishedAt;
  @TableField(fill = FieldFill.INSERT)
  private LocalDateTime createdAt;
  @TableField(fill = FieldFill.INSERT_UPDATE)
  private LocalDateTime updatedAt;

  public Long getId() { return id; }
  public void setId(Long id) { this.id = id; }
  public String getVersion() { return version; }
  public void setVersion(String version) { this.version = version; }
  public String getPlatform() { return platform; }
  public void setPlatform(String platform) { this.platform = platform; }
  public String getArchitecture() { return architecture; }
  public void setArchitecture(String architecture) { this.architecture = architecture; }
  public String getChannel() { return channel; }
  public void setChannel(String channel) { this.channel = channel; }
  public String getStatus() { return status; }
  public void setStatus(String status) { this.status = status; }
  public Boolean getMandatory() { return mandatory; }
  public void setMandatory(Boolean mandatory) { this.mandatory = mandatory; }
  public String getMinimumSupportedVersion() { return minimumSupportedVersion; }
  public void setMinimumSupportedVersion(String minimumSupportedVersion) { this.minimumSupportedVersion = minimumSupportedVersion; }
  public Integer getRolloutPercentage() { return rolloutPercentage; }
  public void setRolloutPercentage(Integer rolloutPercentage) { this.rolloutPercentage = rolloutPercentage; }
  public String getReleaseNotes() { return releaseNotes; }
  public void setReleaseNotes(String releaseNotes) { this.releaseNotes = releaseNotes; }
  public String getFeedUrl() { return feedUrl; }
  public void setFeedUrl(String feedUrl) { this.feedUrl = feedUrl; }
  public String getInstallerUrl() { return installerUrl; }
  public void setInstallerUrl(String installerUrl) { this.installerUrl = installerUrl; }
  public String getSha512() { return sha512; }
  public void setSha512(String sha512) { this.sha512 = sha512; }
  public Long getFileSize() { return fileSize; }
  public void setFileSize(Long fileSize) { this.fileSize = fileSize; }
  public LocalDateTime getPublishedAt() { return publishedAt; }
  public void setPublishedAt(LocalDateTime publishedAt) { this.publishedAt = publishedAt; }
  public LocalDateTime getCreatedAt() { return createdAt; }
  public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
  public LocalDateTime getUpdatedAt() { return updatedAt; }
  public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
