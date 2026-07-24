package com.shijie.transit.adminapi.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.shijie.transit.common.db.entity.DesktopReleaseEntity;
import com.shijie.transit.common.mapper.DesktopReleaseMapper;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class DesktopReleaseService {
  private static final Logger log = LoggerFactory.getLogger(DesktopReleaseService.class);
  private final DesktopReleaseMapper desktopReleaseMapper;
  private final DesktopReleaseSelector desktopReleaseSelector;
  private final Clock clock;

  public DesktopReleaseService(
      DesktopReleaseMapper desktopReleaseMapper,
      DesktopReleaseSelector desktopReleaseSelector,
      Clock clock) {
    this.desktopReleaseMapper = desktopReleaseMapper;
    this.desktopReleaseSelector = desktopReleaseSelector;
    this.clock = clock;
  }

  public List<DesktopReleaseEntity> list(String status) {
    LambdaQueryWrapper<DesktopReleaseEntity> query = new LambdaQueryWrapper<>();
    if (StringUtils.hasText(status)) {
      query.eq(DesktopReleaseEntity::getStatus, status.trim().toUpperCase(Locale.ROOT));
    }
    return desktopReleaseMapper.selectList(query
        .orderByDesc(DesktopReleaseEntity::getPublishedAt)
        .orderByDesc(DesktopReleaseEntity::getCreatedAt));
  }

  public Optional<DesktopReleaseEntity> latestStable() {
    return desktopReleaseMapper.selectList(new LambdaQueryWrapper<DesktopReleaseEntity>()
            .eq(DesktopReleaseEntity::getStatus, "PUBLISHED")
            .eq(DesktopReleaseEntity::getPlatform, "win32")
            .eq(DesktopReleaseEntity::getArchitecture, "x64")
            .eq(DesktopReleaseEntity::getChannel, "stable")
            .orderByDesc(DesktopReleaseEntity::getPublishedAt))
        .stream()
        .findFirst();
  }

  public DesktopReleaseSelector.Selection check(DesktopReleaseSelector.Request request) {
    DesktopReleaseSelector.Selection selection = desktopReleaseSelector.select(list("PUBLISHED"), request);
    log.info("客户端更新检查 currentVersion={} platform={} architecture={} available={} targetVersion={}",
        request.currentVersion(), request.platform(), request.architecture(), selection.available(),
        selection.release() == null ? "" : selection.release().getVersion());
    return selection;
  }

  @Transactional
  public DesktopReleaseEntity create(DesktopReleaseEntity release) {
    normalize(release);
    release.setStatus("DRAFT");
    release.setMandatory(Boolean.TRUE.equals(release.getMandatory()));
    release.setRolloutPercentage(release.getRolloutPercentage() == null ? 100 : release.getRolloutPercentage());
    validateRollout(release.getRolloutPercentage());
    desktopReleaseMapper.insert(release);
    log.info("创建客户端发布草稿 version={} platform={} architecture={}",
        release.getVersion(), release.getPlatform(), release.getArchitecture());
    return release;
  }

  @Transactional
  public DesktopReleaseEntity update(long id, DesktopReleaseEntity changes) {
    DesktopReleaseEntity existing = getRequired(id);
    merge(existing, changes);
    normalize(existing);
    validateRollout(existing.getRolloutPercentage());
    desktopReleaseMapper.updateById(existing);
    log.info("更新客户端发布记录 id={} version={}", id, existing.getVersion());
    return existing;
  }

  @Transactional
  public DesktopReleaseEntity publish(long id) {
    DesktopReleaseEntity release = getRequired(id);
    normalize(release);
    validatePublishable(release);
    release.setStatus("PUBLISHED");
    release.setPublishedAt(LocalDateTime.now(clock));
    desktopReleaseMapper.updateById(release);
    log.info("发布客户端版本 id={} version={} rolloutPercentage={}",
        id, release.getVersion(), release.getRolloutPercentage());
    return release;
  }

  @Transactional
  public DesktopReleaseEntity pause(long id) {
    DesktopReleaseEntity release = getRequired(id);
    release.setStatus("PAUSED");
    desktopReleaseMapper.updateById(release);
    log.warn("暂停客户端发布 id={} version={}", id, release.getVersion());
    return release;
  }

  @Transactional
  public DesktopReleaseEntity rollback(long id) {
    DesktopReleaseEntity release = getRequired(id);
    normalize(release);
    validatePublishable(release);
    release.setStatus("PUBLISHED");
    release.setPublishedAt(LocalDateTime.now(clock));
    desktopReleaseMapper.updateById(release);
    log.warn("回滚客户端发布到历史版本 id={} version={}", id, release.getVersion());
    return release;
  }

  private DesktopReleaseEntity getRequired(long id) {
    DesktopReleaseEntity release = desktopReleaseMapper.selectById(id);
    if (release == null) {
      throw new IllegalArgumentException("软件版本不存在");
    }
    return release;
  }

  private void merge(DesktopReleaseEntity target, DesktopReleaseEntity changes) {
    if (changes.getVersion() != null) target.setVersion(changes.getVersion());
    if (changes.getPlatform() != null) target.setPlatform(changes.getPlatform());
    if (changes.getArchitecture() != null) target.setArchitecture(changes.getArchitecture());
    if (changes.getChannel() != null) target.setChannel(changes.getChannel());
    if (changes.getMandatory() != null) target.setMandatory(changes.getMandatory());
    if (changes.getMinimumSupportedVersion() != null) target.setMinimumSupportedVersion(changes.getMinimumSupportedVersion());
    if (changes.getRolloutPercentage() != null) target.setRolloutPercentage(changes.getRolloutPercentage());
    if (changes.getReleaseNotes() != null) target.setReleaseNotes(changes.getReleaseNotes());
    if (changes.getFeedUrl() != null) target.setFeedUrl(changes.getFeedUrl());
    if (changes.getInstallerUrl() != null) target.setInstallerUrl(changes.getInstallerUrl());
    if (changes.getSha512() != null) target.setSha512(changes.getSha512());
    if (changes.getFileSize() != null) target.setFileSize(changes.getFileSize());
  }

  private void normalize(DesktopReleaseEntity release) {
    release.setVersion(required(release.getVersion(), "版本号不能为空").replaceFirst("^[vV]", ""));
    release.setPlatform(required(release.getPlatform(), "平台不能为空").toLowerCase(Locale.ROOT));
    release.setArchitecture(required(release.getArchitecture(), "架构不能为空").toLowerCase(Locale.ROOT));
    release.setChannel(required(release.getChannel(), "发布通道不能为空").toLowerCase(Locale.ROOT));
    release.setReleaseNotes(release.getReleaseNotes() == null ? "" : release.getReleaseNotes().trim());
  }

  private void validatePublishable(DesktopReleaseEntity release) {
    validateRollout(release.getRolloutPercentage());
    required(release.getFeedUrl(), "更新源地址不能为空");
    required(release.getInstallerUrl(), "安装包地址不能为空");
    required(release.getSha512(), "SHA-512 校验值不能为空");
  }

  private void validateRollout(Integer rolloutPercentage) {
    if (rolloutPercentage == null || rolloutPercentage < 0 || rolloutPercentage > 100) {
      throw new IllegalArgumentException("灰度比例必须在 0 到 100 之间");
    }
  }

  private String required(String value, String message) {
    if (!StringUtils.hasText(value)) {
      throw new IllegalArgumentException(message);
    }
    return value.trim();
  }
}
