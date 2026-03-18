package com.shijie.transit.userapi.dify;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "dify")
public class DifyProperties {
  private String baseUrl;
  private String chatApiKey;
  private String datasetApiKey;
  private String commentWorkflowApiKey;
  private String intentWorkflowApiKey;
  private Double retrieveScoreThreshold = 0.6d;

  public String getBaseUrl() {
    return baseUrl;
  }

  public void setBaseUrl(String baseUrl) {
    this.baseUrl = baseUrl;
  }

  public String getChatApiKey() {
    return chatApiKey;
  }

  public void setChatApiKey(String chatApiKey) {
    this.chatApiKey = chatApiKey;
  }

  public String getDatasetApiKey() {
    return datasetApiKey;
  }

  public void setDatasetApiKey(String datasetApiKey) {
    this.datasetApiKey = datasetApiKey;
  }

  public String getCommentWorkflowApiKey() {
    return commentWorkflowApiKey;
  }

  public void setCommentWorkflowApiKey(String commentWorkflowApiKey) {
    this.commentWorkflowApiKey = commentWorkflowApiKey;
  }

  public String getIntentWorkflowApiKey() {
    return intentWorkflowApiKey;
  }

  public void setIntentWorkflowApiKey(String intentWorkflowApiKey) {
    this.intentWorkflowApiKey = intentWorkflowApiKey;
  }

  public Double getRetrieveScoreThreshold() {
    return retrieveScoreThreshold;
  }

  public void setRetrieveScoreThreshold(Double retrieveScoreThreshold) {
    this.retrieveScoreThreshold = retrieveScoreThreshold;
  }
}
