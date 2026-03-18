package com.shijie.transit.userapi.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.shijie.transit.common.db.entity.KnowledgeBaseEntity;
import com.shijie.transit.common.db.entity.ManualKbSyncRecordEntity;
import com.shijie.transit.common.tenant.TenantContext;
import com.shijie.transit.userapi.dify.DifyClient;
import com.shijie.transit.userapi.mapper.ManualKbSyncRecordMapper;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class ManualKbSyncService {
  private static final Logger log = LoggerFactory.getLogger(ManualKbSyncService.class);
  private static final String STATUS_PENDING = "PENDING";
  private static final String STATUS_SYNCING = "SYNCING";
  private static final String STATUS_SUCCESS = "SUCCESS";
  private static final String STATUS_FAILED = "FAILED";

  private final KnowledgeBaseService knowledgeBaseService;
  private final ManualKbSyncRecordMapper manualKbSyncRecordMapper;
  private final DifyClient difyClient;
  private final ObjectMapper objectMapper;
  private final Clock clock;

  public ManualKbSyncService(
      KnowledgeBaseService knowledgeBaseService,
      ManualKbSyncRecordMapper manualKbSyncRecordMapper,
      DifyClient difyClient,
      ObjectMapper objectMapper,
      Clock clock) {
    this.knowledgeBaseService = knowledgeBaseService;
    this.manualKbSyncRecordMapper = manualKbSyncRecordMapper;
    this.difyClient = difyClient;
    this.objectMapper = objectMapper;
    this.clock = clock;
  }

  @Transactional
  public ManualKbSyncRecordEntity createPendingRecord(
      Long userId,
      Long knowledgeBaseId,
      String contactKey,
      String customerMessage,
      String aiReplyMessage) {
    if (knowledgeBaseId == null) {
      throw new IllegalArgumentException("knowledge base id required");
    }
    if (!StringUtils.hasText(contactKey) || !StringUtils.hasText(customerMessage) || !StringUtils.hasText(aiReplyMessage)) {
      throw new IllegalArgumentException("contact key and messages required");
    }
    KnowledgeBaseEntity knowledgeBase = knowledgeBaseService.getById(userId, knowledgeBaseId);
    if (!"ENABLED".equalsIgnoreCase(knowledgeBase.getStatus())) {
      throw new IllegalArgumentException("knowledge base is disabled");
    }
    LocalDateTime now = LocalDateTime.now(clock);
    int year = now.getYear();
    String documentName = buildDocumentName(year);
    ManualKbSyncRecordEntity record = new ManualKbSyncRecordEntity();
    record.setTenantId(TenantContext.getTenantId());
    record.setUserId(userId);
    record.setKbId(knowledgeBase.getId());
    record.setDifyDatasetId(knowledgeBase.getDifyDatasetId());
    record.setContactKey(contactKey.trim());
    record.setCustomerMessage(customerMessage.trim());
    record.setAiReplyMessage(aiReplyMessage.trim());
    record.setDocumentYear(year);
    record.setDocumentName(documentName);
    record.setDifyDocumentId("");
    record.setSyncStatus(STATUS_PENDING);
    record.setSyncResult("");
    record.setSyncFailedReason("");
    manualKbSyncRecordMapper.insert(record);
    log.info("人工入库记录已创建 recordId={} userId={} kbId={} status={}", record.getId(), userId, knowledgeBaseId, STATUS_PENDING);

    Long tenantId = TenantContext.getTenantId();
    Long recordId = record.getId();
    CompletableFuture.runAsync(() -> syncRecordAsync(tenantId, userId, recordId));
    return record;
  }

  private void syncRecordAsync(Long tenantId, Long userId, Long recordId) {
    TenantContext.setTenantId(tenantId);
    try {
      ManualKbSyncRecordEntity record = manualKbSyncRecordMapper.selectById(recordId);
      if (record == null || !userId.equals(record.getUserId())) {
        return;
      }
      updateStatus(record, STATUS_SYNCING, "", "");
      String datasetId = record.getDifyDatasetId();
      if (!StringUtils.hasText(datasetId)) {
        throw new IllegalStateException("dify dataset id missing");
      }
      String documentName = record.getDocumentName();
      String documentId = findDocumentIdByName(datasetId, documentName);
      String appendText = buildAppendText(record);
      DifyClient.DifyDocumentResult result;
      if (!StringUtils.hasText(documentId)) {
        log.info("未找到年度文档，开始创建 documentName={} datasetId={}", documentName, datasetId);
        result = difyClient.createDocumentByText(datasetId, documentName, appendText, "high_quality", "automatic");
        documentId = result.documentId();
      } else {
        log.info("找到年度文档，开始追加更新 documentId={} datasetId={}", documentId, datasetId);
        String existingContent = readDocumentContent(datasetId, documentId);
        String mergedText = mergeContent(existingContent, appendText);
        result = difyClient.updateDocumentByText(datasetId, documentId, documentName, mergedText, "high_quality", "automatic");
      }
      String resultText = "indexingStatus=" + nullSafe(result.indexingStatus()) + ", wordCount=" + result.wordCount();
      record.setDifyDocumentId(nullSafe(documentId));
      record.setSyncStatus(STATUS_SUCCESS);
      record.setSyncResult(resultText);
      record.setSyncFailedReason("");
      record.setSyncedAt(LocalDateTime.now(clock));
      manualKbSyncRecordMapper.updateById(record);
      log.info("人工入库同步成功 recordId={} documentId={} {}", recordId, documentId, resultText);
    } catch (Exception ex) {
      log.error("人工入库同步失败 recordId={} error={}", recordId, ex.getMessage(), ex);
      ManualKbSyncRecordEntity record = manualKbSyncRecordMapper.selectById(recordId);
      if (record != null) {
        record.setSyncStatus(STATUS_FAILED);
        record.setSyncFailedReason(trimText(ex.getMessage(), 2000));
        record.setSyncResult("");
        manualKbSyncRecordMapper.updateById(record);
      }
    } finally {
      TenantContext.clear();
    }
  }

  private void updateStatus(ManualKbSyncRecordEntity record, String status, String result, String failedReason) {
    record.setSyncStatus(status);
    record.setSyncResult(result);
    record.setSyncFailedReason(failedReason);
    manualKbSyncRecordMapper.updateById(record);
  }

  private String findDocumentIdByName(String datasetId, String documentName) throws Exception {
    int page = 1;
    int limit = 100;
    while (true) {
      String json = difyClient.listDocuments(datasetId, page, limit);
      JsonNode root = objectMapper.readTree(json);
      JsonNode data = root.path("data");
      if (!data.isArray()) {
        data = root.path("documents");
      }
      if (!data.isArray() || data.isEmpty()) {
        return null;
      }
      for (JsonNode item : data) {
        String name = text(item.path("name"));
        if (documentName.equals(name)) {
          return text(item.path("id"));
        }
      }
      boolean hasMore = root.path("has_more").asBoolean(false);
      if (!hasMore) {
        return null;
      }
      page += 1;
    }
  }

  private String readDocumentContent(String datasetId, String documentId) {
    try {
      int page = 1;
      int limit = 100;
      List<String> lines = new ArrayList<>();
      while (true) {
        String json = difyClient.listDocumentSegments(datasetId, documentId, page, limit);
        JsonNode root = objectMapper.readTree(json);
        JsonNode data = root.path("data");
        if (!data.isArray() || data.isEmpty()) {
          break;
        }
        for (JsonNode item : data) {
          String content = text(item.path("content"));
          if (StringUtils.hasText(content)) {
            lines.add(content.trim());
          }
        }
        boolean hasMore = root.path("has_more").asBoolean(false);
        if (!hasMore) {
          break;
        }
        page += 1;
      }
      return String.join("\n\n", lines);
    } catch (Exception ex) {
      log.warn("读取文档分段失败，将按新增内容覆盖更新 documentId={} error={}", documentId, ex.getMessage());
      return "";
    }
  }

  private String mergeContent(String existingContent, String appendText) {
    if (!StringUtils.hasText(existingContent)) {
      return appendText;
    }
    return existingContent.trim() + "\n\n---\n\n" + appendText;
  }

  private String buildAppendText(ManualKbSyncRecordEntity record) {
    LocalDateTime now = LocalDateTime.now(clock);
    return "入库时间：" + now + "\n"
        + "联系人：" + record.getContactKey() + "\n"
        + "客户消息：" + record.getCustomerMessage() + "\n"
        + "AI回复：" + record.getAiReplyMessage();
  }

  private String buildDocumentName(int year) {
    return year + "年_人工采集话术";
  }

  private String nullSafe(String text) {
    return text == null ? "" : text;
  }

  private String trimText(String text, int maxLength) {
    if (!StringUtils.hasText(text)) {
      return "";
    }
    String value = text.trim();
    if (value.length() <= maxLength) {
      return value;
    }
    return value.substring(0, maxLength);
  }

  private String text(JsonNode node) {
    if (node == null || node.isMissingNode() || node.isNull()) {
      return "";
    }
    if (node.isTextual() || node.isNumber() || node.isBoolean()) {
      return node.asText();
    }
    return "";
  }

  public record ManualStoreResult(Long recordId, String syncStatus) {
  }

  public ManualStoreResult toResult(ManualKbSyncRecordEntity record) {
    return new ManualStoreResult(record.getId(), record.getSyncStatus());
  }
}
