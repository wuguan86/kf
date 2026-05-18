package com.shijie.transit.userapi.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.shijie.transit.common.db.entity.KnowledgeBaseEntity;
import com.shijie.transit.common.db.entity.KnowledgeBaseFileEntity;
import com.shijie.transit.common.tenant.TenantContext;
import com.shijie.transit.userapi.dify.DifyClient;
import com.shijie.transit.userapi.mapper.KnowledgeBaseFileMapper;
import com.shijie.transit.userapi.mapper.KnowledgeBaseMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;

@Service
public class KnowledgeBaseService {
  private static final String DEFAULT_SEARCH_METHOD = "hybrid_search";
  private static final int DEFAULT_TOP_K = 3;
  private static final double DEFAULT_SCORE_THRESHOLD = 0.35d;
  private static final String DEFAULT_RERANK_PROVIDER = "tongyi";
  private static final String DEFAULT_RERANK_MODEL = "gte-rerank-v2";
  private final KnowledgeBaseMapper knowledgeBaseMapper;
  private final KnowledgeBaseFileMapper knowledgeBaseFileMapper;
  private final RoleKnowledgeBaseService roleKnowledgeBaseService;
  private final DifyClient difyClient;
  private final ObjectMapper objectMapper;

  public KnowledgeBaseService(
      KnowledgeBaseMapper knowledgeBaseMapper,
      KnowledgeBaseFileMapper knowledgeBaseFileMapper,
      RoleKnowledgeBaseService roleKnowledgeBaseService,
      DifyClient difyClient,
      ObjectMapper objectMapper) {
    this.knowledgeBaseMapper = knowledgeBaseMapper;
    this.knowledgeBaseFileMapper = knowledgeBaseFileMapper;
    this.roleKnowledgeBaseService = roleKnowledgeBaseService;
    this.difyClient = difyClient;
    this.objectMapper = objectMapper;
  }

  public List<KnowledgeBaseEntity> list(Long userId) {
    return knowledgeBaseMapper.selectList(
        new LambdaQueryWrapper<KnowledgeBaseEntity>()
            .eq(KnowledgeBaseEntity::getUserId, userId)
            .orderByDesc(KnowledgeBaseEntity::getCreatedAt));
  }

  public KnowledgeBaseEntity getById(Long userId, Long id) {
    KnowledgeBaseEntity existing = knowledgeBaseMapper.selectById(id);
    if (existing == null || !existing.getUserId().equals(userId)) {
      throw new IllegalArgumentException("knowledge base not found");
    }
    return existing;
  }

  public KnowledgeBaseEntity getByDifyDatasetId(Long userId, String datasetId) {
    if (!StringUtils.hasText(datasetId)) {
      return null;
    }
    return knowledgeBaseMapper.selectOne(
        new LambdaQueryWrapper<KnowledgeBaseEntity>()
            .eq(KnowledgeBaseEntity::getUserId, userId)
            .eq(KnowledgeBaseEntity::getDifyDatasetId, datasetId)
            .last("limit 1"));
  }

  @Transactional
  public KnowledgeBaseEntity create(Long userId, KnowledgeBaseEntity request) {
    if (request == null || !StringUtils.hasText(request.getName())) {
      throw new IllegalArgumentException("knowledge base name required");
    }
    String permission = StringUtils.hasText(request.getPermission()) ? request.getPermission().trim() : "only_me";
    DifyClient.DifyDatasetResult datasetResult = difyClient.createDataset(userId + "_" + request.getName().trim(), permission);
    if (!StringUtils.hasText(datasetResult.datasetId())) {
      throw new IllegalStateException("failed to create dify dataset");
    }
    difyClient.updateDatasetRetrievalModel(
        datasetResult.datasetId(),
        DEFAULT_SEARCH_METHOD,
        true,
        DEFAULT_TOP_K,
        true,
        DEFAULT_SCORE_THRESHOLD,
        DEFAULT_RERANK_PROVIDER,
        DEFAULT_RERANK_MODEL);
    KnowledgeBaseEntity entity = new KnowledgeBaseEntity();
    entity.setTenantId(TenantContext.getTenantId());
    entity.setUserId(userId);
    entity.setName(request.getName().trim());
    entity.setDescription(request.getDescription() == null ? "" : request.getDescription());
    entity.setDifyDatasetId(datasetResult.datasetId());
    entity.setPermission(permission);
    entity.setStatus(StringUtils.hasText(request.getStatus()) ? request.getStatus().trim() : "ENABLED");
    entity.setIsDefault(Boolean.TRUE.equals(request.getIsDefault()));
    knowledgeBaseMapper.insert(entity);
    return entity;
  }

  @Transactional
  public KnowledgeBaseEntity createByExistingDatasetId(Long userId, KnowledgeBaseEntity request) {
    if (request == null || !StringUtils.hasText(request.getName()) || !StringUtils.hasText(request.getDifyDatasetId())) {
      throw new IllegalArgumentException("knowledge base name and dataset id required");
    }
    KnowledgeBaseEntity existing = getByDifyDatasetId(userId, request.getDifyDatasetId().trim());
    if (existing != null) {
      return existing;
    }
    KnowledgeBaseEntity entity = new KnowledgeBaseEntity();
    entity.setTenantId(TenantContext.getTenantId());
    entity.setUserId(userId);
    entity.setName(request.getName().trim());
    entity.setDescription(request.getDescription() == null ? "" : request.getDescription());
    entity.setDifyDatasetId(request.getDifyDatasetId().trim());
    entity.setPermission(StringUtils.hasText(request.getPermission()) ? request.getPermission().trim() : "only_me");
    entity.setStatus(StringUtils.hasText(request.getStatus()) ? request.getStatus().trim() : "ENABLED");
    entity.setIsDefault(Boolean.TRUE.equals(request.getIsDefault()));
    knowledgeBaseMapper.insert(entity);
    return entity;
  }

  @Transactional
  public KnowledgeBaseEntity update(Long userId, Long id, KnowledgeBaseEntity request) {
    KnowledgeBaseEntity existing = getById(userId, id);
    if (request == null) {
      return existing;
    }
    if (StringUtils.hasText(request.getName())) {
      existing.setName(request.getName().trim());
    }
    if (request.getDescription() != null) {
      existing.setDescription(request.getDescription());
    }
    if (StringUtils.hasText(request.getPermission())) {
      existing.setPermission(request.getPermission().trim());
    }
    if (StringUtils.hasText(request.getStatus())) {
      existing.setStatus(request.getStatus().trim());
    }
    
    // Sync to Dify if name or permission changed
    if (StringUtils.hasText(existing.getDifyDatasetId())) {
      String newName = StringUtils.hasText(request.getName()) ? (userId + "_" + request.getName().trim()) : null;
      String newPermission = StringUtils.hasText(request.getPermission()) ? request.getPermission().trim() : null;
      if (newName != null || newPermission != null) {
        difyClient.updateDataset(existing.getDifyDatasetId(), newName, newPermission);
      }
    }

    knowledgeBaseMapper.updateById(existing);
    return existing;
  }

  @Transactional
  public void delete(Long userId, Long id) {
    KnowledgeBaseEntity existing = getById(userId, id);
    if (Boolean.TRUE.equals(existing.getIsDefault())) {
      throw new IllegalArgumentException("默认知识库不能删除");
    }
    List<KnowledgeBaseFileEntity> files = listFiles(userId, id);
    for (KnowledgeBaseFileEntity file : files) {
      if (StringUtils.hasText(file.getDifyDocumentId())) {
        difyClient.deleteDocument(existing.getDifyDatasetId(), file.getDifyDocumentId());
      }
    }
    knowledgeBaseFileMapper.delete(new LambdaQueryWrapper<KnowledgeBaseFileEntity>()
        .eq(KnowledgeBaseFileEntity::getKbId, id));
    roleKnowledgeBaseService.removeByKnowledgeBaseId(id);
    if (StringUtils.hasText(existing.getDifyDatasetId())) {
      difyClient.deleteDataset(existing.getDifyDatasetId());
    }
    knowledgeBaseMapper.deleteById(id);
  }

  public List<KnowledgeBaseFileEntity> listFiles(Long userId, Long knowledgeBaseId) {
    getById(userId, knowledgeBaseId);
    return knowledgeBaseFileMapper.selectList(
        new LambdaQueryWrapper<KnowledgeBaseFileEntity>()
            .eq(KnowledgeBaseFileEntity::getKbId, knowledgeBaseId)
            .orderByDesc(KnowledgeBaseFileEntity::getCreatedAt));
  }

  @Transactional
  public KnowledgeBaseFileEntity uploadFile(Long userId, Long knowledgeBaseId, String data, MultipartFile file) throws IOException {
    KnowledgeBaseEntity knowledgeBase = getById(userId, knowledgeBaseId);
    if (file == null || file.isEmpty()) {
      throw new IllegalArgumentException("file required");
    }
    String payloadData = StringUtils.hasText(data)
        ? data
        : "{\"indexing_technique\":\"high_quality\",\"process_rule\":{\"mode\":\"automatic\"}}";
    String difyJson = difyClient.uploadDocumentByFile(knowledgeBase.getDifyDatasetId(), payloadData, file);
    JsonNode root = objectMapper.readTree(difyJson);
    String documentId = extractText(root, "document", "id");
    if (!StringUtils.hasText(documentId)) {
      documentId = extractText(root, "id");
    }
    if (!StringUtils.hasText(documentId)) {
      throw new IllegalStateException("dify document id missing");
    }
    KnowledgeBaseFileEntity entity = new KnowledgeBaseFileEntity();
    entity.setTenantId(TenantContext.getTenantId());
    entity.setKbId(knowledgeBaseId);
    entity.setName(StringUtils.hasText(file.getOriginalFilename()) ? file.getOriginalFilename() : documentId);
    entity.setFileKey(extractText(root, "document", "data_source_info", "upload_file_id"));
    if (!StringUtils.hasText(entity.getFileKey())) {
      entity.setFileKey(documentId);
    }
    entity.setFileSize(file.getSize());
    entity.setExtension(resolveExtension(file.getOriginalFilename()));
    entity.setDifyDocumentId(documentId);
    entity.setIndexingStatus(resolveIndexingStatus(root));
    entity.setErrorMsg(extractText(root, "document", "error"));
    entity.setWordCount(resolveWordCount(root));
    knowledgeBaseFileMapper.insert(entity);
    return entity;
  }

  @Transactional
  public void deleteFile(Long userId, Long knowledgeBaseId, Long fileId) {
    KnowledgeBaseEntity knowledgeBase = getById(userId, knowledgeBaseId);
    KnowledgeBaseFileEntity file = knowledgeBaseFileMapper.selectById(fileId);
    if (file == null || !file.getKbId().equals(knowledgeBaseId)) {
      throw new IllegalArgumentException("knowledge base file not found");
    }
    if (StringUtils.hasText(file.getDifyDocumentId())) {
      difyClient.deleteDocument(knowledgeBase.getDifyDatasetId(), file.getDifyDocumentId());
    }
    knowledgeBaseFileMapper.deleteById(fileId);
  }

  private String resolveExtension(String fileName) {
    if (!StringUtils.hasText(fileName)) {
      return "";
    }
    int index = fileName.lastIndexOf('.');
    if (index < 0 || index >= fileName.length() - 1) {
      return "";
    }
    return fileName.substring(index + 1).toLowerCase();
  }

  private String resolveIndexingStatus(JsonNode root) {
    String status = extractText(root, "document", "indexing_status");
    if (StringUtils.hasText(status)) {
      return status;
    }
    status = extractText(root, "indexing_status");
    return StringUtils.hasText(status) ? status : "waiting";
  }

  private Integer resolveWordCount(JsonNode root) {
    JsonNode node = root.at("/document/word_count");
    if (node != null && node.isInt()) {
      return node.asInt();
    }
    node = root.at("/word_count");
    if (node != null && node.isInt()) {
      return node.asInt();
    }
    return 0;
  }

  private String extractText(JsonNode root, String... path) {
    JsonNode current = root;
    for (String item : path) {
      if (current == null) {
        return "";
      }
      current = current.path(item);
    }
    if (current == null || current.isMissingNode() || current.isNull()) {
      return "";
    }
    if (current.isTextual() || current.isNumber() || current.isBoolean()) {
      return current.asText();
    }
    return "";
  }
}
