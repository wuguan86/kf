package com.shijie.transit.userapi.wechat;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.LinkedHashMap;
import java.util.Map;
import java.nio.charset.StandardCharsets;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class WeChatClient {
  private final RestClient restClient;
  private final ObjectMapper objectMapper;

  public WeChatClient(ObjectMapper objectMapper) {
    this.restClient = RestClient.create();
    this.objectMapper = objectMapper;
  }

  public WeChatAccessTokenResponse exchangeCodeForToken(String appId, String appSecret, String code) {
    byte[] responseBody = restClient.get()
        .uri(uriBuilder -> uriBuilder
            .scheme("https")
            .host("api.weixin.qq.com")
            .path("/sns/oauth2/access_token")
            .queryParam("appid", appId)
            .queryParam("secret", appSecret)
            .queryParam("code", code)
            .queryParam("grant_type", "authorization_code")
            .build())
        .retrieve()
        .body(byte[].class);

    try {
      String response = responseBody == null ? "" : new String(responseBody, StandardCharsets.UTF_8);
      return objectMapper.readValue(response, WeChatAccessTokenResponse.class);
    } catch (JsonProcessingException e) {
      throw new RuntimeException("Failed to parse WeChat access token response", e);
    }
  }

  public WeChatUserInfoResponse fetchUserInfo(String accessToken, String openId) {
    byte[] responseBody = restClient.get()
        .uri(uriBuilder -> uriBuilder
            .scheme("https")
            .host("api.weixin.qq.com")
            .path("/sns/userinfo")
            .queryParam("access_token", accessToken)
            .queryParam("openid", openId)
            .build())
        .retrieve()
        .body(byte[].class);

    try {
      String response = responseBody == null ? "" : new String(responseBody, StandardCharsets.UTF_8);
      return objectMapper.readValue(response, WeChatUserInfoResponse.class);
    } catch (JsonProcessingException e) {
      throw new RuntimeException("Failed to parse WeChat user info response", e);
    }
  }

  public MpAccessTokenResult fetchMpAccessToken(String appId, String appSecret) {
    byte[] responseBody = restClient.get()
        .uri(uriBuilder -> uriBuilder
            .scheme("https")
            .host("api.weixin.qq.com")
            .path("/cgi-bin/token")
            .queryParam("grant_type", "client_credential")
            .queryParam("appid", appId)
            .queryParam("secret", appSecret)
            .build())
        .retrieve()
        .body(byte[].class);

    try {
      String response = responseBody == null ? "" : new String(responseBody, StandardCharsets.UTF_8);
      JsonNode root = objectMapper.readTree(response);
      Integer errCode = root.hasNonNull("errcode") ? root.get("errcode").asInt() : null;
      String errMsg = root.hasNonNull("errmsg") ? root.get("errmsg").asText() : null;
      String accessToken = root.hasNonNull("access_token") ? root.get("access_token").asText() : null;
      int expiresIn = root.hasNonNull("expires_in") ? root.get("expires_in").asInt() : 0;
      return new MpAccessTokenResult(accessToken, expiresIn, errCode, errMsg, response);
    } catch (JsonProcessingException e) {
      throw new RuntimeException("Failed to parse WeChat mp access token response", e);
    }
  }

  public MpQrCodeCreateResult createMpQrCode(String accessToken, String sceneStr, int expireSeconds) {
    Map<String, Object> payload = new LinkedHashMap<>();
    payload.put("expire_seconds", expireSeconds);
    payload.put("action_name", "QR_STR_SCENE");
    payload.put("action_info", Map.of("scene", Map.of("scene_str", sceneStr)));

    try {
      String jsonBody = objectMapper.writeValueAsString(payload);
      byte[] responseBody = restClient.post()
          .uri(uriBuilder -> uriBuilder
              .scheme("https")
              .host("api.weixin.qq.com")
              .path("/cgi-bin/qrcode/create")
              .queryParam("access_token", accessToken)
              .build())
          .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
          .body(jsonBody)
          .retrieve()
          .body(byte[].class);

      String response = responseBody == null ? "" : new String(responseBody, StandardCharsets.UTF_8);
      JsonNode root = objectMapper.readTree(response);
      Integer errCode = root.hasNonNull("errcode") ? root.get("errcode").asInt() : null;
      String errMsg = root.hasNonNull("errmsg") ? root.get("errmsg").asText() : null;
      String ticket = root.hasNonNull("ticket") ? root.get("ticket").asText() : null;
      Integer expiresIn = root.hasNonNull("expire_seconds") ? root.get("expire_seconds").asInt() : null;
      String url = root.hasNonNull("url") ? root.get("url").asText() : null;
      return new MpQrCodeCreateResult(ticket, expiresIn, url, errCode, errMsg, response);
    } catch (JsonProcessingException e) {
      throw new RuntimeException("Failed to parse WeChat mp qrcode response", e);
    } catch (org.springframework.web.client.HttpClientErrorException e) {
       throw new RuntimeException("WeChat API Error: " + e.getStatusCode() + " " + e.getResponseBodyAsString(), e);
    }
  }

  public MpUserInfoResult fetchMpUserInfo(String accessToken, String openId) {
    byte[] responseBody = restClient.get()
        .uri(uriBuilder -> uriBuilder
            .scheme("https")
            .host("api.weixin.qq.com")
            .path("/cgi-bin/user/info")
            .queryParam("access_token", accessToken)
            .queryParam("openid", openId)
            .queryParam("lang", "zh_CN")
            .build())
        .retrieve()
        .body(byte[].class);

    try {
      String response = responseBody == null ? "" : new String(responseBody, StandardCharsets.UTF_8);
      JsonNode root = objectMapper.readTree(response);
      Integer errCode = root.hasNonNull("errcode") ? root.get("errcode").asInt() : null;
      String errMsg = root.hasNonNull("errmsg") ? root.get("errmsg").asText() : null;
      Integer subscribe = root.hasNonNull("subscribe") ? root.get("subscribe").asInt() : null;
      String nickname = root.hasNonNull("nickname") ? root.get("nickname").asText() : null;
      String avatarUrl = root.hasNonNull("headimgurl") ? root.get("headimgurl").asText() : null;
      String unionId = root.hasNonNull("unionid") ? root.get("unionid").asText() : null;
      return new MpUserInfoResult(subscribe, nickname, avatarUrl, unionId, errCode, errMsg, response);
    } catch (JsonProcessingException e) {
      throw new RuntimeException("Failed to parse WeChat mp user info response", e);
    }
  }

  public record MpAccessTokenResult(
      String accessToken,
      int expiresInSeconds,
      Integer errCode,
      String errMsg,
      String rawJson) {
  }

  public record MpQrCodeCreateResult(
      String ticket,
      Integer expireSeconds,
      String url,
      Integer errCode,
      String errMsg,
      String rawJson) {
  }

  public record MpUserInfoResult(
      Integer subscribe,
      String nickname,
      String avatarUrl,
      String unionId,
      Integer errCode,
      String errMsg,
      String rawJson) {
  }
}
