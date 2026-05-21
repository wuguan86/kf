package com.shijie.transit.userapi.enterprisewechat;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
public class EnterpriseWeChatClient {
  private final ObjectMapper objectMapper;
  private final Clock clock;
  private final Map<String, CachedAccessToken> tokenCache = new ConcurrentHashMap<>();
  private final HttpClient httpClient = HttpClient.newHttpClient();

  public EnterpriseWeChatClient(ObjectMapper objectMapper, Clock clock) {
    this.objectMapper = objectMapper;
    this.clock = clock;
  }

  public String getAccessToken(EnterpriseWeChatConfigService.EnterpriseWeChatRuntimeConfig config) {
    String cacheKey = config.corpId();
    CachedAccessToken cached = tokenCache.get(cacheKey);
    Instant now = Instant.now(clock);
    if (cached != null && cached.expiresAt().isAfter(now)) {
      return cached.accessToken();
    }
    if (!StringUtils.hasText(config.corpId()) || !StringUtils.hasText(config.secret())) {
      throw new IllegalStateException("企业微信 corpId 或 secret 未配置");
    }
    try {
      String url = config.apiBaseUrl() + "/cgi-bin/gettoken?corpid="
          + URLEncoder.encode(config.corpId(), StandardCharsets.UTF_8)
          + "&corpsecret=" + URLEncoder.encode(config.secret(), StandardCharsets.UTF_8);
      HttpRequest request = HttpRequest.newBuilder(URI.create(url)).GET().build();
      HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
      Map<?, ?> payload = objectMapper.readValue(response.body(), Map.class);
      Object errCode = payload.get("errcode");
      if (errCode != null && Integer.parseInt(String.valueOf(errCode)) != 0) {
        throw new IllegalStateException("企业微信 access_token 获取失败: " + payload);
      }
      String accessToken = String.valueOf(payload.get("access_token"));
      Number expiresIn = (Number) payload.get("expires_in");
      if (!StringUtils.hasText(accessToken) || expiresIn == null) {
        throw new IllegalStateException("企业微信 access_token 返回缺少字段");
      }
      tokenCache.put(cacheKey, new CachedAccessToken(accessToken, now.plusSeconds(Math.max(60, expiresIn.longValue() - 120L))));
      return accessToken;
    } catch (Exception ex) {
      throw new IllegalStateException("企业微信 access_token 请求失败", ex);
    }
  }

  public void sendCustomerMessage(
      EnterpriseWeChatConfigService.EnterpriseWeChatRuntimeConfig config,
      String openKfid,
      String externalUserId,
      String text) {
    if (!StringUtils.hasText(openKfid) || !StringUtils.hasText(externalUserId) || !StringUtils.hasText(text)) {
      throw new IllegalArgumentException("企业微信发送参数不完整");
    }
    String accessToken = getAccessToken(config);
    try {
      String url = config.apiBaseUrl() + "/cgi-bin/kf/send_msg?access_token=" + URLEncoder.encode(accessToken, StandardCharsets.UTF_8);
      String body = objectMapper.writeValueAsString(Map.of(
          "touser", externalUserId.trim(),
          "open_kfid", openKfid.trim(),
          "msgtype", "text",
          "text", Map.of("content", text.trim())));
      HttpRequest request = HttpRequest.newBuilder(URI.create(url))
          .header("Content-Type", "application/json")
          .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
          .build();
      HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
      Map<?, ?> payload = objectMapper.readValue(response.body(), Map.class);
      Object errCode = payload.get("errcode");
      if (errCode != null && Integer.parseInt(String.valueOf(errCode)) != 0) {
        throw new IllegalStateException("企业微信消息发送失败: " + payload);
      }
    } catch (Exception ex) {
      throw new IllegalStateException("企业微信消息发送失败", ex);
    }
  }

  public String syncCustomerMessages(
      EnterpriseWeChatConfigService.EnterpriseWeChatRuntimeConfig config,
      String openKfid,
      String syncToken,
      String cursor,
      int limit) {
    if (!StringUtils.hasText(openKfid) || !StringUtils.hasText(syncToken)) {
      throw new IllegalArgumentException("企业微信同步消息参数不完整");
    }
    String accessToken = getAccessToken(config);
    try {
      String url = config.apiBaseUrl() + "/cgi-bin/kf/sync_msg?access_token=" + URLEncoder.encode(accessToken, StandardCharsets.UTF_8);
      String body = objectMapper.writeValueAsString(Map.of(
          "open_kfid", openKfid.trim(),
          "token", syncToken.trim(),
          "cursor", StringUtils.hasText(cursor) ? cursor.trim() : "",
          "limit", Math.max(1, Math.min(limit, 1000))));
      HttpRequest request = HttpRequest.newBuilder(URI.create(url))
          .header("Content-Type", "application/json")
          .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
          .build();
      HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
      Map<?, ?> payload = objectMapper.readValue(response.body(), Map.class);
      Object errCode = payload.get("errcode");
      if (errCode != null && Integer.parseInt(String.valueOf(errCode)) != 0) {
        throw new IllegalStateException("企业微信同步消息失败: " + payload);
      }
      return response.body();
    } catch (Exception ex) {
      throw new IllegalStateException("企业微信同步消息请求失败", ex);
    }
  }

  private record CachedAccessToken(String accessToken, Instant expiresAt) {
  }
}
