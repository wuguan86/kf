package com.shijie.transit.userapi.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.shijie.transit.common.db.entity.MembershipPlanEntity;
import com.shijie.transit.common.db.entity.PaymentConfigEntity;
import com.shijie.transit.common.db.entity.PaymentOrderEntity;
import com.shijie.transit.common.mapper.MembershipPlanMapper;
import com.shijie.transit.common.mapper.PaymentConfigMapper;
import com.shijie.transit.common.tenant.TenantContext;
import com.shijie.transit.common.web.ErrorCode;
import com.shijie.transit.common.web.TransitException;
import com.shijie.transit.userapi.mapper.PaymentOrderMapper;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Base64;
import java.util.Locale;
import java.util.UUID;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

@Service
public class WeChatPayService {
  private static final String WECHAT_METHOD = "WECHAT";
  private static final String WECHAT_BASE_URL = "https://api.mch.weixin.qq.com";
  private static final String NATIVE_PATH = "/v3/pay/transactions/native";
  private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ISO_OFFSET_DATE_TIME;

  private final PaymentConfigMapper paymentConfigMapper;
  private final MembershipPlanMapper membershipPlanMapper;
  private final PaymentOrderMapper paymentOrderMapper;
  private final MembershipEntitlementService membershipEntitlementService;
  private final ObjectMapper objectMapper;
  private final Clock clock;

  public WeChatPayService(
      PaymentConfigMapper paymentConfigMapper,
      MembershipPlanMapper membershipPlanMapper,
      PaymentOrderMapper paymentOrderMapper,
      MembershipEntitlementService membershipEntitlementService,
      ObjectMapper objectMapper,
      Clock clock) {
    this.paymentConfigMapper = paymentConfigMapper;
    this.membershipPlanMapper = membershipPlanMapper;
    this.paymentOrderMapper = paymentOrderMapper;
    this.membershipEntitlementService = membershipEntitlementService;
    this.objectMapper = objectMapper;
    this.clock = clock;
  }

  @Transactional
  public NativeOrderResult createNativeOrder(long userId, long planId, Integer purchaseCount, String clientIp) {
    MembershipPlanEntity plan = membershipPlanMapper.selectById(planId);
    if (plan == null || !Boolean.TRUE.equals(plan.getEnabled())) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "套餐不存在或未上架");
    }
    int safePurchaseCount = membershipEntitlementService.normalizePurchaseCount(plan, purchaseCount);
    membershipEntitlementService.validatePlanPurchase(userId, plan);
    int totalAmountCents = membershipEntitlementService.calculateOrderAmount(plan, safePurchaseCount);

    WeChatConfig config = loadAndValidateConfig();
    Long tenantId = TenantContext.getTenantId();
    if (tenantId == null) {
      throw new TransitException(ErrorCode.TENANT_ID_REQUIRED, "缺少租户上下文");
    }

    String outTradeNo = buildOutTradeNo(tenantId);
    OffsetDateTime expireTime = OffsetDateTime.now(clock).plusMinutes(15);
    String attachData =
        "tenantId="
            + tenantId
            + "&userId="
            + userId
            + "&planId="
            + planId
            + "&purchaseCount="
            + safePurchaseCount;

    PaymentOrderEntity order = new PaymentOrderEntity();
    order.setTenantId(tenantId);
    order.setOutTradeNo(outTradeNo);
    order.setChannel(WECHAT_METHOD);
    order.setBizType("MEMBERSHIP");
    order.setUserId(userId);
    order.setPlanId(planId);
    order.setTotalAmountCents(totalAmountCents);
    order.setCurrency("CNY");
    order.setStatus("CREATED");
    order.setCodeUrl("");
    order.setPrepayId("");
    order.setTransactionId("");
    order.setTradeState("");
    order.setAttachData(attachData);
    order.setRawNotify("{}");
    order.setErrorMessage("");
    order.setGrantApplied(0);
    order.setExpireAt(LocalDateTime.ofInstant(expireTime.toInstant(), ZoneId.of("Asia/Shanghai")));
    paymentOrderMapper.insert(order);

    ObjectNode request = objectMapper.createObjectNode();
    request.put("appid", config.appId());
    request.put("mchid", config.merchantId());
    request.put("description", StringUtils.hasText(plan.getName()) ? plan.getName() : "会员购买");
    request.put("out_trade_no", outTradeNo);
    request.put("notify_url", config.notifyUrl());
    request.put("time_expire", TIME_FORMATTER.format(expireTime));
    request.put("attach", attachData);

    ObjectNode amount = request.putObject("amount");
    amount.put("total", totalAmountCents);
    amount.put("currency", "CNY");

    ObjectNode scene = request.putObject("scene_info");
    scene.put("payer_client_ip", StringUtils.hasText(clientIp) ? clientIp : "127.0.0.1");

    String body;
    try {
      body = objectMapper.writeValueAsString(request);
    } catch (Exception ex) {
      throw new TransitException(ErrorCode.INTERNAL_ERROR, "组装微信下单参数失败", ex);
    }

    String responseBody;
    try {
      responseBody = restClient().post()
          .uri(NATIVE_PATH)
          .contentType(MediaType.APPLICATION_JSON)
          .header("Authorization", buildAuthorization("POST", NATIVE_PATH, body, config))
          .header("Accept", MediaType.APPLICATION_JSON_VALUE)
          .body(body)
          .retrieve()
          .body(String.class);
    } catch (RestClientResponseException ex) {
      order.setStatus("FAILED");
      order.setErrorMessage(ex.getResponseBodyAsString());
      paymentOrderMapper.updateById(order);
      throw toTransitException(ex, "微信下单失败");
    }

    String codeUrl = readString(responseBody, "code_url");
    String prepayId = readString(responseBody, "prepay_id");
    if (!StringUtils.hasText(codeUrl)) {
      order.setStatus("FAILED");
      order.setErrorMessage(responseBody);
      paymentOrderMapper.updateById(order);
      throw new TransitException(ErrorCode.INTERNAL_ERROR, "微信返回二维码地址为空");
    }

    order.setStatus("PREPAY");
    order.setCodeUrl(codeUrl);
    order.setPrepayId(StringUtils.hasText(prepayId) ? prepayId : "");
    order.setErrorMessage("");
    paymentOrderMapper.updateById(order);
    return new NativeOrderResult(outTradeNo, codeUrl, totalAmountCents, "CNY", expireTime.toString());
  }

  public PaymentOrderStatusResult queryOrder(long userId, String outTradeNo) {
    PaymentOrderEntity order = paymentOrderMapper.selectOne(
        new LambdaQueryWrapper<PaymentOrderEntity>()
            .eq(PaymentOrderEntity::getOutTradeNo, outTradeNo)
            .last("limit 1"));
    if (order == null) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "订单不存在");
    }
    if (order.getUserId() == null || !order.getUserId().equals(userId)) {
      throw new TransitException(ErrorCode.FORBIDDEN, "无权访问该订单");
    }
    return new PaymentOrderStatusResult(
        String.valueOf(order.getId()),
        order.getOutTradeNo(),
        order.getStatus(),
        order.getTradeState(),
        order.getCodeUrl(),
        order.getTotalAmountCents(),
        order.getCurrency(),
        order.getPaidAt() == null ? null : order.getPaidAt().toString(),
        order.getExpireAt() == null ? null : order.getExpireAt().toString());
  }

  @Transactional
  public NotifyAck handleNotify(
      String serial,
      String signature,
      String timestamp,
      String nonce,
      String requestBody) {
    WeChatConfig config = loadAndValidateConfig();
    verifyNotifyHeaders(serial, signature, timestamp, nonce, requestBody, config);

    JsonNode notifyNode = parseJson(requestBody, "微信支付回调报文解析失败");
    JsonNode decryptedNode = decryptNotifyResource(notifyNode, config);

    String outTradeNo = textOf(decryptedNode, "out_trade_no");
    if (!StringUtils.hasText(outTradeNo)) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "微信回调缺少商户订单号");
    }

    Long tenantId = parseTenantId(outTradeNo, textOf(decryptedNode, "attach"));
    if (tenantId == null) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "无法识别回调租户信息");
    }

    TenantContext.setTenantId(tenantId);
    try {
      processNotifyOrder(decryptedNode, requestBody, config);
      return new NotifyAck("{\"code\":\"SUCCESS\",\"message\":\"成功\"}", true);
    } finally {
      TenantContext.clear();
    }
  }

  private void processNotifyOrder(JsonNode node, String rawNotify, WeChatConfig config) {
    String outTradeNo = textOf(node, "out_trade_no");
    PaymentOrderEntity order = paymentOrderMapper.selectOne(
        new LambdaQueryWrapper<PaymentOrderEntity>()
            .eq(PaymentOrderEntity::getOutTradeNo, outTradeNo)
            .last("limit 1"));
    if (order == null) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "未找到对应支付订单");
    }

    String appId = textOf(node, "appid");
    String mchId = textOf(node, "mchid");
    if (StringUtils.hasText(appId) && !config.appId().equals(appId)) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "微信回调APPID不匹配");
    }
    if (StringUtils.hasText(mchId) && !config.merchantId().equals(mchId)) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "微信回调商户号不匹配");
    }

    int paidAmount = intOf(node.path("amount"), "total");
    if (order.getTotalAmountCents() == null || order.getTotalAmountCents() != paidAmount) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "微信回调金额与订单金额不一致");
    }

    String tradeState = textOf(node, "trade_state");
    String transactionId = textOf(node, "transaction_id");
    String paidAtRaw = textOf(node, "success_time");
    LocalDateTime paidAt = parsePaidAt(paidAtRaw);

    if (!"SUCCESS".equalsIgnoreCase(tradeState)) {
      order.setStatus("CLOSED");
      order.setTradeState(tradeState);
      order.setRawNotify(rawNotify);
      order.setErrorMessage(textOf(node, "trade_state_desc"));
      paymentOrderMapper.updateById(order);
      return;
    }

    int affected = paymentOrderMapper.markPaidIfNotGranted(
        order.getId(),
        transactionId,
        tradeState,
        rawNotify,
        paidAt,
        LocalDateTime.now(clock));
    if (affected == 0) {
      return;
    }
    membershipEntitlementService.applyPaidOrder(order);
  }

  private void verifyNotifyHeaders(
      String serial,
      String signature,
      String timestamp,
      String nonce,
      String body,
      WeChatConfig config) {
    if (!StringUtils.hasText(signature) || !StringUtils.hasText(timestamp) || !StringUtils.hasText(nonce)) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "微信回调验签请求头缺失");
    }
    if (StringUtils.hasText(config.platformPublicId())
        && StringUtils.hasText(serial)
        && !config.platformPublicId().equalsIgnoreCase(serial)) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "微信回调平台证书序列号不匹配");
    }

    String signText = timestamp + "\n" + nonce + "\n" + body + "\n";
    boolean verified = verifySignature(signText, signature, config.platformPublicPem());
    if (!verified) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "微信回调验签失败");
    }
  }

  private JsonNode decryptNotifyResource(JsonNode notifyNode, WeChatConfig config) {
    JsonNode resource = notifyNode.path("resource");
    String algorithm = textOf(resource, "algorithm");
    String nonce = textOf(resource, "nonce");
    String ciphertext = textOf(resource, "ciphertext");
    String associatedData = textOf(resource, "associated_data");
    if (!"AEAD_AES_256_GCM".equals(algorithm)) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "不支持的微信回调加密算法");
    }
    if (!StringUtils.hasText(nonce) || !StringUtils.hasText(ciphertext)) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "微信回调加密数据不完整");
    }

    String plainText = decryptAesGcm(ciphertext, config.apiV3Key(), nonce, associatedData);
    return parseJson(plainText, "微信回调解密成功但数据格式非法");
  }

  private WeChatConfig loadAndValidateConfig() {
    PaymentConfigEntity configEntity = paymentConfigMapper.selectOne(
        new LambdaQueryWrapper<PaymentConfigEntity>()
            .eq(PaymentConfigEntity::getMethod, WECHAT_METHOD)
            .last("limit 1"));
    if (configEntity == null || !Boolean.TRUE.equals(configEntity.getEnabled())) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "微信支付未开启");
    }
    JsonNode node = parseJson(configEntity.getConfigJson(), "微信支付配置格式错误");
    String appId = firstNonBlank(node, "appId", "appid");
    String merchantId = firstNonBlank(node, "merchantId", "mchId", "mchid");
    String apiV3Key = firstNonBlank(node, "apiV3Key", "apiv3Key");
    String certificateSerialNo = firstNonBlank(node, "certificateSerialNo", "serialNo");
    String platformPublicId = firstNonBlank(node, "platformPublicId", "platformCertSerialNo");
    String platformPublicPem = firstNonBlank(node, "platformPublicPem", "platformPublicKeyPem");
    String notifyUrl = firstNonBlank(node, "notifyUrl");
    String apiKeyPem = firstNonBlank(node, "apiKeyPem", "merchantPrivateKeyPem");

    if (!StringUtils.hasText(appId)
        || !StringUtils.hasText(merchantId)
        || !StringUtils.hasText(apiV3Key)
        || !StringUtils.hasText(certificateSerialNo)
        || !StringUtils.hasText(platformPublicPem)
        || !StringUtils.hasText(notifyUrl)
        || !StringUtils.hasText(apiKeyPem)) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "微信支付配置不完整");
    }
    if (apiV3Key.getBytes(StandardCharsets.UTF_8).length != 32) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "API V3密钥长度必须为32字节");
    }
    return new WeChatConfig(
        appId.trim(),
        merchantId.trim(),
        apiV3Key.trim(),
        certificateSerialNo.trim(),
        platformPublicId == null ? "" : platformPublicId.trim(),
        platformPublicPem.trim(),
        notifyUrl.trim(),
        apiKeyPem.trim());
  }

  private String buildAuthorization(String method, String path, String body, WeChatConfig config) {
    try {
      String nonce = UUID.randomUUID().toString().replace("-", "");
      String timestamp = String.valueOf(Instant.now(clock).getEpochSecond());
      String message = method + "\n" + path + "\n" + timestamp + "\n" + nonce + "\n" + body + "\n";
      String signature = sign(message, config.apiKeyPem());
      return "WECHATPAY2-SHA256-RSA2048 "
          + "mchid=\"" + config.merchantId() + "\","
          + "nonce_str=\"" + nonce + "\","
          + "timestamp=\"" + timestamp + "\","
          + "serial_no=\"" + config.certificateSerialNo() + "\","
          + "signature=\"" + signature + "\"";
    } catch (Exception ex) {
      throw new TransitException(ErrorCode.INTERNAL_ERROR, "生成微信支付签名失败", ex);
    }
  }

  private String sign(String message, String privateKeyPem) throws Exception {
    PrivateKey privateKey = parsePrivateKey(privateKeyPem);
    Signature signature = Signature.getInstance("SHA256withRSA");
    signature.initSign(privateKey);
    signature.update(message.getBytes(StandardCharsets.UTF_8));
    return Base64.getEncoder().encodeToString(signature.sign());
  }

  private boolean verifySignature(String message, String signatureText, String publicKeyPem) {
    try {
      PublicKey publicKey = parsePublicKey(publicKeyPem);
      Signature signature = Signature.getInstance("SHA256withRSA");
      signature.initVerify(publicKey);
      signature.update(message.getBytes(StandardCharsets.UTF_8));
      return signature.verify(Base64.getDecoder().decode(signatureText));
    } catch (Exception ex) {
      return false;
    }
  }

  private PrivateKey parsePrivateKey(String pem) throws Exception {
    String normalized = pem
        .replace("-----BEGIN PRIVATE KEY-----", "")
        .replace("-----END PRIVATE KEY-----", "")
        .replaceAll("\\s", "");
    byte[] keyBytes = Base64.getDecoder().decode(normalized);
    KeyFactory keyFactory = KeyFactory.getInstance("RSA");
    return keyFactory.generatePrivate(new PKCS8EncodedKeySpec(keyBytes));
  }

  private PublicKey parsePublicKey(String pem) throws Exception {
    String normalized = pem
        .replace("-----BEGIN PUBLIC KEY-----", "")
        .replace("-----END PUBLIC KEY-----", "")
        .replaceAll("\\s", "");
    byte[] keyBytes = Base64.getDecoder().decode(normalized);
    KeyFactory keyFactory = KeyFactory.getInstance("RSA");
    return keyFactory.generatePublic(new X509EncodedKeySpec(keyBytes));
  }

  private String decryptAesGcm(String ciphertext, String apiV3Key, String nonce, String associatedData) {
    try {
      Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
      SecretKeySpec keySpec = new SecretKeySpec(apiV3Key.getBytes(StandardCharsets.UTF_8), "AES");
      GCMParameterSpec gcmSpec = new GCMParameterSpec(128, nonce.getBytes(StandardCharsets.UTF_8));
      cipher.init(Cipher.DECRYPT_MODE, keySpec, gcmSpec);
      if (StringUtils.hasText(associatedData)) {
        cipher.updateAAD(associatedData.getBytes(StandardCharsets.UTF_8));
      }
      byte[] plain = cipher.doFinal(Base64.getDecoder().decode(ciphertext));
      return new String(plain, StandardCharsets.UTF_8);
    } catch (Exception ex) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "微信回调解密失败", ex);
    }
  }

  private JsonNode parseJson(String text, String errorMessage) {
    try {
      return objectMapper.readTree(text);
    } catch (Exception ex) {
      throw new TransitException(ErrorCode.BAD_REQUEST, errorMessage, ex);
    }
  }

  private String readString(String json, String fieldName) {
    try {
      JsonNode node = objectMapper.readTree(json);
      return textOf(node, fieldName);
    } catch (Exception ex) {
      return null;
    }
  }

  private String textOf(JsonNode node, String fieldName) {
    if (node == null || !node.hasNonNull(fieldName)) {
      return null;
    }
    String value = node.get(fieldName).asText();
    return StringUtils.hasText(value) ? value : null;
  }

  private String firstNonBlank(JsonNode node, String... names) {
    if (node == null || names == null) {
      return null;
    }
    for (String name : names) {
      String value = textOf(node, name);
      if (StringUtils.hasText(value)) {
        return value;
      }
    }
    return null;
  }

  private int intOf(JsonNode node, String fieldName) {
    if (node == null || !node.has(fieldName)) {
      return 0;
    }
    return node.get(fieldName).asInt(0);
  }

  private LocalDateTime parsePaidAt(String paidAtRaw) {
    if (!StringUtils.hasText(paidAtRaw)) {
      return LocalDateTime.now(clock);
    }
    try {
      return OffsetDateTime.parse(paidAtRaw).toLocalDateTime();
    } catch (Exception ex) {
      return LocalDateTime.now(clock);
    }
  }

  private Long parseTenantId(String outTradeNo, String attachData) {
    if (StringUtils.hasText(outTradeNo)) {
      String upper = outTradeNo.toUpperCase(Locale.ROOT);
      int t = upper.indexOf('T');
      int u = upper.indexOf('U');
      if (t == 0 && u > 1) {
        try {
          return Long.parseLong(upper.substring(1, u));
        } catch (Exception ignored) {
          return parseTenantIdFromAttach(attachData);
        }
      }
    }
    return parseTenantIdFromAttach(attachData);
  }

  private Long parseTenantIdFromAttach(String attachData) {
    if (!StringUtils.hasText(attachData)) {
      return null;
    }
    String[] pairs = attachData.split("&");
    for (String pair : pairs) {
      String[] kv = pair.split("=", 2);
      if (kv.length == 2 && "tenantId".equalsIgnoreCase(kv[0])) {
        try {
          return Long.parseLong(kv[1]);
        } catch (Exception ex) {
          return null;
        }
      }
    }
    return null;
  }

  private String buildOutTradeNo(long tenantId) {
    long nowMillis = Instant.now(clock).toEpochMilli();
    String random = UUID.randomUUID().toString().replace("-", "").substring(0, 4).toUpperCase(Locale.ROOT);
    return "T" + tenantId + "U" + nowMillis + random;
  }

  private RestClient restClient() {
    return RestClient.builder()
        .baseUrl(WECHAT_BASE_URL)
        .build();
  }

  private TransitException toTransitException(RestClientResponseException ex, String prefix) {
    int statusCode = ex.getStatusCode().value();
    ErrorCode code = switch (statusCode) {
      case 401 -> ErrorCode.UNAUTHORIZED;
      case 403 -> ErrorCode.FORBIDDEN;
      default -> statusCode >= 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.BAD_REQUEST;
    };
    String body = ex.getResponseBodyAsString();
    String message = StringUtils.hasText(body)
        ? prefix + " (" + statusCode + "): " + body
        : prefix + " (" + statusCode + ")";
    return new TransitException(code, message, ex);
  }

  private record WeChatConfig(
      String appId,
      String merchantId,
      String apiV3Key,
      String certificateSerialNo,
      String platformPublicId,
      String platformPublicPem,
      String notifyUrl,
      String apiKeyPem) {
  }

  public record NativeOrderResult(
      String outTradeNo,
      String codeUrl,
      Integer totalAmountCents,
      String currency,
      String expireAt) {
  }

  public record PaymentOrderStatusResult(
      String id,
      String outTradeNo,
      String status,
      String tradeState,
      String codeUrl,
      Integer totalAmountCents,
      String currency,
      String paidAt,
      String expireAt) {
  }

  public record NotifyAck(String responseBody, boolean success) {
  }
}
