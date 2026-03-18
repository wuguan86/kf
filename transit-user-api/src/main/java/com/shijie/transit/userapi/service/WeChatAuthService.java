package com.shijie.transit.userapi.service;

import com.shijie.transit.common.security.JwtService;
import com.shijie.transit.common.security.TransitJwtClaims;
import com.shijie.transit.common.tenant.TenantContext;
import com.shijie.transit.common.db.entity.UserAccountEntity;
import com.shijie.transit.userapi.wechat.WeChatClient;
import com.shijie.transit.userapi.wechat.WeChatLoginStateStore;
import com.shijie.transit.userapi.wechat.WeChatOpenProperties;
import java.time.Clock;
import java.time.Instant;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
public class WeChatAuthService {
  private final WeChatOpenProperties properties;
  private final WeChatClient weChatClient;
  private final WeChatLoginStateStore stateStore;
  private final UserAccountService userAccountService;
  private final DefaultKnowledgeBaseInitService defaultKnowledgeBaseInitService;
  private final JwtService jwtService;
  private final Clock clock;
  private volatile MpAccessTokenCache mpAccessTokenCache;

  public WeChatAuthService(
      WeChatOpenProperties properties,
      WeChatClient weChatClient,
      WeChatLoginStateStore stateStore,
      UserAccountService userAccountService,
      DefaultKnowledgeBaseInitService defaultKnowledgeBaseInitService,
      JwtService jwtService,
      Clock clock) {
    this.properties = properties;
    this.weChatClient = weChatClient;
    this.stateStore = stateStore;
    this.userAccountService = userAccountService;
    this.defaultKnowledgeBaseInitService = defaultKnowledgeBaseInitService;
    this.jwtService = jwtService;
    this.clock = clock;
  }

  public QrCodeResult createQrCode(long tenantId, String redirect) {
    String state = stateStore.createState(tenantId, redirect);
    if (state.length() > 64) {
      throw new IllegalStateException("scene too long");
    }

    String accessToken = getMpAccessToken();
    WeChatClient.MpQrCodeCreateResult resp = weChatClient.createMpQrCode(accessToken, state, 600);
    if (resp.errCode() != null && resp.errCode() != 0) {
      throw new IllegalStateException("wechat mp qrcode failed: errcode=" + resp.errCode() + ", errmsg=" + resp.errMsg());
    }
    if (!StringUtils.hasText(resp.ticket())) {
      throw new IllegalStateException("wechat mp qrcode missing ticket");
    }

    String ticketEncoded = URLEncoder.encode(resp.ticket(), StandardCharsets.UTF_8);
    String qrImageUrl = "https://mp.weixin.qq.com/cgi-bin/showqrcode?ticket=" + ticketEncoded;
    return new QrCodeResult(qrImageUrl, state);
  }

  public void handleScanLogin(String openId, String state) {
    if (!StringUtils.hasText(openId) || !StringUtils.hasText(state)) {
      return;
    }
    String safeOpenId = openId.trim();
    String safeState = state.trim();

    WeChatLoginStateStore.Snapshot snapshot = stateStore.snapshot(safeState);
    if (snapshot.status() == WeChatLoginStateStore.Status.INVALID
        || snapshot.status() == WeChatLoginStateStore.Status.EXPIRED) {
      return;
    }
    if (snapshot.status() == WeChatLoginStateStore.Status.COMPLETED) {
      return;
    }

    WeChatLoginStateStore.StateValue stateValue = stateStore.beginCallback(safeState);
    if (stateValue == null) {
      return;
    }

    TenantContext.setTenantId(stateValue.tenantId());
    try {
      String mpAccessToken = getMpAccessToken();
      WeChatClient.MpUserInfoResult userInfo = weChatClient.fetchMpUserInfo(mpAccessToken, safeOpenId);

      String nickname = null;
      String avatarUrl = null;
      String unionId = null;
      if (userInfo.errCode() == null || userInfo.errCode() == 0) {
        if (userInfo.subscribe() != null && userInfo.subscribe() == 1) {
          nickname = userInfo.nickname();
          avatarUrl = userInfo.avatarUrl();
          unionId = userInfo.unionId();
        }
      }
      if (StringUtils.hasText(avatarUrl) && avatarUrl.startsWith("http://")) {
        avatarUrl = "https://" + avatarUrl.substring("http://".length());
      }

      UserAccountService.UpsertResult upsertResult = userAccountService.upsertByWeChat(safeOpenId, unionId, nickname, avatarUrl);
      UserAccountEntity user = upsertResult.user();
      if (upsertResult.needInitialize()) {
        defaultKnowledgeBaseInitService.initOnFirstLoginAsync(stateValue.tenantId(), user.getId());
      }
      String jwt = jwtService.issueToken(new TransitJwtClaims(user.getId(), stateValue.tenantId(), "USER"));
      stateStore.complete(
          safeState,
          new WeChatLoginStateStore.CallbackValue(jwt, user.getId(), stateValue.tenantId(), upsertResult.needInitialize()));
    } catch (RuntimeException e) {
      stateStore.fail(safeState);
      throw e;
    } finally {
      TenantContext.clear();
    }
  }

  public LoginPollResult pollLogin(String state) {
    WeChatLoginStateStore.PollResult poll = stateStore.poll(state);
    if (poll.callbackValue() == null) {
      return new LoginPollResult(poll.status().name(), null, null, null, false);
    }
    return new LoginPollResult(
        poll.status().name(),
        poll.callbackValue().token(),
        poll.callbackValue().userId(),
        poll.callbackValue().tenantId(),
        poll.callbackValue().initializing());
  }

  public record QrCodeResult(String url, String state) {
  }

  public record LoginPollResult(String status, String token, Long userId, Long tenantId, boolean initializing) {
  }

  private String getMpAccessToken() {
    MpAccessTokenCache cache = mpAccessTokenCache;
    Instant now = Instant.now(clock);
    if (cache != null && cache.expiresAt().isAfter(now)) {
      return cache.accessToken();
    }
    WeChatClient.MpAccessTokenResult resp = weChatClient.fetchMpAccessToken(properties.getAppId(), properties.getAppSecret());
    if (resp.errCode() != null && resp.errCode() != 0) {
      throw new IllegalStateException("wechat mp access_token failed: errcode=" + resp.errCode() + ", errmsg=" + resp.errMsg());
    }
    if (!StringUtils.hasText(resp.accessToken()) || resp.expiresInSeconds() <= 0) {
      throw new IllegalStateException("wechat mp access_token missing fields");
    }
    Instant expiresAt = now.plusSeconds(Math.max(0, resp.expiresInSeconds() - 60L));
    mpAccessTokenCache = new MpAccessTokenCache(resp.accessToken(), expiresAt);
    return resp.accessToken();
  }

  private record MpAccessTokenCache(String accessToken, Instant expiresAt) {
  }
}
