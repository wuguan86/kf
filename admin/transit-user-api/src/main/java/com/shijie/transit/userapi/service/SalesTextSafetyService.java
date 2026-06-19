package com.shijie.transit.userapi.service;

import java.util.regex.Pattern;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

/**
 * 销售 AI 文案安全过滤。AI 只能给人工参考，不能把高风险内容直接填入可发送草稿。
 */
@Service
public class SalesTextSafetyService {
  private static final int FOLLOW_UP_MAX_LENGTH = 150;
  private static final int PROFILE_MAX_LENGTH = 200;
  private static final Pattern URL_PATTERN = Pattern.compile(
      "(?i)(https?://|www\\.|[a-z0-9][a-z0-9.-]+\\.(com|cn|net|org|io|ai))");
  private static final Pattern PHONE_PATTERN = Pattern.compile("(?<!\\d)1[3-9]\\d{9}(?!\\d)");
  private static final Pattern WECHAT_PATTERN = Pattern.compile("(?i)(微信|weixin|v信|wx)[:：\\s]*[a-z][a-z0-9_-]{5,}");
  private static final Pattern PROMISE_PATTERN = Pattern.compile("(保证|一定成交|包过|稳赚|必然成交|100%|百分百|无风险)");

  public SafetyResult checkFollowUpSuggestion(String text) {
    return check(text, FOLLOW_UP_MAX_LENGTH);
  }

  public SafetyResult checkProfileText(String text) {
    return check(text, PROFILE_MAX_LENGTH);
  }

  private SafetyResult check(String text, int maxLength) {
    String value = text == null ? "" : text.trim();
    if (!StringUtils.hasText(value)) {
      return new SafetyResult(true, "", "");
    }
    if (value.length() > maxLength) {
      return new SafetyResult(false, "", "AI 建议过长，请人工精简后再使用");
    }
    if (URL_PATTERN.matcher(value).find()
        || PHONE_PATTERN.matcher(value).find()
        || WECHAT_PATTERN.matcher(value).find()
        || PROMISE_PATTERN.matcher(value).find()) {
      return new SafetyResult(false, "", "AI 建议包含链接、联系方式或绝对承诺，请人工编辑后再使用");
    }
    return new SafetyResult(true, value, "");
  }

  public record SafetyResult(boolean safe, String safeText, String reason) {
  }
}
