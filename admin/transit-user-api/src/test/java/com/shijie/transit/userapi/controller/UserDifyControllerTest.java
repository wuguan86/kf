package com.shijie.transit.userapi.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class UserDifyControllerTest {

  @Test
  void resolveContactDisplayNamePrefersCustomerNameOverSessionKey() {
    UserDifyController.MonitorChatRequest request = new UserDifyController.MonitorChatRequest(
        1L,
        "好吧，等下发给你",
        "",
        "",
        "enterprise:wmsCDuPQAAF5Epp_3RBTV-ouHTG3v5NA",
        "暗夜",
        "",
        "");

    assertEquals("暗夜", UserDifyController.resolveContactDisplayName(request));
  }
}
