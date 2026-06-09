package com.shijie.transit.userapi.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.shijie.transit.common.db.entity.OutboundMaterialEntity;
import com.shijie.transit.common.tenant.TenantContext;
import com.shijie.transit.common.web.ErrorCode;
import com.shijie.transit.common.web.TransitException;
import com.shijie.transit.userapi.mapper.OutboundMaterialMapper;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

@Service
public class OutboundMaterialService {
  private static final Logger log = LoggerFactory.getLogger(OutboundMaterialService.class);
  private static final long MAX_AUTO_SEND_FILE_SIZE = 25L * 1024L * 1024L;

  private final OutboundMaterialMapper outboundMaterialMapper;
  private final Path uploadRoot;

  @Autowired
  public OutboundMaterialService(
      OutboundMaterialMapper outboundMaterialMapper,
      @Value("${transit.material.upload-root:uploads/materials}") String uploadRoot) {
    this(outboundMaterialMapper, Paths.get(uploadRoot));
  }

  OutboundMaterialService(OutboundMaterialMapper outboundMaterialMapper, Path uploadRoot) {
    this.outboundMaterialMapper = outboundMaterialMapper;
    this.uploadRoot = uploadRoot;
  }

  public List<OutboundMaterialEntity> listVisibleMaterials(Long userId) {
    Long tenantId = requireTenantId();
    List<OutboundMaterialEntity> materials = outboundMaterialMapper.selectList(
        new LambdaQueryWrapper<OutboundMaterialEntity>()
            .orderByDesc(OutboundMaterialEntity::getCreatedAt));
    return materials.stream()
        .filter(material -> isSameTenant(material, tenantId))
        .filter(material -> isVisibleToUser(material, userId))
        .toList();
  }

  public OutboundMaterialEntity getAccessibleMaterial(Long userId, Long id) {
    Long tenantId = requireTenantId();
    OutboundMaterialEntity material = outboundMaterialMapper.selectById(id);
    if (!isSameTenant(material, tenantId) || !isVisibleToUser(material, userId)) {
      throw new TransitException(ErrorCode.FORBIDDEN, "无权访问该外发素材");
    }
    return material;
  }

  public OutboundMaterialEntity validateAutoSendMaterial(Long userId, Long id, String channel) {
    OutboundMaterialEntity material = getAccessibleMaterial(userId, id);
    if (!"ENABLED".equalsIgnoreCase(nullSafe(material.getStatus()))) {
      throw new IllegalArgumentException("外发素材未启用");
    }
    if (!Boolean.TRUE.equals(material.getAutoSendEnabled())) {
      throw new IllegalArgumentException("外发素材未开启自动发送");
    }
    if (!isChannelAllowed(material.getAllowedChannels(), channel)) {
      throw new IllegalArgumentException("外发素材不允许当前微信渠道发送");
    }
    if (material.getFileSize() != null && material.getFileSize() > MAX_AUTO_SEND_FILE_SIZE) {
      throw new IllegalArgumentException("外发素材超过自动发送大小限制");
    }
    return material;
  }

  @Transactional
  public OutboundMaterialEntity uploadMaterial(
      Long userId,
      String scope,
      String name,
      String description,
      String tags,
      String allowedChannels,
      boolean autoSendEnabled,
      MultipartFile file) throws IOException {
    Long tenantId = requireTenantId();
    if (file == null || file.isEmpty()) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "上传素材文件不能为空");
    }
    String originalFilename = StringUtils.hasText(file.getOriginalFilename()) ? file.getOriginalFilename() : "未命名文件";
    String extension = resolveExtension(originalFilename);
    String normalizedScope = normalizeScope(scope);
    String normalizedChannels = normalizeAllowedChannels(allowedChannels);
    String fileType = resolveFileType(file.getContentType(), extension);
    String storedFileKey = storeFile(file, extension);

    OutboundMaterialEntity entity = new OutboundMaterialEntity();
    entity.setTenantId(tenantId);
    entity.setOwnerUserId(userId);
    entity.setScope(normalizedScope);
    entity.setName(StringUtils.hasText(name) ? name.trim() : originalFilename);
    entity.setDescription(description == null ? "" : description.trim());
    entity.setTags(tags == null ? "" : tags.trim());
    entity.setFileKey(storedFileKey);
    entity.setFileType(fileType);
    entity.setMimeType(StringUtils.hasText(file.getContentType()) ? file.getContentType() : "application/octet-stream");
    entity.setFileSize(file.getSize());
    entity.setExtension(extension);
    entity.setAllowedChannels(normalizedChannels);
    entity.setAutoSendEnabled(autoSendEnabled);
    entity.setStatus("ENABLED");
    outboundMaterialMapper.insert(entity);
    log.info("外发素材上传成功 userId={} tenantId={} scope={} fileName={} fileKey={} fileSize={}",
        userId, tenantId, normalizedScope, originalFilename, storedFileKey, file.getSize());
    return entity;
  }

  @Transactional
  public OutboundMaterialEntity updateMaterial(Long userId, Long id, OutboundMaterialEntity request) {
    OutboundMaterialEntity existing = getAccessibleMaterial(userId, id);
    if (request == null) {
      return existing;
    }
    if (StringUtils.hasText(request.getScope())) {
      existing.setScope(normalizeScope(request.getScope()));
    }
    if (StringUtils.hasText(request.getName())) {
      existing.setName(request.getName().trim());
    }
    if (request.getDescription() != null) {
      existing.setDescription(request.getDescription().trim());
    }
    if (request.getTags() != null) {
      existing.setTags(request.getTags().trim());
    }
    if (StringUtils.hasText(request.getAllowedChannels())) {
      existing.setAllowedChannels(normalizeAllowedChannels(request.getAllowedChannels()));
    }
    if (request.getAutoSendEnabled() != null) {
      existing.setAutoSendEnabled(request.getAutoSendEnabled());
    }
    if (StringUtils.hasText(request.getStatus())) {
      existing.setStatus(normalizeStatus(request.getStatus()));
    }
    outboundMaterialMapper.updateById(existing);
    return existing;
  }

  @Transactional
  public void deleteMaterial(Long userId, Long id) {
    OutboundMaterialEntity material = getAccessibleMaterial(userId, id);
    outboundMaterialMapper.deleteById(id);
    log.info("外发素材已删除 userId={} materialId={} fileKey={}", userId, id, material.getFileKey());
  }

  public Path resolveMaterialPath(Long userId, Long id) {
    OutboundMaterialEntity material = getAccessibleMaterial(userId, id);
    Path target = uploadRoot.resolve(material.getFileKey()).normalize();
    Path root = uploadRoot.normalize();
    if (!target.startsWith(root)) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "素材文件路径不合法");
    }
    return target;
  }

  private String storeFile(MultipartFile file, String extension) throws IOException {
    String datePath = LocalDate.now().toString().replace("-", "");
    Path directory = uploadRoot.resolve(datePath);
    Files.createDirectories(directory);
    String suffix = StringUtils.hasText(extension) ? "." + extension : "";
    String filename = UUID.randomUUID() + suffix;
    Path target = directory.resolve(filename);
    try (InputStream inputStream = file.getInputStream()) {
      Files.copy(inputStream, target);
    }
    return datePath + "/" + filename;
  }

  private boolean isVisibleToUser(OutboundMaterialEntity material, Long userId) {
    if (material == null) {
      return false;
    }
    if ("COMPANY".equalsIgnoreCase(nullSafe(material.getScope()))) {
      return true;
    }
    return "PRIVATE".equalsIgnoreCase(nullSafe(material.getScope())) && material.getOwnerUserId() != null && material.getOwnerUserId().equals(userId);
  }

  private boolean isSameTenant(OutboundMaterialEntity material, Long tenantId) {
    return material != null && material.getTenantId() != null && material.getTenantId().equals(tenantId);
  }

  private Long requireTenantId() {
    Long tenantId = TenantContext.getTenantId();
    if (tenantId == null) {
      throw new TransitException(ErrorCode.TENANT_ID_REQUIRED, "缺少租户上下文");
    }
    return tenantId;
  }

  private String normalizeScope(String scope) {
    String normalized = nullSafe(scope).toUpperCase(Locale.ROOT);
    if ("COMPANY".equals(normalized)) {
      return "COMPANY";
    }
    return "PRIVATE";
  }

  private String normalizeStatus(String status) {
    String normalized = nullSafe(status).toUpperCase(Locale.ROOT);
    return "DISABLED".equals(normalized) ? "DISABLED" : "ENABLED";
  }

  private String normalizeAllowedChannels(String allowedChannels) {
    String value = nullSafe(allowedChannels).toLowerCase(Locale.ROOT);
    boolean personal = value.contains("personal");
    boolean enterprise = value.contains("enterprise");
    if (!personal && !enterprise) {
      return "personal,enterprise";
    }
    if (personal && enterprise) {
      return "personal,enterprise";
    }
    return personal ? "personal" : "enterprise";
  }

  private boolean isChannelAllowed(String allowedChannels, String channel) {
    String normalizedChannel = nullSafe(channel).toLowerCase(Locale.ROOT);
    if (!normalizedChannel.equals("personal") && !normalizedChannel.equals("enterprise")) {
      return false;
    }
    return Arrays.stream(normalizeAllowedChannels(allowedChannels).split(","))
        .map(String::trim)
        .anyMatch(normalizedChannel::equals);
  }

  private String resolveFileType(String mimeType, String extension) {
    String normalizedMime = nullSafe(mimeType).toLowerCase(Locale.ROOT);
    String normalizedExtension = nullSafe(extension).toLowerCase(Locale.ROOT);
    if (normalizedMime.startsWith("image/") || List.of("png", "jpg", "jpeg", "gif", "webp", "bmp").contains(normalizedExtension)) {
      return "IMAGE";
    }
    return "FILE";
  }

  private String resolveExtension(String fileName) {
    if (!StringUtils.hasText(fileName)) {
      return "";
    }
    int index = fileName.lastIndexOf('.');
    if (index < 0 || index >= fileName.length() - 1) {
      return "";
    }
    return fileName.substring(index + 1).toLowerCase(Locale.ROOT);
  }

  private String nullSafe(String value) {
    return value == null ? "" : value.trim();
  }
}
