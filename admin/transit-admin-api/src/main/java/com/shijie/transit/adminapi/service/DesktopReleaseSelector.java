package com.shijie.transit.adminapi.service;

import com.shijie.transit.common.db.entity.DesktopReleaseEntity;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Comparator;
import java.util.List;
import org.springframework.stereotype.Component;

/** 负责从已发布记录中选出当前匿名安装实例可获得的更新版本。 */
@Component
public class DesktopReleaseSelector {
  public Selection select(List<DesktopReleaseEntity> releases, Request request) {
    return releases.stream()
        .filter(release -> matchesTarget(release, request))
        .filter(release -> isNewer(release.getVersion(), request.currentVersion()))
        .filter(release -> isInRollout(release, request.installationId()))
        .max(Comparator.comparing(DesktopReleaseEntity::getVersion, this::compareVersions))
        .map(release -> new Selection(true, release))
        .orElseGet(() -> new Selection(false, null));
  }

  private boolean matchesTarget(DesktopReleaseEntity release, Request request) {
    return "PUBLISHED".equalsIgnoreCase(release.getStatus())
        && equalsIgnoreCase(release.getPlatform(), request.platform())
        && equalsIgnoreCase(release.getArchitecture(), request.architecture())
        && equalsIgnoreCase(release.getChannel(), request.channel());
  }

  private boolean isInRollout(DesktopReleaseEntity release, String installationId) {
    int rollout = release.getRolloutPercentage() == null ? 100 : release.getRolloutPercentage();
    if (rollout >= 100) {
      return true;
    }
    if (rollout <= 0 || installationId == null || installationId.isBlank()) {
      return false;
    }
    return stableBucket(installationId + ':' + release.getVersion()) < rollout;
  }

  private int stableBucket(String value) {
    try {
      byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
      return Byte.toUnsignedInt(digest[0]) % 100;
    } catch (NoSuchAlgorithmException exception) {
      throw new IllegalStateException("当前运行环境不支持 SHA-256", exception);
    }
  }

  private boolean isNewer(String candidate, String current) {
    return compareVersions(candidate, current) > 0;
  }

  private int compareVersions(String left, String right) {
    String[] leftParts = normalize(left).split("\\.");
    String[] rightParts = normalize(right).split("\\.");
    int length = Math.max(leftParts.length, rightParts.length);
    for (int index = 0; index < length; index++) {
      int leftValue = index < leftParts.length ? parsePart(leftParts[index]) : 0;
      int rightValue = index < rightParts.length ? parsePart(rightParts[index]) : 0;
      if (leftValue != rightValue) {
        return Integer.compare(leftValue, rightValue);
      }
    }
    return 0;
  }

  private String normalize(String version) {
    if (version == null || version.isBlank()) {
      return "0";
    }
    return version.trim().replaceFirst("^[vV]", "").split("-", 2)[0];
  }

  private int parsePart(String part) {
    try {
      return Integer.parseInt(part.replaceAll("[^0-9].*$", ""));
    } catch (NumberFormatException exception) {
      return 0;
    }
  }

  private boolean equalsIgnoreCase(String left, String right) {
    return left != null && left.equalsIgnoreCase(right);
  }

  public record Request(String currentVersion, String platform, String architecture, String channel, String installationId) {
  }

  public record Selection(boolean available, DesktopReleaseEntity release) {
  }
}
