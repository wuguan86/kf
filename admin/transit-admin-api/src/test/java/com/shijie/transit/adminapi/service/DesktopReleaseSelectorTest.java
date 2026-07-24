package com.shijie.transit.adminapi.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.shijie.transit.common.db.entity.DesktopReleaseEntity;
import java.util.List;
import org.junit.jupiter.api.Test;

class DesktopReleaseSelectorTest {

  private final DesktopReleaseSelector selector = new DesktopReleaseSelector();

  @Test
  void selectsPublishedNewerReleaseForMatchingStableCohort() {
    DesktopReleaseEntity release = release("2.5.0", "PUBLISHED", 100);

    DesktopReleaseSelector.Selection selection = selector.select(
        List.of(release), new DesktopReleaseSelector.Request("2.4.8", "win32", "x64", "stable", "install-a"));

    assertTrue(selection.available());
    assertEquals("2.5.0", selection.release().getVersion());
  }

  @Test
  void doesNotSelectPausedOrOlderRelease() {
    DesktopReleaseEntity paused = release("2.5.0", "PAUSED", 100);
    DesktopReleaseEntity older = release("2.4.7", "PUBLISHED", 100);

    DesktopReleaseSelector.Selection selection = selector.select(
        List.of(paused, older), new DesktopReleaseSelector.Request("2.4.8", "win32", "x64", "stable", "install-a"));

    assertFalse(selection.available());
  }

  @Test
  void assignsTheSameAnonymousInstallationToTheSameGrayCohort() {
    DesktopReleaseEntity release = release("2.5.0", "PUBLISHED", 37);
    DesktopReleaseSelector.Request request = new DesktopReleaseSelector.Request("2.4.8", "win32", "x64", "stable", "install-a");

    boolean first = selector.select(List.of(release), request).available();
    boolean second = selector.select(List.of(release), request).available();

    assertEquals(first, second);
  }

  private DesktopReleaseEntity release(String version, String status, int rolloutPercentage) {
    DesktopReleaseEntity release = new DesktopReleaseEntity();
    release.setVersion(version);
    release.setPlatform("win32");
    release.setArchitecture("x64");
    release.setChannel("stable");
    release.setStatus(status);
    release.setRolloutPercentage(rolloutPercentage);
    return release;
  }
}
