package com.shijie.transit.userapi.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.shijie.transit.common.db.entity.OutboundMaterialEntity;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

@Service
public class OutboundMaterialDecisionService {
  private static final Logger log = LoggerFactory.getLogger(OutboundMaterialDecisionService.class);
  private static final String DEFAULT_COMPATIBLE_BASE_URL = "https://dashscope.aliyuncs.com";
  private static final int MAX_RULE_CANDIDATES = 5;
  private static final double MIN_MODEL_CONFIDENCE = 0.8d;

  private final OutboundMaterialService outboundMaterialService;
  private final ObjectMapper objectMapper;
  private final RestClient restClient;
  private final boolean modelConfigured;
  private final String apiKey;
  private final String compatibleEndpoint;
  private final String model;

  @Autowired
  public OutboundMaterialDecisionService(
      OutboundMaterialService outboundMaterialService,
      ObjectMapper objectMapper,
      RestClient.Builder restClientBuilder,
      @Value("${spring.ai.dashscope.api-key:}") String dashScopeApiKey,
      @Value("${spring.ai.dashscope.chat.base-url:${spring.ai.dashscope.base-url:https://dashscope.aliyuncs.com}}") String dashScopeBaseUrl,
      @Value("${transit.material.decision.model:}") String decisionModel) {
    this.outboundMaterialService = outboundMaterialService;
    this.objectMapper = objectMapper;
    this.restClient = restClientBuilder.build();
    this.apiKey = dashScopeApiKey == null ? "" : dashScopeApiKey.trim();
    this.compatibleEndpoint = buildCompatibleEndpoint(dashScopeBaseUrl);
    this.model = StringUtils.hasText(decisionModel) ? decisionModel.trim() : "";
    this.modelConfigured = StringUtils.hasText(this.apiKey) && StringUtils.hasText(this.model);
  }

  protected OutboundMaterialDecisionService(OutboundMaterialService outboundMaterialService, ObjectMapper objectMapper) {
    this.outboundMaterialService = outboundMaterialService;
    this.objectMapper = objectMapper;
    this.restClient = null;
    this.modelConfigured = false;
    this.apiKey = "";
    this.compatibleEndpoint = "";
    this.model = "";
  }

  public List<OutboundMaterialEntity> selectAutoSendMaterials(Long userId, String customerMessage, String replyText, String channel) {
    if (!hasMaterialRequestIntent(customerMessage)) {
      return List.of();
    }
    List<RankedMaterialCandidate> candidates = rankCandidates(userId, customerMessage, channel);
    if (candidates.isEmpty()) {
      log.info("外发素材规则筛选未命中，跳过自动发送 userId={} channel={}", userId, channel);
      return List.of();
    }
    log.info("外发素材规则筛选命中 userId={} channel={} candidateCount={} candidates={}",
        userId, channel, candidates.size(), summarizeCandidates(candidates));
    return selectFirstValidatedCandidate(userId, channel, candidates);
  }

  public OutboundMaterialEntity validateAutoSendMaterial(Long userId, Long id, String channel) {
    return outboundMaterialService.validateAutoSendMaterial(userId, id, channel);
  }

  private List<OutboundMaterialEntity> selectFirstValidatedCandidate(
      Long userId,
      String channel,
      List<RankedMaterialCandidate> candidates) {
    for (RankedMaterialCandidate candidate : candidates) {
      Long materialId = parseLong(candidate.summary().materialId());
      if (materialId == null) {
        log.warn("外发素材候选ID格式非法，已跳过 userId={} channel={} materialId={}",
            userId, channel, candidate.summary().materialId());
        continue;
      }
      try {
        OutboundMaterialEntity material = validateAutoSendMaterial(userId, materialId, channel);
        log.info("外发素材规则命中并通过校验，准备发送 userId={} channel={} materialId={} materialName={} score={} matchedTerms={}",
            userId,
            channel,
            materialId,
            abbreviate(material.getName(), 120),
            candidate.score(),
            candidate.matchedTerms());
        return List.of(material);
      } catch (Exception ex) {
        log.warn("外发素材候选校验失败，继续尝试下一个候选 userId={} channel={} materialId={} reason={}",
            userId, channel, materialId, ex.getMessage());
      }
    }
    log.warn("外发素材规则筛选命中，但没有候选通过自动发送校验 userId={} channel={} candidateCount={}",
        userId, channel, candidates.size());
    return List.of();
  }

  List<RankedMaterialCandidate> rankCandidates(Long userId, String customerMessage, String channel) {
    String normalizedMessage = normalize(customerMessage);
    if (!StringUtils.hasText(normalizedMessage)) {
      return List.of();
    }
    return outboundMaterialService.listAutoSendMaterialSummaries(userId, channel).stream()
        .map(summary -> scoreCandidate(summary, normalizedMessage))
        .filter(candidate -> candidate.score() > 0)
        .sorted(Comparator.comparingInt(RankedMaterialCandidate::score).reversed())
        .limit(MAX_RULE_CANDIDATES)
        .toList();
  }

  private RankedMaterialCandidate scoreCandidate(OutboundMaterialService.OutboundMaterialSummary summary, String normalizedMessage) {
    int score = 0;
    Set<String> matchedTerms = new LinkedHashSet<>();
    score += scoreText(summary.name(), normalizedMessage, 5, matchedTerms);
    score += scoreText(summary.tags(), normalizedMessage, 3, matchedTerms);
    score += scoreText(summary.description(), normalizedMessage, 2, matchedTerms);
    if ("IMAGE".equalsIgnoreCase(summary.fileType()) && containsAny(normalizedMessage, List.of("图", "图片", "照片", "海报"))) {
      score += 2;
      matchedTerms.add("图片");
    }
    if ("FILE".equalsIgnoreCase(summary.fileType()) && containsAny(normalizedMessage, List.of("文件", "文档", "资料", "pdf", "表格"))) {
      score += 2;
      matchedTerms.add("文件");
    }
    return new RankedMaterialCandidate(summary, score, List.copyOf(matchedTerms));
  }

  private int scoreText(String source, String normalizedMessage, int weight, Set<String> matchedTerms) {
    int score = 0;
    for (String term : splitTerms(source)) {
      if (term.length() <= 1) {
        continue;
      }
      if (normalizedMessage.contains(term)) {
        score += weight;
        matchedTerms.add(term);
      }
    }
    return score;
  }

  private MaterialDecision requestModelDecision(
      String customerMessage,
      String replyText,
      String channel,
      List<RankedMaterialCandidate> candidates) throws Exception {
    ObjectNode request = objectMapper.createObjectNode();
    request.put("model", model);
    request.put("stream", false);
    request.put("enable_thinking", false);
    ArrayNode messages = request.putArray("messages");
    messages.addObject()
        .put("role", "system")
        .put("content", systemPrompt());
    messages.addObject()
        .put("role", "user")
        .put("content", buildUserPrompt(customerMessage, replyText, channel, candidates));

    log.info("外发素材选择模型请求 endpoint={} model={} candidateCount={}", compatibleEndpoint, model, candidates.size());
    try {
      JsonNode response = restClient.post()
          .uri(compatibleEndpoint)
          .headers(headers -> headers.setBearerAuth(apiKey))
          .contentType(MediaType.APPLICATION_JSON)
          .body(request)
          .retrieve()
          .body(JsonNode.class);
      return parseDecision(readCompatibleContent(response));
    } catch (RestClientResponseException ex) {
      log.warn("外发素材选择模型调用失败 endpoint={} model={} status={} response={}",
          compatibleEndpoint, model, ex.getRawStatusCode(), abbreviate(ex.getResponseBodyAsString(), 1000));
      throw ex;
    }
  }

  private String systemPrompt() {
    return """
        你是客服外发素材选择器，只判断是否需要发送候选素材。
        必须保守：客户没有明确索要图片、资料、文件、产品图、案例图、报价单、介绍文档时，should_send 必须为 false。
        只能从候选素材中选择 material_id，禁止编造 ID，禁止输出路径、URL 或文件名。
        输出必须是 JSON Object，不要 Markdown，不要代码块。
        字段固定为 should_send、material_id、confidence、reason。
        如果不发送，material_id 为空字符串，confidence 为 0。
        """;
  }

  private String buildUserPrompt(
      String customerMessage,
      String replyText,
      String channel,
      List<RankedMaterialCandidate> candidates) throws Exception {
    ObjectNode root = objectMapper.createObjectNode();
    root.put("customer_message", nullSafe(customerMessage));
    root.put("assistant_reply", nullSafe(replyText));
    root.put("channel", nullSafe(channel));
    ArrayNode array = root.putArray("candidates");
    for (RankedMaterialCandidate candidate : candidates) {
      ObjectNode node = array.addObject();
      OutboundMaterialService.OutboundMaterialSummary summary = candidate.summary();
      node.put("material_id", summary.materialId());
      node.put("name", summary.name());
      node.put("description", summary.description());
      node.put("tags", summary.tags());
      node.put("file_type", summary.fileType());
      node.put("score", candidate.score());
      node.putPOJO("matched_terms", candidate.matchedTerms());
    }
    return objectMapper.writeValueAsString(root);
  }

  MaterialDecision parseDecision(String output) throws Exception {
    JsonNode root = objectMapper.readTree(stripJsonFence(output));
    if (!root.isObject()) {
      return MaterialDecision.noSend();
    }
    boolean shouldSend = root.path("should_send").asBoolean(false);
    String materialId = text(root.path("material_id"));
    if (!StringUtils.hasText(materialId)) {
      materialId = text(root.path("materialId"));
    }
    double confidence = root.path("confidence").isNumber() ? root.path("confidence").asDouble(0d) : 0d;
    String reason = text(root.path("reason"));
    return new MaterialDecision(shouldSend, materialId.trim(), confidence, reason);
  }

  private boolean hasMaterialRequestIntent(String text) {
    String value = normalize(text);
    if (!StringUtils.hasText(value)) {
      return false;
    }
    boolean hasAction = containsAny(value, List.of("发", "发送", "给我", "看下", "看看", "有没有", "来一份", "传", "提供"));
    boolean hasObject = containsAny(value, List.of("图", "图片", "照片", "资料", "文件", "文档", "报价", "报价单", "案例", "介绍", "pdf", "表格", "海报"));
    return hasAction && hasObject;
  }

  private List<String> splitTerms(String text) {
    String value = normalize(text);
    if (!StringUtils.hasText(value)) {
      return List.of();
    }
    String[] parts = value.split("[,，、\\s/|;；:：。.!！?？\\-_*()（）\\[\\]【】]+");
    List<String> terms = new ArrayList<>();
    for (String part : parts) {
      if (StringUtils.hasText(part)) {
        terms.add(part.trim());
      }
    }
    return terms;
  }

  private boolean containsAny(String value, List<String> terms) {
    for (String term : terms) {
      if (value.contains(term.toLowerCase(Locale.ROOT))) {
        return true;
      }
    }
    return false;
  }

  private String readCompatibleContent(JsonNode response) {
    String content = text(response == null ? null : response.path("choices").path(0).path("message").path("content"));
    if (!StringUtils.hasText(content)) {
      throw new IllegalArgumentException("外发素材选择模型返回为空");
    }
    return content;
  }

  private String stripJsonFence(String text) {
    String value = nullSafe(text);
    if (value.startsWith("```")) {
      value = value.replaceFirst("^```(?:json|JSON)?\\s*", "");
      value = value.replaceFirst("\\s*```$", "");
    }
    return value.trim();
  }

  private Long parseLong(String value) {
    try {
      return Long.parseLong(nullSafe(value));
    } catch (NumberFormatException ex) {
      return null;
    }
  }

  private String text(JsonNode node) {
    if (node == null || node.isMissingNode() || node.isNull()) {
      return "";
    }
    if (node.isTextual() || node.isNumber() || node.isBoolean()) {
      return node.asText();
    }
    return "";
  }

  private String normalize(String value) {
    return nullSafe(value).toLowerCase(Locale.ROOT);
  }

  private String nullSafe(String value) {
    return value == null ? "" : value.trim();
  }

  private String buildCompatibleEndpoint(String configuredBaseUrl) {
    String baseUrl = StringUtils.hasText(configuredBaseUrl) ? configuredBaseUrl.trim() : DEFAULT_COMPATIBLE_BASE_URL;
    baseUrl = baseUrl.replaceAll("/+$", "");
    if (baseUrl.endsWith("/chat/completions")) {
      return baseUrl;
    }
    if (baseUrl.endsWith("/compatible-mode/v1")) {
      return baseUrl + "/chat/completions";
    }
    if (baseUrl.endsWith("/api/v1")) {
      baseUrl = baseUrl.substring(0, baseUrl.length() - "/api/v1".length());
    }
    return baseUrl + "/compatible-mode/v1/chat/completions";
  }

  private String abbreviate(String text, int maxLength) {
    if (!StringUtils.hasText(text)) {
      return "";
    }
    String value = text.trim();
    return value.length() <= maxLength ? value : value.substring(0, maxLength);
  }

  private String summarizeCandidates(List<RankedMaterialCandidate> candidates) {
    if (candidates == null || candidates.isEmpty()) {
      return "[]";
    }
    try {
      ArrayNode array = objectMapper.createArrayNode();
      for (RankedMaterialCandidate candidate : candidates) {
        OutboundMaterialService.OutboundMaterialSummary summary = candidate.summary();
        ObjectNode node = array.addObject();
        node.put("materialId", summary.materialId());
        node.put("name", abbreviate(summary.name(), 80));
        node.put("fileType", summary.fileType());
        node.put("score", candidate.score());
        node.putPOJO("matchedTerms", candidate.matchedTerms());
      }
      return objectMapper.writeValueAsString(array);
    } catch (Exception ex) {
      return "[候选摘要生成失败:" + ex.getMessage() + "]";
    }
  }

  record RankedMaterialCandidate(
      OutboundMaterialService.OutboundMaterialSummary summary,
      int score,
      List<String> matchedTerms) {
  }

  record MaterialDecision(boolean shouldSend, String materialId, double confidence, String reason) {
    static MaterialDecision noSend() {
      return new MaterialDecision(false, "", 0d, "");
    }
  }
}
