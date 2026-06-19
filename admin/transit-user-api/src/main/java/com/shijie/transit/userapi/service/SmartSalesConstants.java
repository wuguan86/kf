package com.shijie.transit.userapi.service;

import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 智能销售公共常量。集中定义枚举值，避免客户、跟进和统计服务各自维护一份。
 */
final class SmartSalesConstants {
  static final List<String> STAGE_ORDER = List.of("LEAD", "FOLLOWING", "INTENDED", "WON", "LOST");
  static final Map<String, String> STAGE_LABELS = Map.of(
      "LEAD", "线索",
      "FOLLOWING", "跟进中",
      "INTENDED", "明确意向",
      "WON", "已成交",
      "LOST", "已流失");
  static final Set<String> VALID_SOURCES = Set.of("GROUP", "SCAN", "REFERRAL", "IMPORT", "UNKNOWN");
  static final Set<String> VALID_FOLLOW_UP_TYPES = Set.of("PHONE", "WECHAT", "MEETING", "NOTE");

  private SmartSalesConstants() {
  }
}
