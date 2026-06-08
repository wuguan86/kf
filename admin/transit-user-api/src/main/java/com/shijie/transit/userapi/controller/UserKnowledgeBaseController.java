package com.shijie.transit.userapi.controller;

import com.shijie.transit.common.db.entity.KnowledgeBaseEntity;
import com.shijie.transit.common.db.entity.KnowledgeBaseFileEntity;
import com.shijie.transit.common.db.entity.ManualKbSyncRecordEntity;
import com.shijie.transit.common.security.TransitPrincipal;
import com.shijie.transit.common.web.Result;
import com.shijie.transit.userapi.service.KnowledgeBaseCleaningService;
import com.shijie.transit.userapi.service.KnowledgeBaseQaExtractionService;
import com.shijie.transit.userapi.service.KnowledgeBaseService;
import com.shijie.transit.userapi.service.ManualKbSyncService;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;

@RestController
@RequestMapping("/api/user/knowledge-bases")
public class UserKnowledgeBaseController {
  private final KnowledgeBaseService knowledgeBaseService;
  private final ManualKbSyncService manualKbSyncService;
  private final KnowledgeBaseCleaningService cleaningService;

  public UserKnowledgeBaseController(
      KnowledgeBaseService knowledgeBaseService,
      ManualKbSyncService manualKbSyncService,
      KnowledgeBaseCleaningService cleaningService) {
    this.knowledgeBaseService = knowledgeBaseService;
    this.manualKbSyncService = manualKbSyncService;
    this.cleaningService = cleaningService;
  }

  private Long currentUserId() {
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    TransitPrincipal principal = (TransitPrincipal) authentication.getPrincipal();
    return principal.subjectId();
  }

  @GetMapping
  public Result<List<KnowledgeBaseEntity>> list() {
    return Result.success(knowledgeBaseService.list(currentUserId()));
  }

  @PostMapping
  public Result<KnowledgeBaseEntity> create(@RequestBody KnowledgeBaseEntity request) {
    return Result.success(knowledgeBaseService.create(currentUserId(), request));
  }

  @PutMapping("/{id}")
  public Result<KnowledgeBaseEntity> update(@PathVariable("id") Long id, @RequestBody KnowledgeBaseEntity request) {
    return Result.success(knowledgeBaseService.update(currentUserId(), id, request));
  }

  @DeleteMapping("/{id}")
  public Result<Void> delete(@PathVariable("id") Long id) {
    knowledgeBaseService.delete(currentUserId(), id);
    return Result.success(null);
  }

  @GetMapping("/{id}/files")
  public Result<List<KnowledgeBaseFileEntity>> listFiles(@PathVariable("id") Long id) {
    return Result.success(knowledgeBaseService.listFiles(currentUserId(), id));
  }

  @PostMapping(value = "/{id}/files", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public Result<KnowledgeBaseFileEntity> uploadFile(
      @PathVariable("id") Long id,
      @RequestPart(name = "data", required = false) String data,
      @RequestPart("file") MultipartFile file) throws IOException {
    return Result.success(knowledgeBaseService.uploadFile(currentUserId(), id, data, file));
  }

  @DeleteMapping("/{id}/files/{fileId}")
  public Result<Void> deleteFile(@PathVariable("id") Long id, @PathVariable("fileId") Long fileId) {
    knowledgeBaseService.deleteFile(currentUserId(), id, fileId);
    return Result.success(null);
  }

  @PostMapping(value = "/{id}/cleaning-tasks", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public Result<KnowledgeBaseCleaningService.CleaningTaskResult> createCleaningTask(
      @PathVariable("id") Long id,
      @RequestPart("file") MultipartFile file) {
    return Result.success(cleaningService.toResult(cleaningService.createTask(currentUserId(), id, file)));
  }

  @PostMapping(value = "/{id}/cleaning-tasks/batch", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public Result<List<KnowledgeBaseCleaningService.CleaningBatchItemResult>> createCleaningTasks(
      @PathVariable("id") Long id,
      @RequestPart("files") List<MultipartFile> files) {
    return Result.success(cleaningService.createBatchTasks(currentUserId(), id, files));
  }

  @GetMapping("/{id}/cleaning-tasks/{taskId}")
  public Result<KnowledgeBaseCleaningService.CleaningTaskResult> getCleaningTask(
      @PathVariable("id") Long id,
      @PathVariable("taskId") Long taskId) {
    return Result.success(cleaningService.toResult(cleaningService.getTask(currentUserId(), id, taskId)));
  }

  @PutMapping("/{id}/cleaning-tasks/{taskId}/items")
  public Result<KnowledgeBaseCleaningService.CleaningTaskResult> updateCleaningItems(
      @PathVariable("id") Long id,
      @PathVariable("taskId") Long taskId,
      @RequestBody CleaningItemsRequest request) throws Exception {
    return Result.success(cleaningService.toResult(cleaningService.updateItems(currentUserId(), id, taskId, request.items())));
  }

  @PostMapping("/{id}/cleaning-tasks/{taskId}/confirm")
  public Result<KnowledgeBaseCleaningService.CleaningTaskResult> confirmCleaningTask(
      @PathVariable("id") Long id,
      @PathVariable("taskId") Long taskId,
      @RequestBody(required = false) CleaningItemsRequest request) throws Exception {
    List<KnowledgeBaseQaExtractionService.CleaningQaItem> items = request == null ? List.of() : request.items();
    return Result.success(cleaningService.toResult(cleaningService.confirm(currentUserId(), id, taskId, items)));
  }

  @PostMapping("/manual-store")
  public Result<ManualKbSyncService.ManualStoreResult> manualStore(@RequestBody ManualStoreRequest request) {
    ManualKbSyncRecordEntity record = manualKbSyncService.createPendingRecord(
        currentUserId(),
        request.knowledgeBaseId(),
        request.contactKey(),
        request.customerMessage(),
        request.aiReplyMessage());
    return Result.success(manualKbSyncService.toResult(record));
  }

  public record ManualStoreRequest(
      Long knowledgeBaseId,
      String contactKey,
      String customerMessage,
      String aiReplyMessage) {
  }

  public record CleaningItemsRequest(List<KnowledgeBaseQaExtractionService.CleaningQaItem> items) {
  }
}
