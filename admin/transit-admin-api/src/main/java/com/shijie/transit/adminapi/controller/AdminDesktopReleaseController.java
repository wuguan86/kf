package com.shijie.transit.adminapi.controller;

import com.shijie.transit.adminapi.service.DesktopReleaseService;
import com.shijie.transit.common.db.entity.DesktopReleaseEntity;
import com.shijie.transit.common.web.Result;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/desktop-releases")
public class AdminDesktopReleaseController {
  private final DesktopReleaseService desktopReleaseService;

  public AdminDesktopReleaseController(DesktopReleaseService desktopReleaseService) {
    this.desktopReleaseService = desktopReleaseService;
  }

  @GetMapping
  public Result<List<DesktopReleaseEntity>> list(@RequestParam(required = false) String status) {
    return Result.success(desktopReleaseService.list(status));
  }

  @PostMapping
  public Result<DesktopReleaseEntity> create(@Valid @RequestBody SaveDesktopReleaseRequest request) {
    return Result.success(desktopReleaseService.create(toEntity(request)));
  }

  @PutMapping("/{id}")
  public Result<DesktopReleaseEntity> update(@PathVariable long id, @RequestBody SaveDesktopReleaseRequest request) {
    return Result.success(desktopReleaseService.update(id, toEntity(request)));
  }

  @PostMapping("/{id}/publish")
  public Result<DesktopReleaseEntity> publish(@PathVariable long id) {
    return Result.success(desktopReleaseService.publish(id));
  }

  @PostMapping("/{id}/pause")
  public Result<DesktopReleaseEntity> pause(@PathVariable long id) {
    return Result.success(desktopReleaseService.pause(id));
  }

  @PostMapping("/{id}/rollback")
  public Result<DesktopReleaseEntity> rollback(@PathVariable long id) {
    return Result.success(desktopReleaseService.rollback(id));
  }

  private DesktopReleaseEntity toEntity(SaveDesktopReleaseRequest request) {
    DesktopReleaseEntity entity = new DesktopReleaseEntity();
    entity.setVersion(request.version());
    entity.setPlatform(request.platform());
    entity.setArchitecture(request.architecture());
    entity.setChannel(request.channel());
    entity.setMandatory(request.mandatory());
    entity.setMinimumSupportedVersion(request.minimumSupportedVersion());
    entity.setRolloutPercentage(request.rolloutPercentage());
    entity.setReleaseNotes(request.releaseNotes());
    entity.setFeedUrl(request.feedUrl());
    entity.setInstallerUrl(request.installerUrl());
    entity.setSha512(request.sha512());
    entity.setFileSize(request.fileSize());
    return entity;
  }

  public record SaveDesktopReleaseRequest(
      @NotBlank(message = "版本号不能为空") String version,
      @NotBlank(message = "平台不能为空") String platform,
      @NotBlank(message = "架构不能为空") String architecture,
      @NotBlank(message = "发布通道不能为空") String channel,
      Boolean mandatory,
      String minimumSupportedVersion,
      @Min(value = 0, message = "灰度比例不能小于 0") @Max(value = 100, message = "灰度比例不能大于 100") Integer rolloutPercentage,
      String releaseNotes,
      String feedUrl,
      String installerUrl,
      String sha512,
      Long fileSize) {
  }
}
