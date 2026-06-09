package com.shijie.transit.userapi.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.shijie.transit.common.db.entity.KnowledgeBaseEntity;
import com.shijie.transit.common.db.entity.KnowledgeBaseFileEntity;
import com.shijie.transit.userapi.dify.DifyClient;
import com.shijie.transit.userapi.mapper.KnowledgeBaseFileMapper;
import com.shijie.transit.userapi.mapper.KnowledgeBaseMapper;
import java.util.List;
import org.junit.jupiter.api.Test;

class KnowledgeBaseServiceTest {

  private final ObjectMapper objectMapper = new ObjectMapper();

  @Test
  void listFilesRefreshesPendingDifyIndexingStatus() {
    KnowledgeBaseMapper knowledgeBaseMapper = mock(KnowledgeBaseMapper.class);
    KnowledgeBaseFileMapper fileMapper = mock(KnowledgeBaseFileMapper.class);
    RecordingDifyClient difyClient = new RecordingDifyClient();
    KnowledgeBaseEntity knowledgeBase = new KnowledgeBaseEntity();
    knowledgeBase.setId(9L);
    knowledgeBase.setUserId(7L);
    knowledgeBase.setDifyDatasetId("dataset-1");
    KnowledgeBaseFileEntity file = new KnowledgeBaseFileEntity();
    file.setId(11L);
    file.setKbId(9L);
    file.setDifyDocumentId("doc-1");
    file.setIndexingStatus("splitting");
    file.setWordCount(0);

    when(knowledgeBaseMapper.selectById(9L)).thenReturn(knowledgeBase);
    when(fileMapper.selectList(any())).thenReturn(List.of(file));

    KnowledgeBaseService service = new KnowledgeBaseService(
        knowledgeBaseMapper,
        fileMapper,
        null,
        difyClient,
        objectMapper);

    List<KnowledgeBaseFileEntity> files = service.listFiles(7L, 9L);

    assertEquals("completed", files.get(0).getIndexingStatus());
    assertEquals(128, files.get(0).getWordCount());
    assertEquals("dataset-1", difyClient.datasetId);
    assertEquals("doc-1", difyClient.documentId);
    verify(fileMapper).updateById(file);
  }

  @Test
  void listFilesUsesDifyDocumentListWhenDocumentDetailStatusIsStale() {
    KnowledgeBaseMapper knowledgeBaseMapper = mock(KnowledgeBaseMapper.class);
    KnowledgeBaseFileMapper fileMapper = mock(KnowledgeBaseFileMapper.class);
    RecordingDifyClient difyClient = new RecordingDifyClient();
    difyClient.documentResponse = "{\"document\":{\"id\":\"doc-1\",\"indexing_status\":\"splitting\",\"word_count\":0,\"error\":\"\"}}";
    difyClient.listResponse = "{\"data\":[{\"id\":\"doc-1\",\"display_status\":\"available\",\"word_count\":130,\"error\":\"\"}],\"has_more\":false}";
    KnowledgeBaseEntity knowledgeBase = new KnowledgeBaseEntity();
    knowledgeBase.setId(9L);
    knowledgeBase.setUserId(7L);
    knowledgeBase.setDifyDatasetId("dataset-1");
    KnowledgeBaseFileEntity file = new KnowledgeBaseFileEntity();
    file.setId(11L);
    file.setKbId(9L);
    file.setDifyDocumentId("doc-1");
    file.setIndexingStatus("splitting");
    file.setWordCount(0);

    when(knowledgeBaseMapper.selectById(9L)).thenReturn(knowledgeBase);
    when(fileMapper.selectList(any())).thenReturn(List.of(file));

    KnowledgeBaseService service = new KnowledgeBaseService(
        knowledgeBaseMapper,
        fileMapper,
        null,
        difyClient,
        objectMapper);

    List<KnowledgeBaseFileEntity> files = service.listFiles(7L, 9L);

    assertEquals("completed", files.get(0).getIndexingStatus());
    assertEquals(130, files.get(0).getWordCount());
    verify(fileMapper).updateById(file);
  }

  private static class RecordingDifyClient extends DifyClient {
    String datasetId;
    String documentId;
    String documentResponse = "{\"document\":{\"id\":\"doc-1\",\"indexing_status\":\"completed\",\"word_count\":128,\"error\":\"\"}}";
    String listResponse = "{\"data\":[],\"has_more\":false}";

    RecordingDifyClient() {
      super(null, new ObjectMapper());
    }

    @Override
    public String getDocument(String datasetId, String documentId) {
      this.datasetId = datasetId;
      this.documentId = documentId;
      return documentResponse;
    }

    @Override
    public String listDocuments(String datasetId, int page, int limit) {
      this.datasetId = datasetId;
      return listResponse;
    }
  }
}
