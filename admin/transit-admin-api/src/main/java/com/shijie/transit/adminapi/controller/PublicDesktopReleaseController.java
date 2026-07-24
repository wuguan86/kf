package com.shijie.transit.adminapi.controller;

import com.shijie.transit.adminapi.service.DesktopReleaseSelector;
import com.shijie.transit.adminapi.service.DesktopReleaseService;
import com.shijie.transit.common.db.entity.DesktopReleaseEntity;
import com.shijie.transit.common.web.Result;
import jakarta.validation.constraints.NotBlank;
import java.time.LocalDateTime;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/public/desktop-releases")
public class PublicDesktopReleaseController {
  private final DesktopReleaseService desktopReleaseService;

  public PublicDesktopReleaseController(DesktopReleaseService desktopReleaseService) {
    this.desktopReleaseService = desktopReleaseService;
  }

  @GetMapping("/latest")
  public Result<PublicReleaseResponse> latest() {
    return Result.success(desktopReleaseService.latestStable().map(this::toPublicResponse).orElse(null));
  }

  @GetMapping("/check")
  public Result<ReleaseCheckResponse> check(
      @RequestParam @NotBlank String version,
      @RequestParam(defaultValue = "win32") String platform,
      @RequestParam(defaultValue = "x64") String architecture,
      @RequestParam(defaultValue = "stable") String channel,
      @RequestParam @NotBlank String installationId) {
    DesktopReleaseSelector.Selection selection = desktopReleaseService.check(
        new DesktopReleaseSelector.Request(version, platform, architecture, channel, installationId));
    DesktopReleaseEntity release = selection.release();
    boolean mandatory = release != null && (Boolean.TRUE.equals(release.getMandatory())
        || isBelowMinimumVersion(version, release.getMinimumSupportedVersion()));
    return Result.success(new ReleaseCheckResponse(selection.available(), mandatory,
        release == null ? null : toPublicResponse(release)));
  }

  private boolean isBelowMinimumVersion(String currentVersion, String minimumSupportedVersion) {
    if (minimumSupportedVersion == null || minimumSupportedVersion.isBlank()) {
      return false;
    }
    String[] current = currentVersion.replaceFirst("^[vV]", "").split("\\.");
    String[] minimum = minimumSupportedVersion.replaceFirst("^[vV]", "").split("\\.");
    for (int index = 0; index < Math.max(current.length, minimum.length); index++) {
      int currentPart = index < current.length ? parsePart(current[index]) : 0;
      int minimumPart = index < minimum.length ? parsePart(minimum[index]) : 0;
      if (currentPart != minimumPart) {
        return currentPart < minimumPart;
      }
    }
    return false;
  }

  private int parsePart(String part) {
    try {
      return Integer.parseInt(part.replaceAll("[^0-9].*$", ""));
    } catch (NumberFormatException exception) {
      return 0;
    }
  }

  private PublicReleaseResponse toPublicResponse(DesktopReleaseEntity release) {
    return new PublicReleaseResponse(
        release.getVersion(), release.getPlatform(), release.getArchitecture(), release.getChannel(),
        Boolean.TRUE.equals(release.getMandatory()), release.getMinimumSupportedVersion(), release.getReleaseNotes(),
        release.getFeedUrl(), release.getInstallerUrl(), release.getSha512(), release.getFileSize(), release.getPublishedAt());
  }

  public record ReleaseCheckResponse(boolean available, boolean mandatory, PublicReleaseResponse release) {
  }

  public record PublicReleaseResponse(
      String version,
      String platform,
      String architecture,
      String channel,
      boolean mandatory,
      String minimumSupportedVersion,
      String releaseNotes,
      String feedUrl,
      String installerUrl,
      String sha512,
      Long fileSize,
      LocalDateTime publishedAt) {
  }
}
