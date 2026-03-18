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
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URLEncoder;
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
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

@Service
public class AlipayPayService {
  private static final String ALIPAY_METHOD = "ALIPAY";
  private static final String ALIPAY_API_METHOD = "alipay.trade.precreate";
  private static final String ALIPAY_FORMAT = "JSON";
  private static final String ALIPAY_CHARSET = "utf-8";
  private static final String ALIPAY_VERSION = "1.0";
  private static final String ALIPAY_SUCCESS_CODE = "10000";
  private static final DateTimeFormatter ALIPAY_TIMESTAMP_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

  private final PaymentConfigMapper paymentConfigMapper;
  private final MembershipPlanMapper membershipPlanMapper;
  private final PaymentOrderMapper paymentOrderMapper;
  private final MembershipEntitlementService membershipEntitlementService;
  private final ObjectMapper objectMapper;
  private final Clock clock;

  public AlipayPayService(
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

    AlipayConfig config = loadAndValidateConfig();
    Long tenantId = TenantContext.getTenantId();
    if (tenantId == null) {
      throw new TransitException(ErrorCode.TENANT_ID_REQUIRED, "缺少租户上下文");
    }

    String outTradeNo = buildOutTradeNo(tenantId);
    LocalDateTime expireAt = LocalDateTime.now(clock).plusMinutes(15);
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
    order.setChannel(ALIPAY_METHOD);
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
    order.setExpireAt(expireAt);
    paymentOrderMapper.insert(order);

    String requestBody = buildRequestBody(plan, outTradeNo, attachData, config, totalAmountCents);
    String responseBody;
    try {
      responseBody = restClient().post()
          .uri(config.gatewayUrl())
          .contentType(MediaType.APPLICATION_FORM_URLENCODED)
          .body(requestBody)
          .retrieve()
          .body(String.class);
    } catch (RestClientResponseException ex) {
      order.setStatus("FAILED");
      order.setErrorMessage(ex.getResponseBodyAsString());
      paymentOrderMapper.updateById(order);
      throw toTransitException(ex, "支付宝下单失败");
    }

    JsonNode root = parseJson(responseBody, "支付宝下单返回数据解析失败");
    JsonNode responseNode = root.path("alipay_trade_precreate_response");
    String code = textOf(responseNode, "code");
    if (!ALIPAY_SUCCESS_CODE.equals(code)) {
      order.setStatus("FAILED");
      order.setErrorMessage(readAlipayError(responseNode, responseBody));
      paymentOrderMapper.updateById(order);
      throw new TransitException(ErrorCode.BAD_REQUEST, "支付宝下单失败: " + order.getErrorMessage());
    }

    String qrCode = textOf(responseNode, "qr_code");
    if (!StringUtils.hasText(qrCode)) {
      order.setStatus("FAILED");
      order.setErrorMessage(responseBody);
      paymentOrderMapper.updateById(order);
      throw new TransitException(ErrorCode.INTERNAL_ERROR, "支付宝返回二维码地址为空");
    }

    order.setStatus("PREPAY");
    order.setCodeUrl(qrCode);
    order.setPrepayId(outTradeNo);
    order.setErrorMessage("");
    paymentOrderMapper.updateById(order);
    return new NativeOrderResult(outTradeNo, qrCode, totalAmountCents, "CNY", expireAt.toString());
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
  public NotifyAck handleNotify(Map<String, String> requestParams) {
    AlipayConfig config = loadAndValidateConfig();
    Map<String, String> params = normalizeNotifyParams(requestParams);
    verifyNotifySignature(params, config);

    String outTradeNo = params.get("out_trade_no");
    if (!StringUtils.hasText(outTradeNo)) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "支付宝回调缺少商户订单号");
    }

    Long tenantId = parseTenantId(outTradeNo, params.get("passback_params"));
    if (tenantId == null) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "无法识别回调租户信息");
    }

    String rawNotify = toRawNotify(params);
    TenantContext.setTenantId(tenantId);
    try {
      processNotifyOrder(params, rawNotify, config);
      return new NotifyAck("success", true);
    } finally {
      TenantContext.clear();
    }
  }

  private void processNotifyOrder(Map<String, String> params, String rawNotify, AlipayConfig config) {
    String outTradeNo = params.get("out_trade_no");
    PaymentOrderEntity order = paymentOrderMapper.selectOne(
        new LambdaQueryWrapper<PaymentOrderEntity>()
            .eq(PaymentOrderEntity::getOutTradeNo, outTradeNo)
            .last("limit 1"));
    if (order == null) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "未找到对应支付订单");
    }
    if (!ALIPAY_METHOD.equalsIgnoreCase(order.getChannel())) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "订单支付渠道不匹配");
    }

    String appId = params.get("app_id");
    if (StringUtils.hasText(appId) && !config.appId().equals(appId)) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "支付宝回调APPID不匹配");
    }

    int paidAmount = amountYuanToCents(params.get("total_amount"));
    if (order.getTotalAmountCents() == null || order.getTotalAmountCents() != paidAmount) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "支付宝回调金额与订单金额不一致");
    }

    String tradeStatus = params.getOrDefault("trade_status", "");
    String transactionId = params.getOrDefault("trade_no", "");
    LocalDateTime paidAt = parsePaidAt(params.get("gmt_payment"));

    if (!isPaidTradeStatus(tradeStatus)) {
      order.setStatus("CLOSED");
      order.setTradeState(tradeStatus);
      order.setRawNotify(rawNotify);
      order.setErrorMessage(params.getOrDefault("sub_msg", ""));
      paymentOrderMapper.updateById(order);
      return;
    }

    int affected = paymentOrderMapper.markPaidIfNotGranted(
        order.getId(),
        transactionId,
        tradeStatus,
        rawNotify,
        paidAt,
        LocalDateTime.now(clock));
    if (affected == 0) {
      return;
    }
    membershipEntitlementService.applyPaidOrder(order);
  }

  private String buildRequestBody(
      MembershipPlanEntity plan,
      String outTradeNo,
      String attachData,
      AlipayConfig config,
      int totalAmountCents) {
    ObjectNode bizContent = objectMapper.createObjectNode();
    bizContent.put("out_trade_no", outTradeNo);
    bizContent.put("total_amount", amountCentsToYuan(totalAmountCents));
    bizContent.put("subject", StringUtils.hasText(plan.getName()) ? plan.getName() : "会员购买");
    bizContent.put("timeout_express", "15m");

    String bizContentText;
    try {
      bizContentText = objectMapper.writeValueAsString(bizContent);
    } catch (Exception ex) {
      throw new TransitException(ErrorCode.INTERNAL_ERROR, "组装支付宝下单参数失败", ex);
    }

    Map<String, String> params = new TreeMap<>();
    params.put("app_id", config.appId());
    params.put("method", ALIPAY_API_METHOD);
    params.put("format", ALIPAY_FORMAT);
    params.put("charset", ALIPAY_CHARSET);
    params.put("sign_type", config.signType());
    params.put("timestamp", ALIPAY_TIMESTAMP_FORMATTER.format(LocalDateTime.now(clock)));
    params.put("version", ALIPAY_VERSION);
    params.put("notify_url", config.notifyUrl());
    params.put("biz_content", bizContentText);
    params.put("passback_params", attachData);
    params.put("sign", sign(buildSignContent(params), config.appPrivateKey()));
    return buildFormBody(params);
  }

  private String buildFormBody(Map<String, String> params) {
    StringBuilder builder = new StringBuilder();
    for (Map.Entry<String, String> entry : params.entrySet()) {
      if (!StringUtils.hasText(entry.getValue())) {
        continue;
      }
      if (builder.length() > 0) {
        builder.append('&');
      }
      builder.append(entry.getKey())
          .append('=')
          .append(URLEncoder.encode(entry.getValue(), StandardCharsets.UTF_8));
    }
    return builder.toString();
  }

  private Map<String, String> normalizeNotifyParams(Map<String, String> requestParams) {
    if (requestParams == null || requestParams.isEmpty()) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "支付宝回调参数为空");
    }
    Map<String, String> normalized = new LinkedHashMap<>();
    for (Map.Entry<String, String> entry : requestParams.entrySet()) {
      if (entry.getKey() == null) {
        continue;
      }
      String value = entry.getValue();
      if (value == null) {
        continue;
      }
      normalized.put(entry.getKey(), value.trim());
    }
    return normalized;
  }

  private void verifyNotifySignature(Map<String, String> params, AlipayConfig config) {
    String sign = params.get("sign");
    if (!StringUtils.hasText(sign)) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "支付宝回调缺少签名");
    }
    Map<String, String> signParams = new TreeMap<>();
    for (Map.Entry<String, String> entry : params.entrySet()) {
      String key = entry.getKey();
      String value = entry.getValue();
      if (!StringUtils.hasText(key) || !StringUtils.hasText(value)) {
        continue;
      }
      if ("sign".equalsIgnoreCase(key) || "sign_type".equalsIgnoreCase(key)) {
        continue;
      }
      signParams.put(key, value);
    }
    String signContent = buildSignContent(signParams);
    if (!verify(signContent, sign, config.alipayPublicKey(), config.signType())) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "支付宝回调验签失败");
    }
  }

  private String buildSignContent(Map<String, String> params) {
    StringBuilder builder = new StringBuilder();
    for (Map.Entry<String, String> entry : params.entrySet()) {
      if (!StringUtils.hasText(entry.getValue())) {
        continue;
      }
      if (builder.length() > 0) {
        builder.append('&');
      }
      builder.append(entry.getKey()).append('=').append(entry.getValue());
    }
    return builder.toString();
  }

  private String sign(String content, String privateKey) {
    try {
      Signature signature = Signature.getInstance("SHA256withRSA");
      signature.initSign(parsePrivateKey(privateKey));
      signature.update(content.getBytes(StandardCharsets.UTF_8));
      return Base64.getEncoder().encodeToString(signature.sign());
    } catch (Exception ex) {
      throw new TransitException(ErrorCode.INTERNAL_ERROR, "生成支付宝签名失败", ex);
    }
  }

  private boolean verify(String content, String sign, String publicKey, String signType) {
    try {
      Signature signature = Signature.getInstance(resolveSignAlgorithm(signType));
      signature.initVerify(parsePublicKey(publicKey));
      signature.update(content.getBytes(StandardCharsets.UTF_8));
      return signature.verify(Base64.getDecoder().decode(sign));
    } catch (Exception ex) {
      return false;
    }
  }

  private String resolveSignAlgorithm(String signType) {
    if (!StringUtils.hasText(signType) || "RSA2".equalsIgnoreCase(signType)) {
      return "SHA256withRSA";
    }
    if ("RSA".equalsIgnoreCase(signType)) {
      return "SHA1withRSA";
    }
    throw new TransitException(ErrorCode.BAD_REQUEST, "不支持的支付宝签名类型: " + signType);
  }

  private PrivateKey parsePrivateKey(String privateKeyText) throws Exception {
    String normalized = privateKeyText
        .replace("-----BEGIN PRIVATE KEY-----", "")
        .replace("-----END PRIVATE KEY-----", "")
        .replaceAll("\\s", "");
    byte[] keyBytes = Base64.getDecoder().decode(normalized);
    KeyFactory keyFactory = KeyFactory.getInstance("RSA");
    return keyFactory.generatePrivate(new PKCS8EncodedKeySpec(keyBytes));
  }

  private PublicKey parsePublicKey(String publicKeyText) throws Exception {
    String normalized = publicKeyText
        .replace("-----BEGIN PUBLIC KEY-----", "")
        .replace("-----END PUBLIC KEY-----", "")
        .replaceAll("\\s", "");
    byte[] keyBytes = Base64.getDecoder().decode(normalized);
    KeyFactory keyFactory = KeyFactory.getInstance("RSA");
    return keyFactory.generatePublic(new X509EncodedKeySpec(keyBytes));
  }

  private AlipayConfig loadAndValidateConfig() {
    PaymentConfigEntity configEntity = paymentConfigMapper.selectOne(
        new LambdaQueryWrapper<PaymentConfigEntity>()
            .eq(PaymentConfigEntity::getMethod, ALIPAY_METHOD)
            .last("limit 1"));
    if (configEntity == null || !Boolean.TRUE.equals(configEntity.getEnabled())) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "支付宝支付未开启");
    }
    JsonNode node = parseJson(configEntity.getConfigJson(), "支付宝配置格式错误");
    String appId = firstNonBlank(node, "appId", "appid");
    String signType = firstNonBlank(node, "signType");
    String gatewayUrl = firstNonBlank(node, "gatewayUrl");
    String notifyUrl = firstNonBlank(node, "notifyUrl");
    String appPrivateKey = firstNonBlank(node, "appPrivateKey");
    String alipayPublicKey = firstNonBlank(node, "alipayPublicKey");
    if (!StringUtils.hasText(appId)
        || !StringUtils.hasText(gatewayUrl)
        || !StringUtils.hasText(notifyUrl)
        || !StringUtils.hasText(appPrivateKey)
        || !StringUtils.hasText(alipayPublicKey)) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "支付宝配置不完整");
    }
    String normalizedSignType = StringUtils.hasText(signType) ? signType.trim() : "RSA2";
    if (!"RSA2".equalsIgnoreCase(normalizedSignType) && !"RSA".equalsIgnoreCase(normalizedSignType)) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "支付宝签名类型仅支持RSA2或RSA");
    }
    return new AlipayConfig(
        appId.trim(),
        normalizedSignType.toUpperCase(Locale.ROOT),
        gatewayUrl.trim(),
        notifyUrl.trim(),
        appPrivateKey.trim(),
        alipayPublicKey.trim());
  }

  private String readAlipayError(JsonNode responseNode, String fallback) {
    String subMsg = textOf(responseNode, "sub_msg");
    if (StringUtils.hasText(subMsg)) {
      return subMsg;
    }
    String msg = textOf(responseNode, "msg");
    if (StringUtils.hasText(msg)) {
      return msg;
    }
    return fallback;
  }

  private JsonNode parseJson(String text, String errorMessage) {
    try {
      return objectMapper.readTree(text);
    } catch (Exception ex) {
      throw new TransitException(ErrorCode.BAD_REQUEST, errorMessage, ex);
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

  private String toRawNotify(Map<String, String> params) {
    try {
      return objectMapper.writeValueAsString(new TreeMap<>(params));
    } catch (Exception ex) {
      return "{}";
    }
  }

  private boolean isPaidTradeStatus(String tradeStatus) {
    return "TRADE_SUCCESS".equalsIgnoreCase(tradeStatus) || "TRADE_FINISHED".equalsIgnoreCase(tradeStatus);
  }

  private int amountYuanToCents(String amountYuan) {
    if (!StringUtils.hasText(amountYuan)) {
      return 0;
    }
    try {
      BigDecimal yuan = new BigDecimal(amountYuan.trim());
      return yuan.movePointRight(2).setScale(0, RoundingMode.HALF_UP).intValueExact();
    } catch (Exception ex) {
      throw new TransitException(ErrorCode.BAD_REQUEST, "支付宝回调金额格式非法");
    }
  }

  private String amountCentsToYuan(Integer cents) {
    if (cents == null || cents <= 0) {
      return "0.00";
    }
    return BigDecimal.valueOf(cents).movePointLeft(2).setScale(2, RoundingMode.UNNECESSARY).toPlainString();
  }

  private LocalDateTime parsePaidAt(String paidAtRaw) {
    if (!StringUtils.hasText(paidAtRaw)) {
      return LocalDateTime.now(clock);
    }
    try {
      return LocalDateTime.parse(paidAtRaw.trim(), ALIPAY_TIMESTAMP_FORMATTER);
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
    return RestClient.builder().build();
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

  private record AlipayConfig(
      String appId,
      String signType,
      String gatewayUrl,
      String notifyUrl,
      String appPrivateKey,
      String alipayPublicKey) {
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
