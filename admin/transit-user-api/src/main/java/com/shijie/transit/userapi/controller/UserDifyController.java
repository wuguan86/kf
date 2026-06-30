package com.shijie.transit.userapi.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.shijie.transit.common.db.entity.KnowledgeBaseEntity;
import com.shijie.transit.common.db.entity.KnowledgeBaseFileEntity;
import com.shijie.transit.common.db.entity.OutboundMaterialEntity;
import com.shijie.transit.common.db.entity.RoleEntity;
import com.shijie.transit.common.security.TransitPrincipal;
import com.shijie.transit.common.tenant.TenantContext;
import com.shijie.transit.common.web.ErrorCode;
import com.shijie.transit.common.web.Result;
import com.shijie.transit.common.web.TransitException;
import com.shijie.transit.userapi.dify.DifyClient;
import com.shijie.transit.userapi.dify.DifyProperties;
import com.shijie.transit.userapi.service.DifyContactConversationMappingService;
import com.shijie.transit.userapi.service.KnowledgeBaseService;
import com.shijie.transit.userapi.service.RoleKnowledgeBaseService;
import com.shijie.transit.userapi.service.RoleService;
import com.shijie.transit.userapi.service.SessionConfigService;
import com.shijie.transit.userapi.service.SessionHistoryService;
import com.shijie.transit.userapi.service.MembershipEntitlementService;
import com.shijie.transit.userapi.service.MembershipQueryService;
import com.shijie.transit.userapi.service.OutboundMaterialDecisionService;
import com.shijie.transit.userapi.service.SmartSalesDifyContextService;
import com.shijie.transit.userapi.service.WechatAutoReplyModelService;
import com.shijie.transit.userapi.wechatvision.WechatReplyTriggerResult;
import com.shijie.transit.userapi.wechatvision.WechatVisionParseRequest;
import com.shijie.transit.userapi.wechatvision.WechatVisionService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@RestController
@RequestMapping("/api/user/dify")
public class UserDifyController {
    private static final Logger log = LoggerFactory.getLogger(UserDifyController.class);
    private static final Pattern IMAGE_DATA_URL_PATTERN = Pattern.compile("^data:(image/[a-zA-Z0-9.+-]+);base64,(.+)$", Pattern.DOTALL);
    private static final int MAX_IMAGE_BYTES = 10 * 1024 * 1024;
    private static final long DIFY_WAIT_HEARTBEAT_MS = 15000L;
    private static final long SCREENSHOT_REPLY_DEDUP_TTL_MS = 120_000L;
    private static final int MAX_SCREENSHOT_REPLY_DEDUP_KEYS = 1000;
    private final DifyClient difyClient;
    private final DifyContactConversationMappingService contactConversationMappingService;
    private final RoleService roleService;
    private final RoleKnowledgeBaseService roleKnowledgeBaseService;
    private final KnowledgeBaseService knowledgeBaseService;
    private final SessionConfigService sessionConfigService;
    private final SessionHistoryService sessionHistoryService;
    private final MembershipEntitlementService membershipEntitlementService;
    private final MembershipQueryService membershipQueryService;
    private final OutboundMaterialDecisionService outboundMaterialDecisionService;
    private final SmartSalesDifyContextService smartSalesDifyContextService;
    private final WechatAutoReplyModelService wechatAutoReplyModelService;
    private final WechatVisionService wechatVisionService;
    private final DifyProperties difyProperties;
    private final ObjectMapper objectMapper;
    private final Map<String, Long> recentScreenshotReplyKeys = new ConcurrentHashMap<>();

    public UserDifyController(
            DifyClient difyClient,
            DifyContactConversationMappingService contactConversationMappingService,
            RoleService roleService,
            RoleKnowledgeBaseService roleKnowledgeBaseService,
            KnowledgeBaseService knowledgeBaseService,
            SessionConfigService sessionConfigService,
            SessionHistoryService sessionHistoryService,
            MembershipEntitlementService membershipEntitlementService,
            MembershipQueryService membershipQueryService,
            OutboundMaterialDecisionService outboundMaterialDecisionService,
            SmartSalesDifyContextService smartSalesDifyContextService,
            WechatAutoReplyModelService wechatAutoReplyModelService,
            WechatVisionService wechatVisionService,
            DifyProperties difyProperties,
            ObjectMapper objectMapper) {
        this.difyClient = difyClient;
        this.contactConversationMappingService = contactConversationMappingService;
        this.roleService = roleService;
        this.roleKnowledgeBaseService = roleKnowledgeBaseService;
        this.knowledgeBaseService = knowledgeBaseService;
        this.sessionConfigService = sessionConfigService;
        this.sessionHistoryService = sessionHistoryService;
        this.membershipEntitlementService = membershipEntitlementService;
        this.membershipQueryService = membershipQueryService;
        this.outboundMaterialDecisionService = outboundMaterialDecisionService;
        this.smartSalesDifyContextService = smartSalesDifyContextService;
        this.wechatAutoReplyModelService = wechatAutoReplyModelService;
        this.wechatVisionService = wechatVisionService;
        this.difyProperties = difyProperties;
        this.objectMapper = objectMapper;
    }

    @PostMapping(value = "/monitor-chat", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public Result<Object> monitorChat(@RequestBody MonitorChatRequest request) throws IOException {
        TransitPrincipal principal = currentPrincipal();
        if (request == null || !StringUtils.hasText(request.message()) || request.roleId() == null) {
            return Result.success(objectMapper.createObjectNode());
        }
        RoleEntity role = roleService.getById(principal.subjectId(), request.roleId());
        String assistantMode = resolveAssistantMode(request);
        validateRoleMatchesAssistantMode(role, assistantMode);
        List<String> datasetIds = resolveRoleDatasetIds(principal.subjectId(), role);
        List<String> retrieveResults = retrieveFromDatasets(datasetIds, request.message());
        String context = buildContextFromRetrieve(retrieveResults);
        boolean hasRoleContent = StringUtils.hasText(role.getContent());
        String roleContent = hasRoleContent ? role.getContent() : request.role();

        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("query", request.message());
        payload.put("response_mode", "streaming");
        ObjectNode inputs = payload.putObject("inputs");
        inputs.put("context", context == null ? "" : context);
        if (StringUtils.hasText(roleContent)) {
            inputs.put("user_custom_role", roleContent);
        }
        String sceneType = "SINGLE";
        if ("GROUP".equalsIgnoreCase(request.roomType())) {
            sceneType = "GROUP";
        } else if (StringUtils.hasText(request.wechatContact()) && request.wechatContact().matches(".*\\(\\d+\\)$")) {
            sceneType = "GROUP";
        }
        String sessionKey = resolveSessionKey(request.roleId(), request.wechatContact());
        addSalesContextToInputs(inputs, principal.subjectId(), sessionKey, assistantMode);
        int memoryRounds = resolveMemoryRounds(principal.subjectId(), sceneType);
        addHistoryToInputs(inputs, principal.subjectId(), request.roleId(), sceneType, sessionKey, memoryRounds);
        sessionHistoryService.appendMessage(
                principal.subjectId(), request.roleId(), sceneType, sessionKey, "USER", request.message());
        payload.put("user", "user-" + principal.subjectId());
        String mappedConversationId = null;
        if (StringUtils.hasText(request.wechatContact())) {
            mappedConversationId = contactConversationMappingService.getConversationId(
                    principal.subjectId(), request.roleId(), request.wechatContact());
        }
        if (StringUtils.hasText(mappedConversationId)) {
            payload.put("conversation_id", mappedConversationId);
        } else if (StringUtils.hasText(request.conversationId())) {
            payload.put("conversation_id", request.conversationId());
        }

        DifyClient.DifyChatResult result = executeChatWithImageFallback(
                payload, principal.subjectId(), request.imageDataUrl(), true, "monitor-chat-" + principal.subjectId(), assistantMode);
        if (StringUtils.hasText(result.conversationId()) && StringUtils.hasText(request.wechatContact())) {
            contactConversationMappingService.upsertConversationId(
                    principal.subjectId(), request.roleId(), request.wechatContact(), result.conversationId());
        }
        String channel = resolveWechatChannel(request);
        ReplyPlan replyPlan = resolveReplyPlan(result.answer(), principal.subjectId(), channel);
        if (replyPlan.attachments().isEmpty() && outboundMaterialDecisionService != null) {
            List<OutboundMaterialEntity> decisionAttachments = outboundMaterialDecisionService.selectAutoSendMaterials(
                    principal.subjectId(), request.message(), replyPlan.replyText(), channel);
            if (!decisionAttachments.isEmpty()) {
                replyPlan = new ReplyPlan(buildAttachmentReplyText(decisionAttachments), decisionAttachments);
            }
        }
        String normalizedAnswer = normalizeStreamingAnswer(replyPlan.replyText());
        if (StringUtils.hasText(normalizedAnswer)) {
            sessionHistoryService.appendMessage(
                    principal.subjectId(), request.roleId(), sceneType, sessionKey, "AI", normalizedAnswer);
        }
        JsonNode monitorResultNode = objectMapper.readTree(result.rawJson());
        if (monitorResultNode instanceof ObjectNode monitorObjectNode && StringUtils.hasText(normalizedAnswer)) {
            monitorObjectNode.put("answer", normalizedAnswer);
            if (!replyPlan.attachments().isEmpty()) {
                monitorObjectNode.set("attachments", buildAttachmentResponse(replyPlan.attachments()));
            }
        }
        return Result.success(monitorResultNode);
    }

    @PostMapping(value = "/monitor-chat/stream")
    public SseEmitter monitorChatStream(@RequestBody MonitorChatRequest request) {
        SseEmitter emitter = new SseEmitter(Duration.ofMinutes(5).toMillis());
        TransitPrincipal principal = currentPrincipal();
        Long tenantId = TenantContext.getTenantId();
        String streamTraceId = "stream-" + principal.subjectId() + "-" + System.currentTimeMillis();
        emitter.onTimeout(() -> {
            log.warn("monitorChatStream 超时结束 traceId={}", streamTraceId);
            emitter.complete();
        });
        emitter.onCompletion(() -> log.info("monitorChatStream 连接结束 traceId={}", streamTraceId));
        emitter.onError(ex -> log.error("monitorChatStream 连接异常 traceId={}", streamTraceId, ex));

        CompletableFuture.runAsync(() -> {
            try {
                TenantContext.setTenantId(tenantId);
                log.info("monitorChatStream 开始 traceId={} roleId={} contact={} hasImageSummary={}",
                        streamTraceId,
                        request == null ? null : request.roleId(),
                        request == null ? null : request.wechatContact(),
                        request != null && StringUtils.hasText(request.imageSummary()));
                String effectiveMessage = request == null ? "" : resolveLatestCustomerMessage(request);
                if (request == null || !StringUtils.hasText(effectiveMessage) || request.roleId() == null) {
                    log.warn("monitorChatStream 非法请求 traceId={}", streamTraceId);
                    emitter.completeWithError(new IllegalArgumentException("Invalid request"));
                    return;
                }
                
                // 检查积分是否充足
                MembershipQueryService.MyMembershipSnapshot snapshot = membershipQueryService.queryMyMembership(principal.subjectId());
                int totalPoints = Math.max(0, snapshot.subscriptionPoints() != null ? snapshot.subscriptionPoints() : 0) 
                                + Math.max(0, snapshot.packagePoints() != null ? snapshot.packagePoints() : 0);
                if (totalPoints <= 0) {
                    log.info("monitorChatStream 积分不足 traceId={} userId={}", streamTraceId, principal.subjectId());
                    emitter.send(SseEmitter.event().data(new StepMsg("LOGIC", "积分不足，无法发起对话。请前往“我的”页面充值或升级会员。")));
                    emitter.complete();
                    return;
                }

                RoleEntity role = roleService.getById(principal.subjectId(), request.roleId());
                String assistantMode = resolveAssistantMode(request);
                validateRoleMatchesAssistantMode(role, assistantMode);
                String question = effectiveMessage.length() > 20 ? effectiveMessage.substring(0, 20) + "..." : effectiveMessage;
                String contactName = resolveContactDisplayName(request);
                emitter.send(SseEmitter.event().data(new StepMsg("INTENT",
                        "正在分析微信聊天记录... 识别到客户 “" + contactName + "” 的消息： “" + question + "”，正在按【" + role.getName() + "】角色逻辑进行思考和回复。")));

                // 检查是否触发 AI 停止回复
                String sceneType = "SINGLE";
                if ("GROUP".equalsIgnoreCase(request.roomType())) {
                    sceneType = "GROUP";
                } else if (StringUtils.hasText(request.wechatContact()) && request.wechatContact().matches(".*\\(\\d+\\)$")) {
                    sceneType = "GROUP";
                }
                String sessionKey = resolveSessionKey(request.roleId(), request.wechatContact());

                SessionConfigService.SessionConfigView configView = sessionConfigService.getConfig(principal.subjectId(), sceneType);
                if (configView != null && configView.sceneConfig() != null && configView.sceneConfig().enabled() != null && configView.sceneConfig().enabled() == 0) {
                     emitter.send(SseEmitter.event().data(new StepMsg("LOGIC", "会话配置已禁用 (sceneType=" + sceneType + ")，停止回复。")));
                     emitter.complete();
                     return;
                }

                if ("GROUP".equals(sceneType)) {
                     // 群聊逻辑
                     if (configView != null) {
                         // 0. Time Range
                         String startTimeStr = configView.sceneConfig().groupReplyStartTime();
                         String endTimeStr = configView.sceneConfig().groupReplyEndTime();
                         if (StringUtils.hasText(startTimeStr) && StringUtils.hasText(endTimeStr)) {
                             try {
                                 LocalTime now = LocalTime.now();
                                 LocalTime start = LocalTime.parse(startTimeStr, DateTimeFormatter.ofPattern("HH:mm"));
                                 LocalTime end = LocalTime.parse(endTimeStr, DateTimeFormatter.ofPattern("HH:mm"));
                                 if (now.isBefore(start) || now.isAfter(end)) {
                                     emitter.send(SseEmitter.event().data(new StepMsg("LOGIC", "当前时间 " + now + " 不在群回复时间段 " + start + "-" + end + " 内，停止回复。")));
                                     emitter.complete();
                                     return;
                                 }
                             } catch (Exception e) {
                                 // log.warn("解析群回复时间段失败", e);
                             }
                         }

                         // 1. Keyword Trigger
                         List<String> triggerKeywords = configView.groupTriggerKeywords();
                         String content = effectiveMessage;
                         boolean matched = false;
                         if (triggerKeywords != null && StringUtils.hasText(content)) {
                             for (String keyword : triggerKeywords) {
                                 if (StringUtils.hasText(keyword) && content.contains(keyword)) {
                                     matched = true;
                                     break;
                                 }
                             }
                         }
                         if (!matched) {
                             emitter.send(SseEmitter.event().data(new StepMsg("LOGIC", "未触发群消息关键词，停止回复。")));
                             emitter.complete();
                             return;
                         }

                         Integer cooldownConfig = configView.sceneConfig().groupCooldownSec();
                         int cooldownSec = cooldownConfig == null ? 0 : Math.max(cooldownConfig, 0);
                         if (cooldownSec > 0) {
                             LocalDateTime lastAiReplyTime = sessionHistoryService.getLastAiReplyTime(
                                     principal.subjectId(), request.roleId(), sceneType, sessionKey);
                             if (lastAiReplyTime != null) {
                                 long elapsedSeconds = Duration.between(lastAiReplyTime, LocalDateTime.now()).getSeconds();
                                 if (elapsedSeconds >= 0 && elapsedSeconds < cooldownSec) {
                                     emitter.send(SseEmitter.event().data(new StepMsg("LOGIC", "群聊回复频率控制生效，冷却中，停止回复。")));
                                     emitter.complete();
                                     return;
                                 }
                             }
                         }
                     }
                } else {
                    // 单聊逻辑
                    if (configView != null && configView.replyStrategy() != null) {
                        String content = effectiveMessage;

                        // 优先检查人工介入 (优先级高于 AI 停止回复)
                        // 如果关键词同时存在于两个配置中，优先执行人工介入逻辑
                        Integer manualHandoffEnabled = configView.replyStrategy().manualHandoffEnabled();
                        List<String> manualHandoffKeywords = configView.manualHandoffKeywords();

                        if (manualHandoffEnabled != null && manualHandoffEnabled == 1 && manualHandoffKeywords != null && StringUtils.hasText(content)) {
                            for (String keyword : manualHandoffKeywords) {
                                if (StringUtils.hasText(keyword) && content.contains(keyword)) {
                                    emitter.send(SseEmitter.event().data(new StepMsg("LOGIC", "触发人工介入关键词: " + keyword + "，停止 AI 回复并发送转接提示。")));
                                    String handoffMsg = configView.replyStrategy().manualHandoffMessage();
                                    if (StringUtils.hasText(handoffMsg)) {
                                        emitter.send(SseEmitter.event().data(new StepMsg("OUTPUT", handoffMsg)));
                                    }
                                    emitter.complete();
                                    return;
                                }
                            }
                        }

                        Integer stopReplyEnabled = configView.replyStrategy().aiStopReplyEnabled();
                        List<String> stopKeywords = configView.aiStopReplyKeywords();

                        if (stopReplyEnabled != null && stopReplyEnabled == 1 && stopKeywords != null && StringUtils.hasText(content)) {
                            for (String keyword : stopKeywords) {
                                if (StringUtils.hasText(keyword) && content.contains(keyword)) {
                                    emitter.send(SseEmitter.event().data(new StepMsg("LOGIC", "触发 AI 停止回复关键词: " + keyword + "，停止回复。")));
                                    emitter.complete();
                                    return;
                                }
                            }
                        }
                    }
                }

                List<String> datasetIds = resolveRoleDatasetIds(principal.subjectId(), role);
                List<String> retrieveResults = retrieveFromDatasets(datasetIds, effectiveMessage);
                log.info("monitorChatStream 检索完成 traceId={} datasetCount={} retrieveCount={}",
                        streamTraceId, datasetIds.size(), retrieveResults.size());
                String docTitles = extractDocTitles(retrieveResults);
                String knowledgeMsg = StringUtils.hasText(docTitles) ? "检索知识库... 匹配到 " + docTitles + " 。" : "检索知识库... 未匹配到相关文档。";
                emitter.send(SseEmitter.event().data(new StepMsg("KNOWLEDGE", knowledgeMsg)));

                emitter.send(SseEmitter.event().data(new StepMsg("LOGIC", "模型正在组织回复逻辑并生成答案。")));
                String context = buildContextFromRetrieve(retrieveResults);
                boolean hasRoleContent = StringUtils.hasText(role.getContent());
                String roleContent = hasRoleContent ? role.getContent() : request.role();

                int memoryRounds = resolveMemoryRounds(principal.subjectId(), sceneType);
                String history = buildHistoryInput(principal.subjectId(), request.roleId(), sceneType, sessionKey, memoryRounds);
                SmartSalesDifyContextService.SalesDifyContext salesContext = buildSalesContext(principal.subjectId(), sessionKey, assistantMode);
                sessionHistoryService.appendMessage(
                        principal.subjectId(), request.roleId(), sceneType, sessionKey, "USER", effectiveMessage);

                log.info("monitorChatStream 调用自动回复模型前 traceId={} queryLength={} hasImageSummary={}",
                        streamTraceId,
                        effectiveMessage.length(),
                        StringUtils.hasText(request.imageSummary()));
                String rawAnswer = wechatAutoReplyModelService.generateReply(new WechatAutoReplyModelService.AutoReplyRequest(
                        effectiveMessage,
                        request.imageSummary(),
                        context,
                        roleContent,
                        history,
                        salesContext.salesStage(),
                        salesContext.customerProfile(),
                        assistantMode));
                String channel = resolveWechatChannel(request);
                ReplyPlan replyPlan = resolveReplyPlan(rawAnswer, principal.subjectId(), channel);
                if (replyPlan.attachments().isEmpty() && outboundMaterialDecisionService != null) {
                    List<OutboundMaterialEntity> decisionAttachments = outboundMaterialDecisionService.selectAutoSendMaterials(
                            principal.subjectId(), effectiveMessage, replyPlan.replyText(), channel);
                    if (!decisionAttachments.isEmpty()) {
                        replyPlan = new ReplyPlan(buildAttachmentReplyText(decisionAttachments), decisionAttachments);
                    }
                }
                String answer = normalizeStreamingAnswer(replyPlan.replyText());
                log.info("monitorChatStream 调用自动回复模型后 traceId={} answerLength={}",
                        streamTraceId,
                        answer == null ? 0 : answer.length());
                if (StringUtils.hasText(answer)) {
                    sessionHistoryService.appendMessage(
                            principal.subjectId(), request.roleId(), sceneType, sessionKey, "AI", answer);
                    boolean deductSuccess = membershipEntitlementService.deductPoints(principal.subjectId(), 1, "chat_reply", sessionKey);
                    if (!deductSuccess) {
                        log.warn("monitorChatStream 扣点失败 traceId={} userId={}", streamTraceId, principal.subjectId());
                        emitter.send(SseEmitter.event().data(new StepMsg("LOGIC", "积分不足，无法完成本次回复。请前往“我的”页面充值或升级会员。")));
                        emitter.complete();
                        return;
                    }
                }
                if (!replyPlan.attachments().isEmpty()) {
                    emitter.send(SseEmitter.event().data(new StepMsg("ATTACHMENTS", objectMapper.writeValueAsString(buildAttachmentResponse(replyPlan.attachments())))));
                }
                emitter.send(SseEmitter.event().data(new StepMsg("OUTPUT", answer)));
                log.info("monitorChatStream 完成 traceId={}", streamTraceId);
                emitter.complete();
            } catch (Exception e) {
                log.error("Monitor chat stream error traceId={}", streamTraceId, e);
                emitter.completeWithError(e);
            } finally {
                TenantContext.clear();
            }
        });
        return emitter;
    }

    @PostMapping(value = "/monitor-chat/screenshot-stream")
    public SseEmitter monitorChatScreenshotStream(@RequestBody MonitorChatScreenshotRequest request) {
        SseEmitter emitter = new SseEmitter(Duration.ofMinutes(5).toMillis());
        TransitPrincipal principal = currentPrincipal();
        Long tenantId = TenantContext.getTenantId();
        String streamTraceId = "screenshot-stream-" + principal.subjectId() + "-" + System.currentTimeMillis();
        emitter.onTimeout(() -> {
            log.warn("monitorChatScreenshotStream 超时结束 traceId={}", streamTraceId);
            emitter.complete();
        });
        emitter.onCompletion(() -> log.info("monitorChatScreenshotStream 连接结束 traceId={}", streamTraceId));
        emitter.onError(ex -> log.error("monitorChatScreenshotStream 连接异常 traceId={}", streamTraceId, ex));

        CompletableFuture.runAsync(() -> {
            try {
                TenantContext.setTenantId(tenantId);
                if (request == null || request.roleId() == null || !StringUtils.hasText(request.imageDataUrl())) {
                    log.warn("monitorChatScreenshotStream 非法请求 traceId={}", streamTraceId);
                    emitter.completeWithError(new IllegalArgumentException("Invalid request"));
                    return;
                }
                emitter.send(SseEmitter.event().data(new StepMsg("VISION", "正在识别最新客户消息。")));
                WechatReplyTriggerResult trigger = wechatVisionService.parseReplyTrigger(new WechatVisionParseRequest(
                        request.imageDataUrl(),
                        request.windowTitle(),
                        "",
                        "native-personal",
                        "CHAT_REPLY_TRIGGER"));
                if (!trigger.hasNewUnrepliedMessage()) {
                    String skipReason = StringUtils.hasText(trigger.skipReason()) ? trigger.skipReason() : "未识别到尚未回复的最新客户消息。";
                    emitter.send(SseEmitter.event().data(new StepMsg("LOGIC", skipReason)));
                    emitter.complete();
                    return;
                }
                String latestMessage = StringUtils.hasText(trigger.latestCustomerMessage())
                        ? trigger.latestCustomerMessage()
                        : (StringUtils.hasText(trigger.imageSummary()) ? "[图片]" : "");
                if (!StringUtils.hasText(latestMessage)) {
                    emitter.send(SseEmitter.event().data(new StepMsg("LOGIC", "视觉识别没有返回可回复内容，已跳过。")));
                    emitter.complete();
                    return;
                }
                String screenshotContact = resolveScreenshotContactKey(request, trigger);
                String screenshotDisplayName = resolveScreenshotContactDisplayName(request, trigger, screenshotContact);
                String dedupKey = buildScreenshotReplyDedupKey(principal.subjectId(), request.roleId(), screenshotContact, latestMessage, trigger.imageSummary());
                if (isDuplicateScreenshotReply(dedupKey)) {
                    log.info("monitorChatScreenshotStream 命中重复客户消息，已跳过二次回复 traceId={} contact={} latestMessage={}",
                            streamTraceId, screenshotContact, latestMessage);
                    emitter.send(SseEmitter.event().data(new StepMsg("LOGIC", "识别到同一客户消息正在处理或已处理，已跳过本次重复回复。")));
                    emitter.complete();
                    return;
                }
                markScreenshotReplyDedupKey(dedupKey);
                MonitorChatRequest monitorRequest = new MonitorChatRequest(
                        request.roleId(),
                        latestMessage,
                        request.role(),
                        "",
                        screenshotContact,
                        screenshotDisplayName,
                        StringUtils.hasText(request.roomType()) ? request.roomType() : trigger.conversationType(),
                        "",
                        request.assistantMode(),
                        latestMessage,
                        trigger.imageSummary());
                runMonitorChatStream(emitter, monitorRequest, principal, tenantId, streamTraceId);
            } catch (Exception e) {
                log.error("Monitor chat screenshot stream error traceId={}", streamTraceId, e);
                emitter.completeWithError(e);
            } finally {
                TenantContext.clear();
            }
        });
        return emitter;
    }

    private void runMonitorChatStream(
            SseEmitter emitter,
            MonitorChatRequest request,
            TransitPrincipal principal,
            Long tenantId,
            String streamTraceId) throws Exception {
        TenantContext.setTenantId(tenantId);
        log.info("monitorChatStream 编排开始 traceId={} roleId={} contact={} hasImageSummary={}",
                streamTraceId,
                request == null ? null : request.roleId(),
                request == null ? null : request.wechatContact(),
                request != null && StringUtils.hasText(request.imageSummary()));
        String effectiveMessage = request == null ? "" : resolveLatestCustomerMessage(request);
        if (request == null || !StringUtils.hasText(effectiveMessage) || request.roleId() == null) {
            log.warn("monitorChatStream 非法请求 traceId={}", streamTraceId);
            emitter.completeWithError(new IllegalArgumentException("Invalid request"));
            return;
        }

        MembershipQueryService.MyMembershipSnapshot snapshot = membershipQueryService.queryMyMembership(principal.subjectId());
        int totalPoints = Math.max(0, snapshot.subscriptionPoints() != null ? snapshot.subscriptionPoints() : 0)
                + Math.max(0, snapshot.packagePoints() != null ? snapshot.packagePoints() : 0);
        if (totalPoints <= 0) {
            log.info("monitorChatStream 积分不足 traceId={} userId={}", streamTraceId, principal.subjectId());
            emitter.send(SseEmitter.event().data(new StepMsg("LOGIC", "积分不足，无法发起对话。请前往“我的”页面充值或升级会员。")));
            emitter.complete();
            return;
        }

        RoleEntity role = roleService.getById(principal.subjectId(), request.roleId());
        String assistantMode = resolveAssistantMode(request);
        validateRoleMatchesAssistantMode(role, assistantMode);
        String question = effectiveMessage.length() > 20 ? effectiveMessage.substring(0, 20) + "..." : effectiveMessage;
        String contactName = resolveContactDisplayName(request);
        emitter.send(SseEmitter.event().data(new StepMsg("INTENT",
                "正在分析... 识别到客户 “" + contactName + "” 的消息： “" + question + "”，正在按【" + role.getName() + "】角色逻辑进行思考和回复。")));

        String sceneType = "SINGLE";
        if ("GROUP".equalsIgnoreCase(request.roomType())) {
            sceneType = "GROUP";
        } else if (StringUtils.hasText(request.wechatContact()) && request.wechatContact().matches(".*\\(\\d+\\)$")) {
            sceneType = "GROUP";
        }
        String sessionKey = resolveSessionKey(request.roleId(), request.wechatContact());

        SessionConfigService.SessionConfigView configView = sessionConfigService.getConfig(principal.subjectId(), sceneType);
        if (configView != null && configView.sceneConfig() != null && configView.sceneConfig().enabled() != null && configView.sceneConfig().enabled() == 0) {
            emitter.send(SseEmitter.event().data(new StepMsg("LOGIC", "会话配置已禁用 (sceneType=" + sceneType + ")，停止回复。")));
            emitter.complete();
            return;
        }

        if ("GROUP".equals(sceneType)) {
            if (configView != null) {
                String startTimeStr = configView.sceneConfig().groupReplyStartTime();
                String endTimeStr = configView.sceneConfig().groupReplyEndTime();
                if (StringUtils.hasText(startTimeStr) && StringUtils.hasText(endTimeStr)) {
                    try {
                        LocalTime now = LocalTime.now();
                        LocalTime start = LocalTime.parse(startTimeStr, DateTimeFormatter.ofPattern("HH:mm"));
                        LocalTime end = LocalTime.parse(endTimeStr, DateTimeFormatter.ofPattern("HH:mm"));
                        if (now.isBefore(start) || now.isAfter(end)) {
                            emitter.send(SseEmitter.event().data(new StepMsg("LOGIC", "当前时间 " + now + " 不在群回复时间段 " + start + "-" + end + " 内，停止回复。")));
                            emitter.complete();
                            return;
                        }
                    } catch (Exception ignored) {
                    }
                }

                List<String> triggerKeywords = configView.groupTriggerKeywords();
                boolean matched = false;
                if (triggerKeywords != null && StringUtils.hasText(effectiveMessage)) {
                    for (String keyword : triggerKeywords) {
                        if (StringUtils.hasText(keyword) && effectiveMessage.contains(keyword)) {
                            matched = true;
                            break;
                        }
                    }
                }
                if (!matched) {
                    emitter.send(SseEmitter.event().data(new StepMsg("LOGIC", "未触发群消息关键词，停止回复。")));
                    emitter.complete();
                    return;
                }

                Integer cooldownConfig = configView.sceneConfig().groupCooldownSec();
                int cooldownSec = cooldownConfig == null ? 0 : Math.max(cooldownConfig, 0);
                if (cooldownSec > 0) {
                    LocalDateTime lastAiReplyTime = sessionHistoryService.getLastAiReplyTime(
                            principal.subjectId(), request.roleId(), sceneType, sessionKey);
                    if (lastAiReplyTime != null) {
                        long elapsedSeconds = Duration.between(lastAiReplyTime, LocalDateTime.now()).getSeconds();
                        if (elapsedSeconds >= 0 && elapsedSeconds < cooldownSec) {
                            emitter.send(SseEmitter.event().data(new StepMsg("LOGIC", "群聊回复频率控制生效，冷却中，停止回复。")));
                            emitter.complete();
                            return;
                        }
                    }
                }
            }
        } else if (configView != null && configView.replyStrategy() != null) {
            Integer manualHandoffEnabled = configView.replyStrategy().manualHandoffEnabled();
            List<String> manualHandoffKeywords = configView.manualHandoffKeywords();
            if (manualHandoffEnabled != null && manualHandoffEnabled == 1 && manualHandoffKeywords != null && StringUtils.hasText(effectiveMessage)) {
                for (String keyword : manualHandoffKeywords) {
                    if (StringUtils.hasText(keyword) && effectiveMessage.contains(keyword)) {
                        emitter.send(SseEmitter.event().data(new StepMsg("LOGIC", "触发人工介入关键词: " + keyword + "，停止 AI 回复并发送转接提示。")));
                        String handoffMsg = configView.replyStrategy().manualHandoffMessage();
                        if (StringUtils.hasText(handoffMsg)) {
                            emitter.send(SseEmitter.event().data(new StepMsg("OUTPUT", handoffMsg)));
                        }
                        emitter.complete();
                        return;
                    }
                }
            }

            Integer stopReplyEnabled = configView.replyStrategy().aiStopReplyEnabled();
            List<String> stopKeywords = configView.aiStopReplyKeywords();
            if (stopReplyEnabled != null && stopReplyEnabled == 1 && stopKeywords != null && StringUtils.hasText(effectiveMessage)) {
                for (String keyword : stopKeywords) {
                    if (StringUtils.hasText(keyword) && effectiveMessage.contains(keyword)) {
                        emitter.send(SseEmitter.event().data(new StepMsg("LOGIC", "触发 AI 停止回复关键词: " + keyword + "，停止回复。")));
                        emitter.complete();
                        return;
                    }
                }
            }
        }

        List<String> datasetIds = resolveRoleDatasetIds(principal.subjectId(), role);
        List<String> retrieveResults = retrieveFromDatasets(datasetIds, effectiveMessage);
        log.info("monitorChatStream 检索完成 traceId={} datasetCount={} retrieveCount={}",
                streamTraceId, datasetIds.size(), retrieveResults.size());
        String docTitles = extractDocTitles(retrieveResults);
        String knowledgeMsg = StringUtils.hasText(docTitles) ? "检索知识库... 匹配到 " + docTitles + " 。" : "检索知识库... 未匹配到相关文档。";
        emitter.send(SseEmitter.event().data(new StepMsg("KNOWLEDGE", knowledgeMsg)));

        emitter.send(SseEmitter.event().data(new StepMsg("LOGIC", "模型正在组织回复逻辑并生成答案。")));
        String context = buildContextFromRetrieve(retrieveResults);
        String roleContent = StringUtils.hasText(role.getContent()) ? role.getContent() : request.role();
        int memoryRounds = resolveMemoryRounds(principal.subjectId(), sceneType);
        String history = buildHistoryInput(principal.subjectId(), request.roleId(), sceneType, sessionKey, memoryRounds);
        SmartSalesDifyContextService.SalesDifyContext salesContext = buildSalesContext(principal.subjectId(), sessionKey, assistantMode);
        sessionHistoryService.appendMessage(
                principal.subjectId(), request.roleId(), sceneType, sessionKey, "USER", effectiveMessage);

        log.info("monitorChatStream 调用自动回复模型前 traceId={} queryLength={} hasImageSummary={}",
                streamTraceId,
                effectiveMessage.length(),
                StringUtils.hasText(request.imageSummary()));
        String rawAnswer = wechatAutoReplyModelService.generateReply(new WechatAutoReplyModelService.AutoReplyRequest(
                effectiveMessage,
                request.imageSummary(),
                context,
                roleContent,
                history,
                salesContext.salesStage(),
                salesContext.customerProfile(),
                assistantMode));
        String channel = resolveWechatChannel(request);
        ReplyPlan replyPlan = resolveReplyPlan(rawAnswer, principal.subjectId(), channel);
        if (replyPlan.attachments().isEmpty() && outboundMaterialDecisionService != null) {
            List<OutboundMaterialEntity> decisionAttachments = outboundMaterialDecisionService.selectAutoSendMaterials(
                    principal.subjectId(), effectiveMessage, replyPlan.replyText(), channel);
            if (!decisionAttachments.isEmpty()) {
                replyPlan = new ReplyPlan(buildAttachmentReplyText(decisionAttachments), decisionAttachments);
            }
        }
        String answer = normalizeStreamingAnswer(replyPlan.replyText());
        if (StringUtils.hasText(answer)) {
            sessionHistoryService.appendMessage(
                    principal.subjectId(), request.roleId(), sceneType, sessionKey, "AI", answer);
            boolean deductSuccess = membershipEntitlementService.deductPoints(principal.subjectId(), 1, "chat_reply", sessionKey);
            if (!deductSuccess) {
                log.warn("monitorChatStream 扣点失败 traceId={} userId={}", streamTraceId, principal.subjectId());
                emitter.send(SseEmitter.event().data(new StepMsg("LOGIC", "积分不足，无法完成本次回复。请前往“我的”页面充值或升级会员。")));
                emitter.complete();
                return;
            }
        }
        if (!replyPlan.attachments().isEmpty()) {
            emitter.send(SseEmitter.event().data(new StepMsg("ATTACHMENTS", objectMapper.writeValueAsString(buildAttachmentResponse(replyPlan.attachments())))));
        }
        emitter.send(SseEmitter.event().data(new StepMsg("OUTPUT", answer)));
        log.info("monitorChatStream 编排完成 traceId={}", streamTraceId);
        emitter.complete();
    }

    private boolean isDuplicateScreenshotReply(String dedupKey) {
        cleanupScreenshotReplyDedupKeys();
        Long markedAt = recentScreenshotReplyKeys.get(dedupKey);
        return markedAt != null && System.currentTimeMillis() - markedAt < SCREENSHOT_REPLY_DEDUP_TTL_MS;
    }

    private void markScreenshotReplyDedupKey(String dedupKey) {
        cleanupScreenshotReplyDedupKeys();
        recentScreenshotReplyKeys.put(dedupKey, System.currentTimeMillis());
        if (recentScreenshotReplyKeys.size() <= MAX_SCREENSHOT_REPLY_DEDUP_KEYS) {
            return;
        }
        recentScreenshotReplyKeys.entrySet().stream()
                .sorted(Map.Entry.comparingByValue())
                .limit(Math.max(1, recentScreenshotReplyKeys.size() - MAX_SCREENSHOT_REPLY_DEDUP_KEYS))
                .map(Map.Entry::getKey)
                .forEach(recentScreenshotReplyKeys::remove);
    }

    private void cleanupScreenshotReplyDedupKeys() {
        long now = System.currentTimeMillis();
        recentScreenshotReplyKeys.entrySet().removeIf(entry -> now - entry.getValue() >= SCREENSHOT_REPLY_DEDUP_TTL_MS);
    }

    private String buildScreenshotReplyDedupKey(Long userId, Long roleId, String contact, String latestMessage, String imageSummary) {
        // 截图流每次截图摘要都会变化，按真实客户文本做短期幂等，避免己方回复落屏后再次触发同一条消息。
        return normalizeDedupPart(userId) + "|"
                + normalizeDedupPart(roleId) + "|"
                + normalizeDedupPart(contact) + "|"
                + normalizeDedupPart(latestMessage) + "|"
                + normalizeDedupPart(imageSummary);
    }

    private String normalizeDedupPart(Object value) {
        return String.valueOf(value == null ? "" : value).replaceAll("\\s+", " ").trim();
    }

    @GetMapping(value = "/datasets/{datasetId}/documents/{documentId}", produces = MediaType.APPLICATION_JSON_VALUE)
    public Result<Object> getDocument(@PathVariable("datasetId") String datasetId, @PathVariable("documentId") String documentId) throws IOException {
        String json = difyClient.getDocument(datasetId, documentId);
        return Result.success(objectMapper.readTree(json));
    }

    @PostMapping(value = "/datasets/{datasetId}/document/create-by-file", consumes = MediaType.MULTIPART_FORM_DATA_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public Result<Object> uploadDocument(@PathVariable("datasetId") String datasetId, @RequestPart("data") String data, @RequestPart("file") MultipartFile file) throws IOException {
        String json = difyClient.uploadDocumentByFile(datasetId, data, file);
        return Result.success(objectMapper.readTree(json));
    }

    @PostMapping(value = "/roles/{roleId}/kb/document/create-by-file", consumes = MediaType.MULTIPART_FORM_DATA_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public Result<UploadKnowledgeBaseDocumentResponse> uploadDocumentToRoleKnowledgeBase(
            @PathVariable("roleId") Long roleId,
            @RequestPart(name = "data", required = false) String data,
            @RequestPart("file") MultipartFile file) throws IOException {
        TransitPrincipal principal = currentPrincipal();
        RoleEntity role = roleService.getById(principal.subjectId(), roleId);
        KnowledgeBaseEntity knowledgeBase = ensureDefaultRoleKnowledgeBase(principal.subjectId(), role);
        KnowledgeBaseFileEntity uploaded = knowledgeBaseService.uploadFile(principal.subjectId(), knowledgeBase.getId(), data, file);
        return Result.success(new UploadKnowledgeBaseDocumentResponse(
                String.valueOf(knowledgeBase.getId()),
                knowledgeBase.getDifyDatasetId(),
                uploaded.getDifyDocumentId()));
    }

    private TransitPrincipal currentPrincipal() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        return (TransitPrincipal) authentication.getPrincipal();
    }

    private boolean isInvalidConversation(TransitException ex) {
        String message = ex.getMessage();
        if (message == null) {
            return false;
        }
        String lower = message.toLowerCase();
        return lower.contains("conversation not exists") || lower.contains("conversation not exist") || lower.contains("conversation not found");
    }

    private List<String> retrieveFromDatasets(List<String> datasetIds, String query) {
        List<String> results = new ArrayList<>();
        for (String datasetId : datasetIds) {
            if (!StringUtils.hasText(datasetId)) {
                continue;
            }
            try {
                String retrieveJson = difyClient.retrieveDataset(datasetId, query);
                if (StringUtils.hasText(retrieveJson)) {
                    results.add(retrieveJson);
                }
            } catch (Exception ex) {
                log.warn("Dify retrieve failed datasetId={} error={}", datasetId, ex.getMessage());
            }
        }
        return results;
    }

    private String buildContextFromRetrieve(List<String> retrieveJsonList) {
        List<String> segments = new ArrayList<>();
        double scoreThreshold = getKnowledgeScoreThreshold();
        for (String retrieveJson : retrieveJsonList) {
            try {
                JsonNode node = objectMapper.readTree(retrieveJson);
                JsonNode records = getRetrieveRecords(node);
                if (!records.isArray()) {
                    continue;
                }
                for (JsonNode record : records) {
                    if (!isKnowledgeRecordMatched(record, scoreThreshold)) {
                        continue;
                    }
                    String text = extractRecordText(record);
                    if (StringUtils.hasText(text)) {
                        segments.add(text.trim());
                    }
                    if (segments.size() >= 8) {
                        return String.join("\n\n", segments);
                    }
                }
            } catch (Exception ignored) {
            }
        }
        return String.join("\n\n", segments);
    }

    private String extractDocTitles(List<String> retrieveJsonList) {
        Set<String> titles = new LinkedHashSet<>();
        double scoreThreshold = getKnowledgeScoreThreshold();
        for (String retrieveJson : retrieveJsonList) {
            try {
                JsonNode node = objectMapper.readTree(retrieveJson);
                JsonNode records = getRetrieveRecords(node);
                if (!records.isArray()) {
                    continue;
                }
                for (JsonNode record : records) {
                    if (!isKnowledgeRecordMatched(record, scoreThreshold)) {
                        continue;
                    }
                    JsonNode docNode = record.path("segment").path("document");
                    if (docNode.isMissingNode()) {
                        docNode = record.path("document");
                    }
                    String name = docNode.has("name") ? docNode.get("name").asText() : docNode.path("title").asText();
                    if (StringUtils.hasText(name)) {
                        titles.add("《" + name + "》");
                    }
                    if (titles.size() >= 5) {
                        return String.join("、", titles);
                    }
                }
            } catch (Exception ignored) {
            }
        }
        return String.join("、", titles);
    }

    private JsonNode getRetrieveRecords(JsonNode root) {
        JsonNode records = root.path("records");
        if (!records.isArray()) {
            records = root.path("data");
        }
        if (!records.isArray()) {
            records = root.path("documents");
        }
        return records;
    }

    private double getKnowledgeScoreThreshold() {
        Double configured = difyProperties.getRetrieveScoreThreshold();
        if (configured == null) {
            return 0.6d;
        }
        return Math.max(0d, configured);
    }

    private boolean isKnowledgeRecordMatched(JsonNode record, double threshold) {
        if (threshold <= 0d) {
            return true;
        }
        Double score = extractRecordScore(record);
        return score != null && score >= threshold;
    }

    private Double extractRecordScore(JsonNode record) {
        String[] paths = new String[]{"/score", "/segment/score", "/metadata/score", "/segment/metadata/score"};
        for (String path : paths) {
            JsonNode scoreNode = record.at(path);
            if (scoreNode == null || scoreNode.isMissingNode() || scoreNode.isNull()) {
                continue;
            }
            if (scoreNode.isNumber()) {
                return scoreNode.asDouble();
            }
            if (scoreNode.isTextual()) {
                try {
                    return Double.parseDouble(scoreNode.asText());
                } catch (NumberFormatException ignored) {
                    return null;
                }
            }
        }
        return null;
    }

    private String extractRecordText(JsonNode record) {
        String[] paths = new String[]{"/segment/content", "/segment/text", "/content", "/text", "/document/content", "/document/text"};
        for (String path : paths) {
            JsonNode value = record.at(path);
            if (value != null && value.isTextual() && StringUtils.hasText(value.asText())) {
                return value.asText();
            }
        }
        return "";
    }

    private List<String> resolveRoleDatasetIds(Long userId, RoleEntity role) {
        List<KnowledgeBaseEntity> knowledgeBases = roleKnowledgeBaseService.listRoleKnowledgeBases(userId, role.getId());
        List<String> datasetIds = new ArrayList<>();
        for (KnowledgeBaseEntity knowledgeBase : knowledgeBases) {
            if (!StringUtils.hasText(knowledgeBase.getDifyDatasetId())) {
                continue;
            }
            if (hasKnowledgeBaseFiles(userId, knowledgeBase)) {
                datasetIds.add(knowledgeBase.getDifyDatasetId());
            } else {
                log.info("知识库未上传文件，跳过检索 userId={} roleId={} kbId={}",
                        userId, role.getId(), knowledgeBase.getId());
            }
        }
        if (!datasetIds.isEmpty()) {
            return datasetIds;
        }
        if (StringUtils.hasText(role.getKnowledgeBaseId())) {
            datasetIds.add(role.getKnowledgeBaseId());
            return datasetIds;
        }
        log.info("角色未绑定知识库，跳过知识库检索 userId={} roleId={}", userId, role.getId());
        return List.of();
    }

    private boolean hasKnowledgeBaseFiles(Long userId, KnowledgeBaseEntity knowledgeBase) {
        if (knowledgeBase == null || knowledgeBase.getId() == null) {
            return false;
        }
        try {
            List<KnowledgeBaseFileEntity> files = knowledgeBaseService.listFiles(userId, knowledgeBase.getId());
            return files != null && !files.isEmpty();
        } catch (Exception ex) {
            log.warn("检查知识库文件失败，跳过本次知识库检索 userId={} kbId={} error={}",
                    userId, knowledgeBase.getId(), ex.getMessage());
            return false;
        }
    }

    private KnowledgeBaseEntity ensureDefaultRoleKnowledgeBase(Long userId, RoleEntity role) {
        List<KnowledgeBaseEntity> knowledgeBases = roleKnowledgeBaseService.listRoleKnowledgeBases(userId, role.getId());
        if (!knowledgeBases.isEmpty()) {
            return knowledgeBases.get(0);
        }
        if (StringUtils.hasText(role.getKnowledgeBaseId())) {
            KnowledgeBaseEntity existing = knowledgeBaseService.getByDifyDatasetId(userId, role.getKnowledgeBaseId());
            if (existing != null) {
                roleKnowledgeBaseService.bindKnowledgeBase(userId, role.getId(), existing.getId());
                return existing;
            }
            KnowledgeBaseEntity createRequest = new KnowledgeBaseEntity();
            createRequest.setName(buildDatasetName(role));
            createRequest.setDescription("");
            createRequest.setPermission("only_me");
            createRequest.setStatus("ENABLED");
            createRequest.setDifyDatasetId(role.getKnowledgeBaseId());
            KnowledgeBaseEntity created = knowledgeBaseService.createByExistingDatasetId(userId, createRequest);
            roleKnowledgeBaseService.bindKnowledgeBase(userId, role.getId(), created.getId());
            return created;
        }
        KnowledgeBaseEntity createRequest = new KnowledgeBaseEntity();
        createRequest.setName(buildDatasetName(role));
        createRequest.setDescription("");
        createRequest.setPermission("only_me");
        createRequest.setStatus("ENABLED");
        KnowledgeBaseEntity created = knowledgeBaseService.create(userId, createRequest);
        roleKnowledgeBaseService.bindKnowledgeBase(userId, role.getId(), created.getId());
        return created;
    }

    private String buildDatasetName(RoleEntity role) {
        String name = role.getName();
        if (!StringUtils.hasText(name)) {
            throw new IllegalArgumentException("Role name required");
        }
        return role.getId() + "_" + name.trim();
    }

    private void addHistoryToInputs(
            ObjectNode inputs, Long userId, Long roleId, String sceneType, String sessionKey, int memoryRounds) {
        inputs.put("history", buildHistoryInput(userId, roleId, sceneType, sessionKey, memoryRounds));
    }

    private String buildHistoryInput(Long userId, Long roleId, String sceneType, String sessionKey, int memoryRounds) {
        List<SessionHistoryService.HistoryInputItem> history = sessionHistoryService.buildDifyHistory(
                userId, roleId, sceneType, sessionKey, memoryRounds);
        StringBuilder sb = new StringBuilder();
        for (SessionHistoryService.HistoryInputItem item : history) {
            if ("user".equalsIgnoreCase(item.role())) {
                sb.append("用户: ").append(item.content()).append("\n");
            } else {
                sb.append("回复: ").append(item.content()).append("\n");
            }
        }
        return sb.toString();
    }

    private void addSalesContextToInputs(ObjectNode inputs, Long userId, String sessionKey, String assistantMode) {
        SmartSalesDifyContextService.SalesDifyContext salesContext = buildSalesContext(userId, sessionKey, assistantMode);
        if (!StringUtils.hasText(salesContext.salesStage()) && !StringUtils.hasText(salesContext.customerProfile())) {
            return;
        }
        inputs.put("sales_stage", salesContext.salesStage() == null ? "" : salesContext.salesStage());
        inputs.put("customer_profile", salesContext.customerProfile() == null ? "" : salesContext.customerProfile());
    }

    private SmartSalesDifyContextService.SalesDifyContext buildSalesContext(Long userId, String sessionKey, String assistantMode) {
        if (!DifyClient.ASSISTANT_MODE_SALES.equals(assistantMode) || smartSalesDifyContextService == null) {
            return new SmartSalesDifyContextService.SalesDifyContext("", "");
        }
        return smartSalesDifyContextService.buildContext(userId, sessionKey);
    }

    private int resolveMemoryRounds(Long userId, String sceneType) {
        SessionConfigService.SessionConfigView view = sessionConfigService.getConfig(userId, sceneType);
        if (view == null || view.sceneConfig() == null || view.sceneConfig().memoryRounds() == null) {
            return 5;
        }
        return Math.max(view.sceneConfig().memoryRounds(), 1);
    }

    private String resolveSessionKey(Long roleId, String wechatContact) {
        if (StringUtils.hasText(wechatContact)) {
            return wechatContact.trim();
        }
        return "role-" + roleId;
    }

    private String resolveScreenshotContactKey(MonitorChatScreenshotRequest request, WechatReplyTriggerResult trigger) {
        String visionContact = trigger == null ? null : trigger.contact();
        if (StringUtils.hasText(visionContact) && !isGenericWechatContact(visionContact)) {
            return visionContact.trim();
        }
        if (request != null && StringUtils.hasText(request.wechatContact()) && !isGenericWechatContact(request.wechatContact())) {
            return request.wechatContact().trim();
        }
        if (StringUtils.hasText(visionContact)) {
            return visionContact.trim();
        }
        if (request != null && StringUtils.hasText(request.wechatContact())) {
            return request.wechatContact().trim();
        }
        return "";
    }

    private String resolveScreenshotContactDisplayName(
            MonitorChatScreenshotRequest request,
            WechatReplyTriggerResult trigger,
            String contactKey) {
        String visionContact = trigger == null ? null : trigger.contact();
        if (StringUtils.hasText(visionContact) && !isGenericWechatContact(visionContact)) {
            return visionContact.trim();
        }
        if (request != null && StringUtils.hasText(request.wechatContactDisplayName())
                && !isGenericWechatContact(request.wechatContactDisplayName())) {
            return request.wechatContactDisplayName().trim();
        }
        if (StringUtils.hasText(contactKey)) {
            return contactKey.trim();
        }
        return "未知客户";
    }

    private boolean isGenericWechatContact(String contact) {
        if (!StringUtils.hasText(contact)) {
            return true;
        }
        String normalized = contact.trim().toLowerCase(Locale.ROOT);
        return "微信".equals(normalized)
                || "wechat".equals(normalized)
                || "weixin".equals(normalized)
                || "未知客户".equals(normalized)
                || "客户".equals(normalized)
                || "对方".equals(normalized);
    }

    static String resolveContactDisplayName(MonitorChatRequest request) {
        if (request != null && StringUtils.hasText(request.wechatContactDisplayName())) {
            return request.wechatContactDisplayName().trim();
        }
        if (request != null && StringUtils.hasText(request.wechatContact())) {
            return request.wechatContact().trim();
        }
        return "未知客户";
    }

    static String resolveLatestCustomerMessage(MonitorChatRequest request) {
        if (request != null && StringUtils.hasText(request.latestCustomerMessage())) {
            return request.latestCustomerMessage().trim();
        }
        return request == null || request.message() == null ? "" : request.message().trim();
    }

    private String normalizeStreamingAnswer(String raw) {
        if (!StringUtils.hasText(raw)) {
            return raw;
        }
        String text = raw.replace("\u200B", "").trim();
        int len = text.length();
        if (len > 1 && len % 2 == 0) {
            String firstHalf = text.substring(0, len / 2).trim();
            String secondHalf = text.substring(len / 2).trim();
            if (StringUtils.hasText(firstHalf) && firstHalf.equals(secondHalf)) {
                return firstHalf;
            }
        }
        return text;
    }

    private ReplyPlan resolveReplyPlan(String rawAnswer, Long userId, String channel) {
        String normalizedAnswer = normalizeStreamingAnswer(rawAnswer);
        if (!StringUtils.hasText(normalizedAnswer)) {
            return new ReplyPlan(normalizedAnswer, List.of());
        }
        try {
            JsonNode root = objectMapper.readTree(normalizedAnswer);
            if (!root.isObject()) {
                return new ReplyPlan(normalizedAnswer, List.of());
            }
            String replyText = root.path("reply_text").asText("");
            if (!StringUtils.hasText(replyText)) {
                replyText = root.path("replyText").asText("");
            }
            if (!StringUtils.hasText(replyText)) {
                replyText = root.path("answer").asText(normalizedAnswer);
            }
            List<OutboundMaterialEntity> attachments = resolveValidatedAttachments(root.path("attachments"), userId, channel);
            return new ReplyPlan(replyText, attachments);
        } catch (Exception ignored) {
            return new ReplyPlan(normalizedAnswer, List.of());
        }
    }

    private List<OutboundMaterialEntity> resolveValidatedAttachments(JsonNode attachmentsNode, Long userId, String channel) {
        if (outboundMaterialDecisionService == null || attachmentsNode == null || !attachmentsNode.isArray()) {
            return List.of();
        }
        List<OutboundMaterialEntity> attachments = new ArrayList<>();
        Set<Long> seenMaterialIds = new LinkedHashSet<>();
        for (JsonNode node : attachmentsNode) {
            Long materialId = parseMaterialId(node);
            if (materialId == null || !seenMaterialIds.add(materialId)) {
                continue;
            }
            if (!isAttachmentConfidenceEnough(node)) {
                log.warn("Dify 推荐的外发素材置信度不足，已降级过滤 userId={} materialId={} channel={}",
                        userId, materialId, channel);
                continue;
            }
            try {
                attachments.add(outboundMaterialDecisionService.validateAutoSendMaterial(userId, materialId, channel));
            } catch (Exception ex) {
                log.warn("Dify 推荐的外发素材未通过校验 userId={} materialId={} channel={} reason={}",
                        userId, materialId, channel, ex.getMessage());
            }
        }
        return attachments;
    }

    private boolean isAttachmentConfidenceEnough(JsonNode node) {
        JsonNode confidenceNode = node.path("confidence");
        if (confidenceNode == null || confidenceNode.isMissingNode() || confidenceNode.isNull()) {
            return true;
        }
        if (!confidenceNode.isNumber()) {
            return true;
        }
        return confidenceNode.asDouble() >= 0.7d;
    }

    private Long parseMaterialId(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return null;
        }
        String value = node.path("material_id").asText("");
        if (!StringUtils.hasText(value)) {
            value = node.path("materialId").asText("");
        }
        if (!StringUtils.hasText(value)) {
            return null;
        }
        try {
            return Long.parseLong(value.trim());
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    private ArrayNode buildAttachmentResponse(List<OutboundMaterialEntity> attachments) {
        ArrayNode array = objectMapper.createArrayNode();
        for (OutboundMaterialEntity material : attachments) {
            ObjectNode item = array.addObject();
            item.put("materialId", String.valueOf(material.getId()));
            item.put("name", material.getName());
            item.put("fileType", material.getFileType());
            item.put("mimeType", material.getMimeType());
            item.put("fileSize", material.getFileSize() == null ? "" : String.valueOf(material.getFileSize()));
            item.put("extension", material.getExtension());
            item.put("downloadUrl", "/api/user/outbound-materials/" + material.getId() + "/download");
        }
        return array;
    }

    private String buildAttachmentReplyText(List<OutboundMaterialEntity> attachments) {
        if (attachments == null || attachments.isEmpty()) {
            return "";
        }
        if (attachments.size() == 1) {
            OutboundMaterialEntity material = attachments.get(0);
            String name = material == null ? "" : material.getName();
            String fileType = material == null ? "" : material.getFileType();
            if (StringUtils.hasText(name)) {
                return "可以的，我把「" + name.trim() + "」发您。";
            }
            if ("IMAGE".equalsIgnoreCase(fileType)) {
                return "可以的，我把相关图片发您。";
            }
            return "可以的，我把相关资料发您。";
        }
        boolean allImages = attachments.stream()
                .allMatch(material -> material != null && "IMAGE".equalsIgnoreCase(material.getFileType()));
        return allImages ? "可以的，我把相关图片发您。" : "可以的，我把相关资料发您。";
    }

    private String resolveWechatChannel(MonitorChatRequest request) {
        if (request != null && StringUtils.hasText(request.wechatContact())
                && request.wechatContact().trim().toLowerCase(Locale.ROOT).startsWith("enterprise:")) {
            return "enterprise";
        }
        return "personal";
    }

    private String resolveAssistantMode(MonitorChatRequest request) {
        String mode = request == null ? null : request.assistantMode();
        String normalized = StringUtils.hasText(mode)
                ? mode.trim().toLowerCase(Locale.ROOT)
                : DifyClient.ASSISTANT_MODE_CUSTOMER_SERVICE;
        return DifyClient.ASSISTANT_MODE_SALES.equals(normalized)
                ? DifyClient.ASSISTANT_MODE_SALES
                : DifyClient.ASSISTANT_MODE_CUSTOMER_SERVICE;
    }

    private void validateRoleMatchesAssistantMode(RoleEntity role, String assistantMode) {
        String roleType = role != null && "SALES".equalsIgnoreCase(role.getRoleType()) ? "SALES" : "CUSTOMER_SERVICE";
        if (DifyClient.ASSISTANT_MODE_SALES.equals(assistantMode) && !"SALES".equals(roleType)) {
            throw new TransitException(ErrorCode.BAD_REQUEST, "智能销售模式只能使用销售角色");
        }
        if (DifyClient.ASSISTANT_MODE_CUSTOMER_SERVICE.equals(assistantMode) && "SALES".equals(roleType)) {
            throw new TransitException(ErrorCode.BAD_REQUEST, "智能客服模式只能使用客服角色");
        }
    }

    private DifyClient.DifyChatResult executeChatWithImageFallback(
            ObjectNode payload, Long userId, String imageDataUrl, boolean allowConversationFallback, String traceId, String assistantMode) {
        ImagePayload imagePayload = parseImagePayload(imageDataUrl);
        String responseMode = payload.path("response_mode").asText("");
        boolean preferLocalFileFirst = imagePayload != null && "streaming".equalsIgnoreCase(responseMode);
        int attempt = 0;
        if (imagePayload != null) {
            log.info("图片消息开始调用 Dify traceId={} userId={} mimeType={} byteSize={} base64Length={} responseMode={} preferLocalFileFirst={} hasConversationId={}",
                    traceId,
                    userId,
                    imagePayload.mimeType(),
                    imagePayload.bytes().length,
                    imagePayload.base64Data().length(),
                    responseMode,
                    preferLocalFileFirst,
                    payload.hasNonNull("conversation_id"));
            if (preferLocalFileFirst) {
                attachLocalFile(payload, userId, imagePayload, traceId, assistantMode);
                log.info("图片消息使用 local_file 首次尝试 traceId={} reason=chatflow_streaming", traceId);
            } else {
                attachBase64File(payload, imagePayload);
                log.info("图片消息使用 base64 首次尝试 traceId={}", traceId);
            }
        }

        boolean switchedToLocalFile = preferLocalFileFirst;
        boolean strippedConversationId = false;
        while (true) {
            attempt++;
            log.info("图片消息调用 Dify 尝试 traceId={} attempt={} transferMethod={} hasConversationId={} strippedConversationId={}",
                    traceId,
                    attempt,
                    resolveTransferMethod(payload),
                    payload.hasNonNull("conversation_id"),
                    strippedConversationId);
            try {
                DifyClient.DifyChatResult result = difyClient.chatMessages(payload.toString(), assistantMode);
                if (imagePayload != null) {
                    log.info("图片消息调用 Dify 成功 traceId={} attempt={} transferMethod={} conversationId={} answerLength={}",
                            traceId,
                            attempt,
                            resolveTransferMethod(payload),
                            result.conversationId(),
                            result.answer() == null ? 0 : result.answer().length());
                }
                return result;
            } catch (TransitException ex) {
                log.warn("图片消息调用 Dify 捕获 TransitException traceId={} attempt={} transferMethod={} errorCode={} msg={}",
                        traceId,
                        attempt,
                        resolveTransferMethod(payload),
                        ex.getErrorCode(),
                        ex.getMessage(),
                        ex);
                if (!switchedToLocalFile && imagePayload != null && isBase64TransferUnsupported(ex)) {
                    log.warn("Dify base64 图片调用失败，准备切换 local_file traceId={} msg={}", traceId, ex.getMessage());
                    try {
                        attachLocalFile(payload, userId, imagePayload, traceId, assistantMode);
                    } catch (TransitException uploadEx) {
                        log.error("图片上传到 Dify 失败 traceId={} msg={}", traceId, uploadEx.getMessage(), uploadEx);
                        throw new TransitException(ErrorCode.BAD_REQUEST,
                                "图片已识别，但上传到 Dify 失败：" + uploadEx.getMessage(), uploadEx);
                    }
                    switchedToLocalFile = true;
                    continue;
                }
                if (allowConversationFallback && !strippedConversationId && isInvalidConversation(ex) && payload.hasNonNull("conversation_id")) {
                    log.warn("Dify 会话ID无效，移除 conversation_id 后重试 traceId={} conversationId={} msg={}",
                            traceId,
                            payload.path("conversation_id").asText(),
                            ex.getMessage());
                    payload.remove("conversation_id");
                    strippedConversationId = true;
                    continue;
                }
                if (imagePayload != null) {
                    log.error("图片消息调用 Dify 最终失败 traceId={} switchedToLocalFile={} strippedConversationId={} msg={}",
                            traceId,
                            switchedToLocalFile,
                            strippedConversationId,
                            ex.getMessage(),
                            ex);
                    throw new TransitException(ErrorCode.BAD_REQUEST,
                            "图片已识别，但 Dify 图片处理失败：" + ex.getMessage(), ex);
                }
                throw ex;
            } catch (Exception ex) {
                log.error("图片消息调用 Dify 捕获运行异常 traceId={} attempt={} transferMethod={} exType={} msg={}",
                        traceId,
                        attempt,
                        resolveTransferMethod(payload),
                        ex.getClass().getName(),
                        ex.getMessage(),
                        ex);
                if (imagePayload != null) {
                    log.error("图片消息调用 Dify 最终失败 traceId={} switchedToLocalFile={} strippedConversationId={} exType={} msg={}",
                            traceId,
                            switchedToLocalFile,
                            strippedConversationId,
                            ex.getClass().getName(),
                            ex.getMessage(),
                            ex);
                    throw new TransitException(ErrorCode.BAD_REQUEST,
                            "图片已识别，但 Dify 图片处理失败：" + ex.getMessage(), ex);
                }
                throw new TransitException(ErrorCode.INTERNAL_ERROR, "Dify 对话调用失败", ex);
            }
        }
    }

    private DifyClient.DifyChatResult waitForChatResultWithHeartbeat(
            SseEmitter emitter, ObjectNode payload, Long userId, String imageDataUrl, boolean allowConversationFallback, String traceId, String assistantMode)
            throws Exception {
        CompletableFuture<DifyClient.DifyChatResult> future = CompletableFuture.supplyAsync(
                () -> executeChatWithImageFallback(payload, userId, imageDataUrl, allowConversationFallback, traceId, assistantMode));
        long startedAt = System.currentTimeMillis();
        int heartbeatCount = 0;
        while (true) {
            try {
                return future.get(DIFY_WAIT_HEARTBEAT_MS, TimeUnit.MILLISECONDS);
            } catch (TimeoutException ex) {
                heartbeatCount++;
                long elapsedMs = System.currentTimeMillis() - startedAt;
                String waitingMessage = buildWaitingMessage(imageDataUrl, heartbeatCount, elapsedMs);
                log.info("monitorChatStream 等待 Dify 响应中 traceId={} heartbeatCount={} elapsedMs={} transferMethod={}",
                        traceId,
                        heartbeatCount,
                        elapsedMs,
                        resolveTransferMethod(payload));
                emitter.send(SseEmitter.event().data(new StepMsg("LOGIC", waitingMessage)));
            } catch (InterruptedException ex) {
                Thread.currentThread().interrupt();
                throw new TransitException(ErrorCode.INTERNAL_ERROR, "等待 Dify 响应被中断", ex);
            } catch (ExecutionException ex) {
                Throwable cause = ex.getCause();
                if (cause instanceof Exception exception) {
                    throw exception;
                }
                throw new TransitException(ErrorCode.INTERNAL_ERROR, "Dify 对话调用失败", ex);
            }
        }
    }

    private String buildWaitingMessage(String imageDataUrl, int heartbeatCount, long elapsedMs) {
        long elapsedSeconds = Math.max(1L, elapsedMs / 1000L);
        if (StringUtils.hasText(imageDataUrl)) {
            return "图片已提交给 Dify 分析，正在等待模型返回结果，已等待 " + elapsedSeconds + " 秒（第 " + heartbeatCount + " 次心跳）。";
        }
        return "正在等待 Dify 返回结果，已等待 " + elapsedSeconds + " 秒（第 " + heartbeatCount + " 次心跳）。";
    }

    private String resolveTransferMethod(ObjectNode payload) {
        JsonNode filesNode = payload.path("files");
        if (!filesNode.isArray() || filesNode.isEmpty()) {
            return "none";
        }
        JsonNode fileNode = filesNode.get(0);
        String transferMethod = fileNode.path("transfer_method").asText("");
        return StringUtils.hasText(transferMethod) ? transferMethod : "unknown";
    }

    private ImagePayload parseImagePayload(String imageDataUrl) {
        if (!StringUtils.hasText(imageDataUrl)) {
            return null;
        }
        Matcher matcher = IMAGE_DATA_URL_PATTERN.matcher(imageDataUrl.trim());
        if (!matcher.matches()) {
            throw new TransitException(ErrorCode.BAD_REQUEST, "图片格式不合法，需为 data:image/*;base64,...");
        }
        String mimeType = matcher.group(1).toLowerCase(Locale.ROOT);
        String base64Data = matcher.group(2).replaceAll("\\s+", "");
        byte[] bytes;
        try {
            bytes = Base64.getDecoder().decode(base64Data);
        } catch (IllegalArgumentException ex) {
            throw new TransitException(ErrorCode.BAD_REQUEST, "图片Base64解码失败", ex);
        }
        if (bytes.length == 0) {
            throw new TransitException(ErrorCode.BAD_REQUEST, "图片内容为空");
        }
        if (bytes.length > MAX_IMAGE_BYTES) {
            throw new TransitException(ErrorCode.BAD_REQUEST, "图片体积超过10MB限制");
        }
        String suffix = switch (mimeType) {
            case "image/jpeg", "image/jpg" -> ".jpg";
            case "image/png" -> ".png";
            case "image/gif" -> ".gif";
            default -> ".img";
        };
        String fileName = "wechat-image-" + System.currentTimeMillis() + suffix;
        return new ImagePayload(mimeType, base64Data, bytes, fileName);
    }

    private void attachBase64File(ObjectNode payload, ImagePayload imagePayload) {
        ArrayNode files = objectMapper.createArrayNode();
        ObjectNode fileNode = files.addObject();
        fileNode.put("type", "image");
        fileNode.put("transfer_method", "base64");
        fileNode.put("mime_type", imagePayload.mimeType());
        fileNode.put("data", imagePayload.base64Data());
        payload.set("files", files);
    }

    private void attachLocalFile(ObjectNode payload, Long userId, ImagePayload imagePayload, String traceId, String assistantMode) {
        String uploadFileId = difyClient.uploadChatFile(
                "user-" + userId, imagePayload.fileName(), imagePayload.mimeType(), imagePayload.bytes(), assistantMode);
        log.info("图片已上传到 Dify traceId={} uploadFileId={} fileName={} mimeType={} byteSize={}",
                traceId,
                uploadFileId,
                imagePayload.fileName(),
                imagePayload.mimeType(),
                imagePayload.bytes().length);
        ArrayNode files = objectMapper.createArrayNode();
        ObjectNode fileNode = files.addObject();
        fileNode.put("type", "image");
        fileNode.put("transfer_method", "local_file");
        fileNode.put("upload_file_id", uploadFileId);
        payload.set("files", files);
    }

    private boolean isBase64TransferUnsupported(TransitException ex) {
        String message = ex.getMessage();
        if (!StringUtils.hasText(message)) {
            return false;
        }
        String lower = message.toLowerCase(Locale.ROOT);
        return lower.contains("transfer_method")
                || lower.contains("invalid_param")
                || lower.contains("base64")
                || lower.contains("not support");
    }

    public record UploadKnowledgeBaseDocumentResponse(String knowledgeBaseId, String difyDatasetId, String difyDocumentId) {
    }

    public record MonitorChatRequest(
            Long roleId,
            String message,
            String role,
            String conversationId,
            String wechatContact,
            String wechatContactDisplayName,
            String roomType,
            String imageDataUrl,
            String assistantMode,
            String latestCustomerMessage,
            String imageSummary) {
        public MonitorChatRequest(
                Long roleId,
                String message,
                String role,
                String conversationId,
                String wechatContact,
                String wechatContactDisplayName,
                String roomType,
                String imageDataUrl) {
            this(roleId, message, role, conversationId, wechatContact, wechatContactDisplayName, roomType, imageDataUrl, null, null, null);
        }

        public MonitorChatRequest(
                Long roleId,
                String message,
                String role,
                String conversationId,
                String wechatContact,
                String wechatContactDisplayName,
                String roomType,
                String imageDataUrl,
                String assistantMode) {
            this(roleId, message, role, conversationId, wechatContact, wechatContactDisplayName, roomType, imageDataUrl, assistantMode, null, null);
        }
    }

    public record MonitorChatScreenshotRequest(
            Long roleId,
            String role,
            String wechatContact,
            String wechatContactDisplayName,
            String roomType,
            String assistantMode,
            String imageDataUrl,
            String windowTitle) {
    }

    public record StepMsg(String step, String content) {
    }

    private record ReplyPlan(String replyText, List<OutboundMaterialEntity> attachments) {
    }

    private record ImagePayload(String mimeType, String base64Data, byte[] bytes, String fileName) {
    }
}
