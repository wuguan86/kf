package com.shijie.transit.common.db.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;

@TableName("knowledge_base_file")
public class KnowledgeBaseFileEntity extends BaseTenantEntity {
  @JsonSerialize(using = ToStringSerializer.class)
  private Long kbId;
  private String name;
  private String fileKey;
  @JsonSerialize(using = ToStringSerializer.class)
  private Long fileSize;
  private String extension;
  private String difyDocumentId;
  private String indexingStatus;
  private String errorMsg;
  private Integer wordCount;

  public Long getKbId() {
    return kbId;
  }

  public void setKbId(Long kbId) {
    this.kbId = kbId;
  }

  public String getName() {
    return name;
  }

  public void setName(String name) {
    this.name = name;
  }

  public String getFileKey() {
    return fileKey;
  }

  public void setFileKey(String fileKey) {
    this.fileKey = fileKey;
  }

  public Long getFileSize() {
    return fileSize;
  }

  public void setFileSize(Long fileSize) {
    this.fileSize = fileSize;
  }

  public String getExtension() {
    return extension;
  }

  public void setExtension(String extension) {
    this.extension = extension;
  }

  public String getDifyDocumentId() {
    return difyDocumentId;
  }

  public void setDifyDocumentId(String difyDocumentId) {
    this.difyDocumentId = difyDocumentId;
  }

  public String getIndexingStatus() {
    return indexingStatus;
  }

  public void setIndexingStatus(String indexingStatus) {
    this.indexingStatus = indexingStatus;
  }

  public String getErrorMsg() {
    return errorMsg;
  }

  public void setErrorMsg(String errorMsg) {
    this.errorMsg = errorMsg;
  }

  public Integer getWordCount() {
    return wordCount;
  }

  public void setWordCount(Integer wordCount) {
    this.wordCount = wordCount;
  }
}
