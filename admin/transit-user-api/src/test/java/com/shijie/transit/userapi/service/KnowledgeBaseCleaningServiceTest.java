package com.shijie.transit.userapi.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.shijie.transit.common.db.entity.KnowledgeBaseCleaningTaskEntity;
import com.shijie.transit.common.db.entity.KnowledgeBaseEntity;
import com.shijie.transit.common.db.entity.KnowledgeBaseFileEntity;
import com.shijie.transit.userapi.dify.DifyClient;
import com.shijie.transit.userapi.mapper.KnowledgeBaseCleaningTaskMapper;
import com.shijie.transit.userapi.mapper.KnowledgeBaseFileMapper;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.client.RestClient;

class KnowledgeBaseCleaningServiceTest {

  private final ObjectMapper objectMapper = new ObjectMapper();

  @Test
  void createBatchTasksCreatesOneTaskForEachValidFile() {
    KnowledgeBaseCleaningTaskMapper taskMapper = mock(KnowledgeBaseCleaningTaskMapper.class);
    AtomicLong idSequence = new AtomicLong(101L);
    List<KnowledgeBaseCleaningTaskEntity> insertedTasks = new ArrayList<>();
    when(taskMapper.insert(any(KnowledgeBaseCleaningTaskEntity.class))).thenAnswer(invocation -> {
      KnowledgeBaseCleaningTaskEntity task = invocation.getArgument(0);
      task.setId(idSequence.getAndIncrement());
      insertedTasks.add(task);
      return 1;
    });
    KnowledgeBaseCleaningService service = new KnowledgeBaseCleaningService(
        fakeKnowledgeBaseService(),
        taskMapper,
        mock(KnowledgeBaseFileMapper.class),
        new KnowledgeBaseDocumentParser(),
        disabledExtractionService(),
        new KnowledgeBaseQaMarkdownBuilder(),
        new RecordingDifyClient(),
        objectMapper,
        Clock.systemDefaultZone());

    List<KnowledgeBaseCleaningService.CleaningBatchItemResult> results = service.createBatchTasks(7L, 9L, List.of(
        mockKnowledgeFile("价格说明.txt", "收费标准：专业版每月 299 元。"),
        mockKnowledgeFile("售后政策.md", "支持 7 天无理由退货。")));

    assertEquals(2, results.size());
    assertTrue(results.get(0).success());
    assertEquals("价格说明.txt", results.get(0).fileName());
    assertEquals("101", results.get(0).task().taskId());
    assertTrue(results.get(1).success());
    assertEquals("售后政策.md", results.get(1).fileName());
    assertEquals(2, insertedTasks.size());
  }

  @Test
  void createBatchTasksKeepsValidFilesWhenAnotherFileFailsValidation() {
    KnowledgeBaseCleaningTaskMapper taskMapper = mock(KnowledgeBaseCleaningTaskMapper.class);
    when(taskMapper.insert(any(KnowledgeBaseCleaningTaskEntity.class))).thenAnswer(invocation -> {
      KnowledgeBaseCleaningTaskEntity task = invocation.getArgument(0);
      task.setId(201L);
      return 1;
    });
    KnowledgeBaseCleaningService service = new KnowledgeBaseCleaningService(
        fakeKnowledgeBaseService(),
        taskMapper,
        mock(KnowledgeBaseFileMapper.class),
        new KnowledgeBaseDocumentParser(),
        disabledExtractionService(),
        new KnowledgeBaseQaMarkdownBuilder(),
        new RecordingDifyClient(),
        objectMapper,
        Clock.systemDefaultZone());

    List<KnowledgeBaseCleaningService.CleaningBatchItemResult> results = service.createBatchTasks(7L, 9L, List.of(
        mockKnowledgeFile("可用资料.pdf", "可用资料"),
        new MockMultipartFile("files", "脚本.exe", "application/octet-stream", "bad".getBytes(StandardCharsets.UTF_8))));

    assertEquals(2, results.size());
    assertTrue(results.get(0).success());
    assertEquals("201", results.get(0).task().taskId());
    assertFalse(results.get(1).success());
    assertEquals("脚本.exe", results.get(1).fileName());
    assertEquals("仅支持 PDF、Word、TXT、MD、Excel 文件", results.get(1).errorMessage());
  }

  @Test
  void createBatchTasksRejectsMoreThanTenFiles() {
    KnowledgeBaseCleaningService service = new KnowledgeBaseCleaningService(
        fakeKnowledgeBaseService(),
        mock(KnowledgeBaseCleaningTaskMapper.class),
        mock(KnowledgeBaseFileMapper.class),
        new KnowledgeBaseDocumentParser(),
        disabledExtractionService(),
        new KnowledgeBaseQaMarkdownBuilder(),
        new RecordingDifyClient(),
        objectMapper,
        Clock.systemDefaultZone());
    List<MockMultipartFile> files = new ArrayList<>();
    for (int i = 0; i < 11; i++) {
      files.add(mockKnowledgeFile("资料-" + i + ".txt", "内容-" + i));
    }

    IllegalArgumentException error = assertThrows(
        IllegalArgumentException.class,
        () -> service.createBatchTasks(7L, 9L, files));

    assertEquals("一次最多上传 10 个知识文件", error.getMessage());
  }

  @Test
  void confirmCreatesDifyTextDocumentAndRecordsFile() throws Exception {
    KnowledgeBaseCleaningTaskMapper taskMapper = mock(KnowledgeBaseCleaningTaskMapper.class);
    KnowledgeBaseFileMapper fileMapper = mock(KnowledgeBaseFileMapper.class);
    RecordingDifyClient difyClient = new RecordingDifyClient();
    KnowledgeBaseCleaningTaskEntity task = reviewTask();
    List<KnowledgeBaseFileEntity> insertedFiles = new java.util.ArrayList<>();
    when(taskMapper.selectById(11L)).thenReturn(task);
    when(taskMapper.updateById(any(KnowledgeBaseCleaningTaskEntity.class))).thenReturn(1);
    when(fileMapper.insert(any(KnowledgeBaseFileEntity.class))).thenAnswer(invocation -> {
      insertedFiles.add(invocation.getArgument(0));
      return 1;
    });
    KnowledgeBaseCleaningService service = new KnowledgeBaseCleaningService(
        fakeKnowledgeBaseService(),
        taskMapper,
        fileMapper,
        new KnowledgeBaseDocumentParser(),
        disabledExtractionService(),
        new KnowledgeBaseQaMarkdownBuilder(),
        difyClient,
        objectMapper,
        Clock.fixed(Instant.parse("2026-06-01T01:00:00Z"), ZoneId.of("Asia/Shanghai")));

    KnowledgeBaseCleaningTaskEntity confirmed = service.confirm(7L, 9L, 11L, List.of(
        new KnowledgeBaseQaExtractionService.CleaningQaItem("怎么收费？", "专业版每月 299 元。", "NORMAL", "")));

    assertEquals("COMPLETED", confirmed.getTaskStatus());
    assertEquals("doc-1", confirmed.getDifyDocumentId());
    assertEquals("清洗-价格说明.pdf", difyClient.name);
    assertEquals("Q：怎么收费？\nA：专业版每月 299 元。", difyClient.text);
    assertEquals(1, insertedFiles.size());
    assertEquals("清洗-价格说明.pdf", insertedFiles.get(0).getName());
  }

  @Test
  void confirmRejectsTaskOwnedByAnotherUser() throws Exception {
    KnowledgeBaseCleaningTaskMapper taskMapper = mock(KnowledgeBaseCleaningTaskMapper.class);
    when(taskMapper.selectById(11L)).thenReturn(reviewTask());
    KnowledgeBaseCleaningService service = new KnowledgeBaseCleaningService(
        fakeKnowledgeBaseService(),
        taskMapper,
        mock(KnowledgeBaseFileMapper.class),
        new KnowledgeBaseDocumentParser(),
        disabledExtractionService(),
        new KnowledgeBaseQaMarkdownBuilder(),
        new RecordingDifyClient(),
        objectMapper,
        Clock.systemDefaultZone());

    assertThrows(IllegalArgumentException.class, () -> service.confirm(8L, 9L, 11L, List.of()));
  }

  @Test
  void toResultReturnsSnowflakeFieldsAsStrings() throws Exception {
    KnowledgeBaseCleaningTaskEntity task = reviewTask();
    task.setId(2061205489500377041L);
    task.setFileSize(1048576L);
    KnowledgeBaseCleaningService service = new KnowledgeBaseCleaningService(
        fakeKnowledgeBaseService(),
        mock(KnowledgeBaseCleaningTaskMapper.class),
        mock(KnowledgeBaseFileMapper.class),
        new KnowledgeBaseDocumentParser(),
        disabledExtractionService(),
        new KnowledgeBaseQaMarkdownBuilder(),
        new RecordingDifyClient(),
        objectMapper,
        Clock.systemDefaultZone());

    KnowledgeBaseCleaningService.CleaningTaskResult result = service.toResult(task);

    assertEquals("2061205489500377041", result.taskId());
    assertEquals("1048576", result.fileSize());
  }

  private KnowledgeBaseCleaningTaskEntity reviewTask() throws Exception {
    KnowledgeBaseCleaningTaskEntity task = new KnowledgeBaseCleaningTaskEntity();
    task.setId(11L);
    task.setTenantId(1L);
    task.setUserId(7L);
    task.setKbId(9L);
    task.setDifyDatasetId("dataset-1");
    task.setOriginalFileName("价格说明.pdf");
    task.setTaskStatus("REVIEWING");
    task.setQaItemsJson(objectMapper.writeValueAsString(List.of(
        new KnowledgeBaseQaExtractionService.CleaningQaItem("怎么收费？", "专业版每月 299 元。", "NORMAL", ""))));
    task.setFailedReason("");
    task.setDifyDocumentId("");
    return task;
  }

  private KnowledgeBaseService fakeKnowledgeBaseService() {
    return new KnowledgeBaseService(null, null, null, null, objectMapper) {
      @Override
      public KnowledgeBaseEntity getById(Long userId, Long id) {
        KnowledgeBaseEntity entity = new KnowledgeBaseEntity();
        entity.setId(id);
        entity.setUserId(userId);
        entity.setStatus("ENABLED");
        entity.setDifyDatasetId("dataset-1");
        return entity;
      }
    };
  }

  private KnowledgeBaseQaExtractionService disabledExtractionService() {
    return new KnowledgeBaseQaExtractionService(
        objectMapper,
        RestClient.builder(),
        "",
        "https://dashscope.aliyuncs.com",
        "qwen3.6-plus");
  }

  private MockMultipartFile mockKnowledgeFile(String fileName, String content) {
    return new MockMultipartFile("files", fileName, "text/plain", content.getBytes(StandardCharsets.UTF_8));
  }

  private static class RecordingDifyClient extends DifyClient {
    String name;
    String text;

    RecordingDifyClient() {
      super(null, new ObjectMapper());
    }

    @Override
    public DifyDocumentResult createDocumentByText(String datasetId, String name, String text, String indexingTechnique, String processRuleMode) {
      this.name = name;
      this.text = text;
      return new DifyDocumentResult("{}", "doc-1", "waiting", "", 12);
    }
  }
}
