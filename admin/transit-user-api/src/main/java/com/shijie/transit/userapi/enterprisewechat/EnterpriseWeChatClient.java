package com.shijie.transit.userapi.enterprisewechat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
public class EnterpriseWeChatClient {
  private static final Logger log = LoggerFactory.getLogger(EnterpriseWeChatClient.class);
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
      log.info("企业微信 access_token 使用缓存，corpIdConfigured={}，expiresAt={}",
          StringUtils.hasText(config.corpId()), cached.expiresAt());
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
      log.info("企业微信 access_token 响应，httpStatus={}，errcode={}，bodyLength={}",
          response.statusCode(), errCode, safeLength(response.body()));
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
      log.info("企业微信发送客服消息响应，httpStatus={}，errcode={}，openKfid={}，customerId={}，bodyLength={}",
          response.statusCode(), errCode, maskMiddle(openKfid), maskMiddle(externalUserId), safeLength(response.body()));
      if (errCode != null && Integer.parseInt(String.valueOf(errCode)) != 0) {
        throw new IllegalStateException("企业微信消息发送失败: " + payload);
      }
    } catch (IllegalStateException ex) {
      throw ex;
    } catch (Exception ex) {
      throw new IllegalStateException("企业微信消息发送失败", ex);
    }
  }

  public CustomerServiceState getCustomerServiceState(
      EnterpriseWeChatConfigService.EnterpriseWeChatRuntimeConfig config,
      String openKfid,
      String externalUserId) {
    if (!StringUtils.hasText(openKfid) || !StringUtils.hasText(externalUserId)) {
      throw new IllegalArgumentException("企业微信会话状态查询参数不完整");
    }
    String accessToken = getAccessToken(config);
    try {
      String url = config.apiBaseUrl() + "/cgi-bin/kf/service_state/get?access_token="
          + URLEncoder.encode(accessToken, StandardCharsets.UTF_8);
      String body = objectMapper.writeValueAsString(Map.of(
          "open_kfid", openKfid.trim(),
          "external_userid", externalUserId.trim()));
      HttpRequest request = HttpRequest.newBuilder(URI.create(url))
          .header("Content-Type", "application/json")
          .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
          .build();
      HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
      JsonNode root = objectMapper.readTree(response.body());
      int errCode = root.path("errcode").asInt(0);
      int serviceState = root.path("service_state").asInt(-1);
      String servicerUserId = text(root, "servicer_userid");
      log.info("企业微信会话状态查询响应，httpStatus={}，errcode={}，serviceState={}，openKfid={}，customerId={}，servicerUserId={}，bodyLength={}",
          response.statusCode(), errCode, serviceState, maskMiddle(openKfid), maskMiddle(externalUserId), maskMiddle(servicerUserId), safeLength(response.body()));
      if (errCode != 0) {
        throw new IllegalStateException("企业微信会话状态查询失败: " + response.body());
      }
      return new CustomerServiceState(serviceState, servicerUserId);
    } catch (IllegalStateException ex) {
      throw ex;
    } catch (Exception ex) {
      throw new IllegalStateException("企业微信会话状态查询请求失败", ex);
    }
  }

  public void transferCustomerServiceState(
      EnterpriseWeChatConfigService.EnterpriseWeChatRuntimeConfig config,
      String openKfid,
      String externalUserId,
      String servicerUserId) {
    transferCustomerServiceState(config, openKfid, externalUserId, 3, servicerUserId);
  }

  public void transferCustomerServiceState(
      EnterpriseWeChatConfigService.EnterpriseWeChatRuntimeConfig config,
      String openKfid,
      String externalUserId,
      int serviceState,
      String servicerUserId) {
    transferCustomerServiceStateAndGetMessageCode(config, openKfid, externalUserId, serviceState, servicerUserId);
  }

  public String transferCustomerServiceStateAndGetMessageCode(
      EnterpriseWeChatConfigService.EnterpriseWeChatRuntimeConfig config,
      String openKfid,
      String externalUserId,
      int serviceState,
      String servicerUserId) {
    if (!StringUtils.hasText(openKfid) || !StringUtils.hasText(externalUserId)) {
      throw new IllegalArgumentException("企业微信会话状态切换参数不完整");
    }
    if (serviceState == 3 && !StringUtils.hasText(servicerUserId)) {
      throw new IllegalArgumentException("企业微信会话状态切换参数不完整");
    }
    String accessToken = getAccessToken(config);
    try {
      String url = config.apiBaseUrl() + "/cgi-bin/kf/service_state/trans?access_token="
          + URLEncoder.encode(accessToken, StandardCharsets.UTF_8);
      Map<String, Object> requestBody = new LinkedHashMap<>();
      requestBody.put("open_kfid", openKfid.trim());
      requestBody.put("external_userid", externalUserId.trim());
      requestBody.put("service_state", serviceState);
      if (StringUtils.hasText(servicerUserId)) {
        requestBody.put("servicer_userid", servicerUserId.trim());
      }
      String body = objectMapper.writeValueAsString(requestBody);
      HttpRequest request = HttpRequest.newBuilder(URI.create(url))
          .header("Content-Type", "application/json")
          .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
          .build();
      HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
      Map<?, ?> payload = objectMapper.readValue(response.body(), Map.class);
      Object errCode = payload.get("errcode");
      log.info("企业微信会话状态切换响应，httpStatus={}，errcode={}，serviceState={}，openKfid={}，customerId={}，servicerUserId={}，bodyLength={}",
          response.statusCode(), errCode, serviceState, maskMiddle(openKfid), maskMiddle(externalUserId), maskMiddle(servicerUserId), safeLength(response.body()));
      if (errCode != null && Integer.parseInt(String.valueOf(errCode)) != 0) {
        throw new IllegalStateException("企业微信会话状态切换失败: " + payload);
      }
      Object messageCode = payload.get("msg_code");
      return messageCode == null ? "" : String.valueOf(messageCode);
    } catch (IllegalStateException ex) {
      throw ex;
    } catch (Exception ex) {
      throw new IllegalStateException("企业微信会话状态切换请求失败", ex);
    }
  }

  public void sendCustomerEventMessage(
      EnterpriseWeChatConfigService.EnterpriseWeChatRuntimeConfig config,
      String messageCode,
      String text) {
    if (!StringUtils.hasText(messageCode) || !StringUtils.hasText(text)) {
      throw new IllegalArgumentException("企业微信事件响应消息发送参数不完整");
    }
    String accessToken = getAccessToken(config);
    try {
      String url = config.apiBaseUrl() + "/cgi-bin/kf/send_msg_on_event?access_token="
          + URLEncoder.encode(accessToken, StandardCharsets.UTF_8);
      String body = objectMapper.writeValueAsString(Map.of(
          "code", messageCode.trim(),
          "msgtype", "text",
          "text", Map.of("content", text.trim())));
      HttpRequest request = HttpRequest.newBuilder(URI.create(url))
          .header("Content-Type", "application/json")
          .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
          .build();
      HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
      Map<?, ?> payload = objectMapper.readValue(response.body(), Map.class);
      Object errCode = payload.get("errcode");
      log.info("企业微信事件响应消息发送响应，httpStatus={}，errcode={}，msgCodeConfigured={}，bodyLength={}",
          response.statusCode(), errCode, StringUtils.hasText(messageCode), safeLength(response.body()));
      if (errCode != null && Integer.parseInt(String.valueOf(errCode)) != 0) {
        throw new IllegalStateException("企业微信事件响应消息发送失败: " + payload);
      }
    } catch (IllegalStateException ex) {
      throw ex;
    } catch (Exception ex) {
      throw new IllegalStateException("企业微信事件响应消息发送请求失败", ex);
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
      int safeLimit = Math.max(1, Math.min(limit, 1000));
      log.info("企业微信同步客服消息请求，openKfid={}，cursorConfigured={}，limit={}",
          maskMiddle(openKfid), StringUtils.hasText(cursor), safeLimit);
      String url = config.apiBaseUrl() + "/cgi-bin/kf/sync_msg?access_token=" + URLEncoder.encode(accessToken, StandardCharsets.UTF_8);
      String body = objectMapper.writeValueAsString(Map.of(
          "open_kfid", openKfid.trim(),
          "token", syncToken.trim(),
          "cursor", StringUtils.hasText(cursor) ? cursor.trim() : "",
          "limit", safeLimit));
      HttpRequest request = HttpRequest.newBuilder(URI.create(url))
          .header("Content-Type", "application/json")
          .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
          .build();
      HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
      Map<?, ?> payload = objectMapper.readValue(response.body(), Map.class);
      Object errCode = payload.get("errcode");
      Object hasMore = payload.get("has_more");
      Object nextCursor = payload.get("next_cursor");
      Object msgList = payload.get("msg_list");
      int msgCount = msgList instanceof java.util.List<?> list ? list.size() : -1;
      log.info("企业微信同步客服消息响应，httpStatus={}，errcode={}，hasMore={}，nextCursorConfigured={}，msgCount={}，bodyLength={}",
          response.statusCode(), errCode, hasMore, StringUtils.hasText(nextCursor == null ? "" : String.valueOf(nextCursor)), msgCount, safeLength(response.body()));
      if (errCode != null && Integer.parseInt(String.valueOf(errCode)) != 0) {
        throw new IllegalStateException("企业微信同步消息失败: " + payload);
      }
      return response.body();
    } catch (Exception ex) {
      throw new IllegalStateException("企业微信同步消息请求失败", ex);
    }
  }

  public Map<String, String> fetchCustomerDisplayNames(
      EnterpriseWeChatConfigService.EnterpriseWeChatRuntimeConfig config,
      List<String> externalUserIds) {
    List<String> safeIds = externalUserIds == null ? List.of() : externalUserIds.stream()
        .filter(StringUtils::hasText)
        .map(String::trim)
        .distinct()
        .limit(100)
        .toList();
    if (safeIds.isEmpty()) {
      return Map.of();
    }
    String accessToken = getAccessToken(config);
    try {
      String url = config.apiBaseUrl() + "/cgi-bin/kf/customer/batchget?access_token="
          + URLEncoder.encode(accessToken, StandardCharsets.UTF_8);
      String body = objectMapper.writeValueAsString(Map.of("external_userid_list", safeIds));
      HttpRequest request = HttpRequest.newBuilder(URI.create(url))
          .header("Content-Type", "application/json")
          .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
          .build();
      HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
      JsonNode root = objectMapper.readTree(response.body());
      int errCode = root.path("errcode").asInt(0);
      log.info("企业微信客户基础信息响应，httpStatus={}，errcode={}，requestCount={}，bodyLength={}",
          response.statusCode(), errCode, safeIds.size(), safeLength(response.body()));
      if (errCode != 0) {
        throw new IllegalStateException("企业微信客户基础信息查询失败: " + response.body());
      }
      Map<String, String> names = new java.util.HashMap<>();
      JsonNode customerList = root.path("customer_list");
      if (customerList.isArray()) {
        for (JsonNode item : customerList) {
          String externalUserId = text(item, "external_userid");
          String name = firstText(text(item, "nickname"), text(item, "name"));
          if (StringUtils.hasText(externalUserId) && StringUtils.hasText(name)) {
            names.put(externalUserId.trim(), name.trim());
          }
        }
      }
      return names;
    } catch (Exception ex) {
      throw new IllegalStateException("企业微信客户基础信息请求失败", ex);
    }
  }

  private int safeLength(String value) {
    return value == null ? 0 : value.length();
  }

  private String maskMiddle(String value) {
    if (!StringUtils.hasText(value)) {
      return "";
    }
    String trimmed = value.trim();
    if (trimmed.length() <= 8) {
      return "***";
    }
    return trimmed.substring(0, 4) + "***" + trimmed.substring(trimmed.length() - 4);
  }

  private String text(JsonNode node, String field) {
    JsonNode value = node == null ? null : node.get(field);
    if (value == null || value.isNull()) {
      return "";
    }
    return value.asText("");
  }

  private String firstText(String... values) {
    for (String value : values) {
      if (StringUtils.hasText(value)) {
        return value.trim();
      }
    }
    return "";
  }

  private record CachedAccessToken(String accessToken, Instant expiresAt) {
  }

  public record CustomerServiceState(int serviceState, String servicerUserId) {
  }
}
