package com.shijie.transit.userapi.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.shijie.transit.common.db.entity.KnowledgeBaseCleaningTaskEntity;
import com.shijie.transit.common.db.entity.KnowledgeBaseEntity;
import com.shijie.transit.common.db.entity.KnowledgeBaseFileEntity;
import com.shijie.transit.common.tenant.TenantContext;
import com.shijie.transit.userapi.dify.DifyClient;
import com.shijie.transit.userapi.mapper.KnowledgeBaseCleaningTaskMapper;
import com.shijie.transit.userapi.mapper.KnowledgeBaseFileMapper;
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
import org.springframework.web.multipart.MultipartFile;

@Service
public class KnowledgeBaseCleaningService {
  private static final Logger log = LoggerFactory.getLogger(KnowledgeBaseCleaningService.class);
  private static final String STATUS_PENDING = "PENDING";
  private static final String STATUS_PARSING = "PARSING";
  private static final String STATUS_EXTRACTING = "EXTRACTING";
  private static final String STATUS_REVIEWING = "REVIEWING";
  private static final String STATUS_INDEXING = "INDEXING";
  private static final String STATUS_COMPLETED = "COMPLETED";
  private static final String STATUS_FAILED = "FAILED";
  private static final int MAX_BATCH_FILE_COUNT = 10;

  private final KnowledgeBaseService knowledgeBaseService;
  private final KnowledgeBaseCleaningTaskMapper taskMapper;
  private final KnowledgeBaseFileMapper fileMapper;
  private final KnowledgeBaseDocumentParser documentParser;
  private final KnowledgeBaseQaExtractionService qaExtractionService;
  private final KnowledgeBaseQaMarkdownBuilder markdownBuilder;
  private final DifyClient difyClient;
  private final ObjectMapper objectMapper;
  private final Clock clock;

  public KnowledgeBaseCleaningService(
      KnowledgeBaseService knowledgeBaseService,
      KnowledgeBaseCleaningTaskMapper taskMapper,
      KnowledgeBaseFileMapper fileMapper,
      KnowledgeBaseDocumentParser documentParser,
      KnowledgeBaseQaExtractionService qaExtractionService,
      KnowledgeBaseQaMarkdownBuilder markdownBuilder,
      DifyClient difyClient,
      ObjectMapper objectMapper,
      Clock clock) {
    this.knowledgeBaseService = knowledgeBaseService;
    this.taskMapper = taskMapper;
    this.fileMapper = fileMapper;
    this.documentParser = documentParser;
    this.qaExtractionService = qaExtractionService;
    this.markdownBuilder = markdownBuilder;
    this.difyClient = difyClient;
    this.objectMapper = objectMapper;
    this.clock = clock;
  }

  @Transactional
  public KnowledgeBaseCleaningTaskEntity createTask(Long userId, Long knowledgeBaseId, MultipartFile file) {
    KnowledgeBaseEntity knowledgeBase = knowledgeBaseService.getById(userId, knowledgeBaseId);
    if (!"ENABLED".equalsIgnoreCase(knowledgeBase.getStatus())) {
      throw new IllegalArgumentException("知识库已停用，不能上传清洗文件");
    }
    documentParser.validateFile(file);
    KnowledgeBaseCleaningTaskEntity task = new KnowledgeBaseCleaningTaskEntity();
    task.setTenantId(TenantContext.getTenantId());
    task.setUserId(userId);
    task.setKbId(knowledgeBase.getId());
    task.setDifyDatasetId(knowledgeBase.getDifyDatasetId());
    task.setOriginalFileName(StringUtils.hasText(file.getOriginalFilename()) ? file.getOriginalFilename() : "未命名文件");
    task.setFileSize(file.getSize());
    task.setExtension(documentParser.resolveExtension(file.getOriginalFilename()));
    task.setTaskStatus(STATUS_PENDING);
    task.setProgressMessage("已创建清洗任务，等待解析文件");
    task.setRawTextSummary("");
    task.setQaItemsJson("[]");
    task.setFailedReason("");
    task.setDifyDocumentId("");
    taskMapper.insert(task);

    Long tenantId = TenantContext.getTenantId();
    Long taskId = task.getId();
    try {
      byte[] bytes = file.getBytes();
      String originalFileName = file.getOriginalFilename();
      String contentType = file.getContentType();
      CompletableFuture.runAsync(() -> runCleaningAsync(tenantId, userId, taskId, originalFileName, contentType, bytes));
    } catch (Exception ex) {
      markFailed(task, "读取上传文件失败：" + safeMessage(ex));
    }
    return task;
  }

  public List<CleaningBatchItemResult> createBatchTasks(Long userId, Long knowledgeBaseId, List<? extends MultipartFile> files) {
    if (files == null || files.isEmpty()) {
      throw new IllegalArgumentException("请至少选择一个知识文件");
    }
    if (files.size() > MAX_BATCH_FILE_COUNT) {
      throw new IllegalArgumentException("一次最多上传 10 个知识文件");
    }
    log.info("开始批量创建知识库清洗任务 userId={} knowledgeBaseId={} fileCount={}", userId, knowledgeBaseId, files.size());
    List<CleaningBatchItemResult> results = new ArrayList<>();
    for (MultipartFile file : files) {
      String fileName = resolveOriginalFileName(file);
      long fileSize = file == null ? 0L : file.getSize();
      try {
        KnowledgeBaseCleaningTaskEntity task = createTask(userId, knowledgeBaseId, file);
        CleaningTaskResult taskResult = toResult(task);
        results.add(new CleaningBatchItemResult(fileName, String.valueOf(fileSize), true, taskResult, ""));
        log.info("知识库批量清洗文件任务创建成功 userId={} knowledgeBaseId={} fileName={} taskId={}",
            userId, knowledgeBaseId, fileName, task.getId());
      } catch (Exception ex) {
        String errorMessage = safeMessage(ex);
        results.add(new CleaningBatchItemResult(fileName, String.valueOf(fileSize), false, null, errorMessage));
        log.warn("知识库批量清洗文件校验或创建失败 userId={} knowledgeBaseId={} fileName={} error={}",
            userId, knowledgeBaseId, fileName, errorMessage);
      }
    }
    log.info("知识库批量创建清洗任务完成 userId={} knowledgeBaseId={} successCount={} failureCount={}",
        userId,
        knowledgeBaseId,
        results.stream().filter(CleaningBatchItemResult::success).count(),
        results.stream().filter(item -> !item.success()).count());
    return results;
  }

  public KnowledgeBaseCleaningTaskEntity getTask(Long userId, Long knowledgeBaseId, Long taskId) {
    KnowledgeBaseCleaningTaskEntity task = taskMapper.selectById(taskId);
    if (task == null || !userId.equals(task.getUserId()) || !knowledgeBaseId.equals(task.getKbId())) {
      throw new IllegalArgumentException("清洗任务不存在");
    }
    return task;
  }

  @Transactional
  public KnowledgeBaseCleaningTaskEntity updateItems(Long userId, Long knowledgeBaseId, Long taskId, List<KnowledgeBaseQaExtractionService.CleaningQaItem> items) throws Exception {
    KnowledgeBaseCleaningTaskEntity task = getTask(userId, knowledgeBaseId, taskId);
    ensureReviewable(task);
    String itemsJson = objectMapper.writeValueAsString(normalizeItems(items));
    task.setQaItemsJson(itemsJson);
    task.setTaskStatus(STATUS_REVIEWING);
    task.setProgressMessage("已保存人工调整结果");
    task.setFailedReason("");
    taskMapper.updateById(task);
    return task;
  }

  @Transactional
  public KnowledgeBaseCleaningTaskEntity confirm(Long userId, Long knowledgeBaseId, Long taskId, List<KnowledgeBaseQaExtractionService.CleaningQaItem> items) throws Exception {
    KnowledgeBaseCleaningTaskEntity task = getTask(userId, knowledgeBaseId, taskId);
    ensureReviewable(task);
    List<KnowledgeBaseQaExtractionService.CleaningQaItem> finalItems = items == null || items.isEmpty()
        ? readItems(task)
        : normalizeItems(items);
    String markdown = markdownBuilder.buildMarkdown(finalItems);
    task.setTaskStatus(STATUS_INDEXING);
    task.setProgressMessage("正在写入 Dify 知识库");
    task.setQaItemsJson(objectMapper.writeValueAsString(finalItems));
    taskMapper.updateById(task);

    DifyClient.DifyDocumentResult result = difyClient.createDocumentByText(
        task.getDifyDatasetId(),
        buildDocumentName(task),
        markdown,
        "high_quality",
        "automatic");
    task.setTaskStatus(STATUS_COMPLETED);
    task.setProgressMessage("已完成清洗并保存至知识库");
    task.setDifyDocumentId(result.documentId() == null ? "" : result.documentId());
    task.setConfirmedAt(LocalDateTime.now(clock));
    task.setFailedReason("");
    taskMapper.updateById(task);
    insertKnowledgeBaseFile(task, markdown, result);
    return task;
  }

  public CleaningTaskResult toResult(KnowledgeBaseCleaningTaskEntity task) {
    return new CleaningTaskResult(
        String.valueOf(task.getId()),
        task.getTaskStatus(),
        task.getProgressMessage(),
        task.getOriginalFileName(),
        String.valueOf(task.getFileSize() == null ? 0 : task.getFileSize()),
        task.getExtension(),
        task.getRawTextSummary(),
        readItemsQuietly(task),
        task.getFailedReason(),
        task.getDifyDocumentId());
  }

  private void runCleaningAsync(Long tenantId, Long userId, Long taskId, String originalFileName, String contentType, byte[] bytes) {
    TenantContext.setTenantId(tenantId);
    try {
      KnowledgeBaseCleaningTaskEntity task = taskMapper.selectById(taskId);
      if (task == null || !userId.equals(task.getUserId())) {
        return;
      }
      updateStatus(task, STATUS_PARSING, "正在解析并清洗文件内容", "");
      MultipartFileSnapshot snapshot = new MultipartFileSnapshot(originalFileName, contentType, bytes);
      String cleanedText = documentParser.parseAndClean(snapshot);
      if (!StringUtils.hasText(cleanedText)) {
        throw new IllegalArgumentException("文件解析后没有可清洗文本");
      }
      task.setRawTextSummary(abbreviate(cleanedText, 500));
      updateStatus(task, STATUS_EXTRACTING, "正在调用 AI 提取问答", "");
      List<KnowledgeBaseQaExtractionService.CleaningQaItem> items = qaExtractionService.extractQaItems(cleanedText);
      task.setQaItemsJson(objectMapper.writeValueAsString(items));
      updateStatus(task, STATUS_REVIEWING, "AI 清洗完成，请人工确认后入库", "");
      log.info("知识库清洗任务完成 taskId={} userId={} itemCount={}", taskId, userId, items.size());
    } catch (Exception ex) {
      log.error("知识库清洗任务失败 taskId={} userId={} error={}", taskId, userId, ex.getMessage(), ex);
      KnowledgeBaseCleaningTaskEntity task = taskMapper.selectById(taskId);
      if (task != null) {
        markFailed(task, safeMessage(ex));
      }
    } finally {
      TenantContext.clear();
    }
  }

  private void updateStatus(KnowledgeBaseCleaningTaskEntity task, String status, String message, String failedReason) {
    task.setTaskStatus(status);
    task.setProgressMessage(message);
    task.setFailedReason(failedReason);
    taskMapper.updateById(task);
  }

  private void markFailed(KnowledgeBaseCleaningTaskEntity task, String reason) {
    task.setTaskStatus(STATUS_FAILED);
    task.setProgressMessage("清洗失败");
    task.setFailedReason(abbreviate(reason, 2000));
    taskMapper.updateById(task);
  }

  private void ensureReviewable(KnowledgeBaseCleaningTaskEntity task) {
    if (!STATUS_REVIEWING.equals(task.getTaskStatus()) && !STATUS_FAILED.equals(task.getTaskStatus())) {
      throw new IllegalArgumentException("清洗任务尚未进入可确认状态");
    }
  }

  private List<KnowledgeBaseQaExtractionService.CleaningQaItem> normalizeItems(List<KnowledgeBaseQaExtractionService.CleaningQaItem> items) {
    if (items == null || items.isEmpty()) {
      throw new IllegalArgumentException("请至少保留一条问答后再入库");
    }
    return items.stream()
        .filter(item -> item != null && StringUtils.hasText(item.question()) && StringUtils.hasText(item.answer()))
        .map(item -> new KnowledgeBaseQaExtractionService.CleaningQaItem(
            item.question().trim(),
            item.answer().trim(),
            normalizeStatus(item.status()),
            item.warning() == null ? "" : item.warning().trim()))
        .toList();
  }

  private List<KnowledgeBaseQaExtractionService.CleaningQaItem> readItems(KnowledgeBaseCleaningTaskEntity task) throws Exception {
    if (!StringUtils.hasText(task.getQaItemsJson())) {
      return List.of();
    }
    return objectMapper.readValue(task.getQaItemsJson(), new TypeReference<>() {});
  }

  private List<KnowledgeBaseQaExtractionService.CleaningQaItem> readItemsQuietly(KnowledgeBaseCleaningTaskEntity task) {
    try {
      return readItems(task);
    } catch (Exception ex) {
      return List.of();
    }
  }

  private String normalizeStatus(String status) {
    if ("NORMAL".equals(status) || "WARNING".equals(status) || "INCOMPLETE".equals(status)) {
      return status;
    }
    return "WARNING";
  }

  private String buildDocumentName(KnowledgeBaseCleaningTaskEntity task) {
    String name = task.getOriginalFileName();
    return StringUtils.hasText(name) ? "清洗-" + name : "清洗知识库文档-" + task.getId();
  }

  private void insertKnowledgeBaseFile(KnowledgeBaseCleaningTaskEntity task, String markdown, DifyClient.DifyDocumentResult result) {
    if (!StringUtils.hasText(result.documentId())) {
      return;
    }
    KnowledgeBaseFileEntity entity = new KnowledgeBaseFileEntity();
    entity.setTenantId(task.getTenantId());
    entity.setKbId(task.getKbId());
    entity.setName(buildDocumentName(task));
    entity.setFileKey(result.documentId());
    entity.setFileSize((long) markdown.getBytes(java.nio.charset.StandardCharsets.UTF_8).length);
    entity.setExtension("md");
    entity.setDifyDocumentId(result.documentId());
    entity.setIndexingStatus(StringUtils.hasText(result.indexingStatus()) ? result.indexingStatus() : "waiting");
    entity.setErrorMsg(StringUtils.hasText(result.error()) ? result.error() : "");
    entity.setWordCount(result.wordCount() == null ? 0 : result.wordCount());
    fileMapper.insert(entity);
  }

  private String abbreviate(String text, int maxLength) {
    if (!StringUtils.hasText(text)) {
      return "";
    }
    String value = text.trim();
    return value.length() <= maxLength ? value : value.substring(0, maxLength);
  }

  private String safeMessage(Exception ex) {
    if (ex == null || !StringUtils.hasText(ex.getMessage())) {
      return "未知错误";
    }
    return ex.getMessage();
  }

  private String resolveOriginalFileName(MultipartFile file) {
    if (file == null || !StringUtils.hasText(file.getOriginalFilename())) {
      return "未命名文件";
    }
    return file.getOriginalFilename();
  }

  public List<KnowledgeBaseCleaningTaskEntity> listRecentTasks(Long userId, Long knowledgeBaseId) {
    return taskMapper.selectList(new LambdaQueryWrapper<KnowledgeBaseCleaningTaskEntity>()
        .eq(KnowledgeBaseCleaningTaskEntity::getUserId, userId)
        .eq(KnowledgeBaseCleaningTaskEntity::getKbId, knowledgeBaseId)
        .orderByDesc(KnowledgeBaseCleaningTaskEntity::getCreatedAt)
        .last("limit 20"));
  }

  public record CleaningTaskResult(
      String taskId,
      String taskStatus,
      String progressMessage,
      String originalFileName,
      String fileSize,
      String extension,
      String rawTextSummary,
      List<KnowledgeBaseQaExtractionService.CleaningQaItem> items,
      String failedReason,
      String difyDocumentId) {
  }

  public record CleaningBatchItemResult(
      String fileName,
      String fileSize,
      boolean success,
      CleaningTaskResult task,
      String errorMessage) {
  }
}
