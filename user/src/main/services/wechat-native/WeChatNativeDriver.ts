import { app, nativeImage, type NativeImage } from 'electron'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { createHash } from 'crypto'
import { recognizeUnreadConversationCandidate } from './conversationListRecognizer'
import { clickConversationCandidate, clickMarketingPoint, clickMomentsEntry, closeMomentsWindow, exitConversationToList, pasteAndSendText, pasteMarketingComment, returnFromNestedConversation } from './inputBackend'
import { captureWeChatWindow } from './screenReader'
import { comparePngSnapshots } from './snapshotDiff'
import { findUnreadConversationCandidates } from './unreadDetector'
import { parseWeChatSnapshotWithVision, recognizeMarketingMomentsWithVision } from './visionClient'
import { findWeChatMomentsWindow, findWeChatWindow, focusWindow, isPlausibleWeChatWindow } from './windowLocator'
import { applyMessageVisionGuard, type MessageVisionGuardContext } from './messageVisionGuard'
import { getSpecialConversationRule } from './specialConversationGuard'
import type {
  ConversationListItemRecognition,
  MarketingMomentCandidate,
  MarketingMomentPoint,
  ManagedMode,
  NativeDriverMessage,
  NativeDriverResult,
  ParsedWeChatMessage,
  ParsedWeChatSnapshot,
  UnreadConversationCandidate,
  WeChatChannel,
  MarketingLikeMenuAction,
  WeChatMessageBounds,
  WeChatMessageType,
  WeChatScreenshot,
  WeChatVisionRuntimeConfig,
  WindowBounds
} from './types'

const MAX_PERSISTED_REPLIED_MESSAGES = 200
const REPLIED_CUSTOMER_FINGERPRINT_TTL_MS = 24 * 60 * 60_000
const IMAGE_REPLIED_CUSTOMER_FINGERPRINT_TTL_MS = 24 * 60 * 60_000
const NATIVE_POLL_INTERVAL_MS = 1500
const MAX_CONSECUTIVE_VISION_FAILURES = 3
const UNREAD_SWITCH_SETTLE_MIN_MS = 320
const UNREAD_SWITCH_SETTLE_MAX_MS = 760
const SKIPPED_CANDIDATE_TTL_MS = 60_000
const RECENT_SENT_SELF_REPLY_TTL_MS = 5 * 60_000
const MAX_RECENT_MESSAGE_CONTENT_FINGERPRINTS = 1000
const MAX_RECENT_SENT_SELF_REPLY_CONTENTS = 120
const MIN_SELF_REPLY_PARTIAL_MATCH_LENGTH = 8
const MIN_CURRENT_CHAT_MESSAGE_CHANGE_RATIO = 0.002
const IMAGE_MESSAGE_CACHE_TTL_MS = 2 * 60_000
const IMAGE_CROP_PADDING_PX = 6
const IMAGE_CROP_REFINEMENT_MIN_SIZE_PX = 40
const IMAGE_CROP_REFINEMENT_KEEP_ORIGINAL_RATIO = 0.85
const IMAGE_CROP_REFINEMENT_MIN_WIDTH_RATIO = 0.42
const IMAGE_CROP_REFINEMENT_MIN_HEIGHT_RATIO = 0.35
const IMAGE_CROP_REFINEMENT_MIN_WIDTH_PX = 360
const IMAGE_CROP_REFINEMENT_MIN_HEIGHT_PX = 320
const IMAGE_CROP_CONTENT_DENSE_RATIO = 0.04
const IMAGE_CROP_SEARCH_HORIZONTAL_PADDING_PX = 24
const IMAGE_CROP_SEARCH_TOP_PADDING_PX = 24
const IMAGE_CROP_SEARCH_BOTTOM_MIN_EXTENSION_PX = 180
const IMAGE_CROP_SEARCH_BOTTOM_RATIO = 1.4
const IMAGE_REPLY_SIGNATURE_GRID_SIZE = 8
const IMAGE_REPLY_SIGNATURE_COLOR_BUCKET_SIZE = 32
const MARKETING_IDLE_COOLDOWN_MS = 15_000
const MARKETING_MIN_CONFIDENCE = 0.78
const MAX_MARKETING_RECORDS = 2000
const MAX_MARKETING_COMMENT_LENGTH = 120
const MARKETING_LIKE_MENU_SCAN_LEFT_PX = 180
const MARKETING_LIKE_MENU_SCAN_RIGHT_PX = 30
const MARKETING_LIKE_MENU_SCAN_VERTICAL_PX = 52
const MARKETING_LIKE_MENU_MIN_DARK_PIXELS = 80
const MARKETING_LIKE_MENU_MIN_WIDTH_PX = 48
const MARKETING_LIKE_MENU_MIN_HEIGHT_PX = 20
const MARKETING_LIKE_MENU_MIN_DARK_RATIO = 0.16
const MARKETING_LIKE_MENU_RIGHT_EDGE_TOLERANCE_PX = 24
const MARKETING_LIKE_POINT_RIGHT_EXTENSION_PX = 160
const MARKETING_ACTION_POINT_PADDING_PX = 16
const MARKETING_MENU_DOT_SCAN_START_RATIO = 0.55
const MARKETING_MENU_DOT_SCAN_TOP_PX = 32
const MARKETING_MENU_DOT_SCAN_BOTTOM_PADDING_PX = 24
const MARKETING_MENU_DOT_RADIUS_PX = 3
const MARKETING_MENU_DOT_MIN_PIXELS = 8
const MARKETING_MENU_DOT_PAIR_SPACING_PX = 8
const MARKETING_MENU_DOT_MERGE_X_PX = 18
const MARKETING_MENU_DOT_MERGE_Y_PX = 10
const MARKETING_LOCAL_DIGEST_CROP_WIDTH_PX = 280
const MARKETING_LOCAL_DIGEST_CROP_HEIGHT_PX = 220
const MARKETING_LOCAL_DIGEST_GRID_SIZE = 8
const MARKETING_LOCAL_DIGEST_COLOR_BUCKET_SIZE = 32
const MARKETING_BLUE_MENU_SCAN_START_RATIO = 0.62
const MARKETING_BLUE_MENU_COMPONENT_MIN_PIXELS = 90
const MARKETING_BLUE_MENU_COMPONENT_MIN_WIDTH_PX = 18
const MARKETING_BLUE_MENU_COMPONENT_MIN_HEIGHT_PX = 16
const MARKETING_BLUE_MENU_COMPONENT_MAX_WIDTH_PX = 80
const MARKETING_BLUE_MENU_COMPONENT_MAX_HEIGHT_PX = 70
const MARKETING_BLUE_MENU_DOT_MIN_PIXELS = 8
const MARKETING_LIKE_STATUS_SCAN_LEFT_PX = 36
const MARKETING_LIKE_STATUS_SCAN_RIGHT_PX = 36
const MARKETING_LIKE_STATUS_SCAN_VERTICAL_PX = 22
const MARKETING_LIKE_STATUS_MIN_RED_PIXELS = 18
const MARKETING_LIKE_STATUS_MIN_LIGHT_PIXELS = 80
const MARKETING_COMMENT_CONFIRM_OFFSET_X_PX = 108
const MARKETING_COMMENT_STATUS_SCAN_LEFT_PX = 36
const MARKETING_COMMENT_STATUS_SCAN_RIGHT_PX = 36
const MARKETING_COMMENT_STATUS_SCAN_VERTICAL_PX = 22
const MARKETING_COMMENT_STATUS_MIN_LIGHT_PIXELS = 80
const MARKETING_COMMENT_STATUS_MIN_DARK_PIXELS = 1600
const MARKETING_COMMENT_STATUS_MIXED_MIN_LIGHT_PIXELS = 2000
const MARKETING_COMMENT_STATUS_MIXED_MIN_DARK_PIXELS = 900
const MARKETING_CLOSE_AFTER_SUCCESS_MIN_DELAY_MS = 1200
const MARKETING_CLOSE_AFTER_SUCCESS_MAX_DELAY_MS = 2000

const wait = (milliseconds: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

const clampNumber = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value))

type ImageCropRect = {
  x: number
  y: number
  width: number
  height: number
}

type DenseSpan = {
  start: number
  end: number
}

type ImageContentBounds = {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

type RepliedMessageStore = {
  version: number
  fingerprints?: string[]
  records?: RepliedMessageRecord[]
}

type RepliedMessageRecord = {
  fingerprint: string
  expiresAt: number
}

type CachedImageMessage = {
  contact: string
  uiId: string
  bounds: WeChatMessageBounds
  screenshot: WeChatScreenshot
  expiresAt: number
}

type MarketingActionType = 'like' | 'comment'

type MarketingActionRecord = {
  date: string
  action: MarketingActionType
  author: string
  postFingerprint: string
  timeText?: string
  localVisualDigest?: string
  outcome?: 'liked' | 'commented' | 'skipped'
  createdAt: number
}

type MarketingActionStore = {
  version: number
  records?: MarketingActionRecord[]
}

type MarketingLikeClickResult = {
  ok: boolean
  error?: string
  menuPoint?: MarketingMomentPoint
  confirmPoint?: MarketingMomentPoint
}

type MarketingMenuPointCandidate = {
  point: MarketingMomentPoint
  score: number
  source?: 'blue_action_button' | 'dark_two_dot' | 'dark_three_dot'
}

type MarketingLocalVisualDigest = {
  point: MarketingMomentPoint
  digest: string
}

type MarketingCommentGenerationResult = {
  content: string
  error?: string
  message?: string
}

export class WeChatNativeDriver {
  private running = false
  private managedMode: ManagedMode = 'full'
  private seenMessageFingerprints = new Set<string>()
  private recentMessageContentFingerprints = new Map<string, number>()
  private recentSentSelfReplyContents = new Map<string, { contact: string; content: string; expiresAt: number }>()
  private repliedCustomerFingerprints = new Map<string, number>()
  private repliedCustomerFingerprintOrder: string[] = []
  private lastWindow: WindowBounds | null = null
  private storeLoaded = false
  private channel: WeChatChannel = 'personal'
  private runtimeConfig: WeChatVisionRuntimeConfig = { backendBaseUrl: '', token: '', tenantId: '1', channel: 'personal' }
  private lastPollAt = 0
  private lastScreenshotPng: Buffer | null = null
  private lastSnapshotDigest = ''
  private visionRequestRunning = false
  private consecutiveVisionFailures = 0
  private lastVisionErrorMessage = ''
  private runGeneration = 0
  private activeReplySessionKey = ''
  private pendingReplySessionKey = ''
  private skippedConversationCandidates = new Map<string, number>()
  private latestSnapshotScreenshot: WeChatScreenshot | null = null
  private latestSnapshotHasPixelGuard = false
  private startupBaselinePending = false
  private latestSnapshotFromUnreadSwitch = false
  private cachedImageMessages = new Map<string, CachedImageMessage>()
  private marketingCommandRunning = false
  private marketingActionStoreLoaded = false
  private marketingActionRecords: MarketingActionRecord[] = []
  private lastWechatActivityAt = 0

  configure(config: Partial<WeChatVisionRuntimeConfig>): NativeDriverResult {
    const nextChannel: WeChatChannel = config.channel === 'enterprise' ? 'enterprise' : 'personal'
    this.channel = nextChannel
    this.runtimeConfig = {
      backendBaseUrl: String(config.backendBaseUrl || '').trim(),
      token: String(config.token || '').trim(),
      tenantId: String(config.tenantId || '1').trim() || '1',
      channel: nextChannel
    }
    console.info('新方式视觉解析配置已更新', {
      hasBackendBaseUrl: !!this.runtimeConfig.backendBaseUrl,
      hasToken: !!this.runtimeConfig.token,
      tenantId: this.runtimeConfig.tenantId,
      channel: this.channel
    })
    return { ok: true, mode: 'native' }
  }

  async start(): Promise<NativeDriverResult> {
    await this.loadRepliedCustomerFingerprints()
    const window = await findWeChatWindow(this.channel)
    if (!window) {
      return { ok: false, error: 'wechat_window_not_found', message: '新方式未找到微信窗口，请先打开并登录微信' }
    }
    await focusWindow(window.hwnd)
    this.lastWindow = window
    this.running = true
    this.runGeneration += 1
    this.seenMessageFingerprints.clear()
    this.recentMessageContentFingerprints.clear()
    this.recentSentSelfReplyContents.clear()
    this.lastPollAt = 0
    this.lastScreenshotPng = null
    this.lastSnapshotDigest = ''
    this.consecutiveVisionFailures = 0
    this.lastVisionErrorMessage = ''
    this.activeReplySessionKey = ''
    this.pendingReplySessionKey = ''
    this.skippedConversationCandidates.clear()
    this.latestSnapshotScreenshot = null
    this.latestSnapshotHasPixelGuard = false
    this.startupBaselinePending = true
    this.latestSnapshotFromUnreadSwitch = false
    this.cachedImageMessages.clear()
    this.marketingCommandRunning = false
    this.lastWechatActivityAt = 0
    console.info('新方式微信视觉驱动已启动', {
      title: window.title,
      className: window.className,
      processName: window.processName,
      repliedCustomerCount: this.repliedCustomerFingerprints.size,
      bounds: { x: window.x, y: window.y, width: window.width, height: window.height }
    })
    return { ok: true, mode: 'native' }
  }

  async stop(): Promise<NativeDriverResult> {
    this.running = false
    this.runGeneration += 1
    this.seenMessageFingerprints.clear()
    this.recentMessageContentFingerprints.clear()
    this.recentSentSelfReplyContents.clear()
    this.lastScreenshotPng = null
    this.lastSnapshotDigest = ''
    this.visionRequestRunning = false
    this.lastVisionErrorMessage = ''
    this.activeReplySessionKey = ''
    this.pendingReplySessionKey = ''
    this.latestSnapshotScreenshot = null
    this.latestSnapshotHasPixelGuard = false
    this.startupBaselinePending = false
    this.latestSnapshotFromUnreadSwitch = false
    this.cachedImageMessages.clear()
    this.marketingCommandRunning = false
    console.info('新方式微信视觉驱动已停止')
    return { ok: true, mode: 'native' }
  }

  async poll(): Promise<NativeDriverResult> {
    if (!this.running) {
      return { ok: true, messages: [] }
    }
    const pollGeneration = this.runGeneration
    const nowMs = Date.now()
    if (this.lastPollAt > 0 && nowMs - this.lastPollAt < NATIVE_POLL_INTERVAL_MS) {
      return { ok: true, messages: [] }
    }
    if (this.visionRequestRunning) {
      console.info('新方式上一轮视觉解析仍在执行，本轮跳过')
      return { ok: true, messages: [] }
    }
    this.lastPollAt = nowMs

    const window = await findWeChatWindow(this.channel)
    if (!window) {
      return { ok: false, error: 'wechat_window_not_found', message: '新方式未找到微信窗口' }
    }
    this.lastWindow = window
    this.cleanupExpiredSkippedCandidates(nowMs)
    const snapshot = await this.readSnapshotIfChanged(window)
    if (!snapshot) {
      if (this.consecutiveVisionFailures >= MAX_CONSECUTIVE_VISION_FAILURES && this.lastVisionErrorMessage) {
        return { ok: false, error: 'vision_parse_failed', message: this.lastVisionErrorMessage }
      }
      return { ok: true, messages: [] }
    }
    if (!this.running || pollGeneration !== this.runGeneration) {
      console.info('新方式本轮视觉解析跨过停止或重启，丢弃过期消息结果', {
        pollGeneration,
        currentGeneration: this.runGeneration,
        messageCount: snapshot.messages.length
      })
      return { ok: true, messages: [] }
    }
    const snapshotSpecialRule = getSpecialConversationRule(snapshot.contact, snapshot.accountCategory, snapshot.skipReason)
    if (snapshot.skipAutoReply || snapshotSpecialRule) {
      if (snapshotSpecialRule) {
        snapshot.accountCategory = snapshotSpecialRule.accountCategory
        snapshot.skipReason = snapshotSpecialRule.skipReason
        snapshot.skipAutoReply = true
      }
      await this.handleSkippedSnapshot(window, snapshot)
      return { ok: true, messages: [] }
    }
    if (snapshot.messages.length === 0) {
      this.startupBaselinePending = false
      return { ok: true, messages: [] }
    }

    if (this.startupBaselinePending && !this.latestSnapshotFromUnreadSwitch && this.latestSnapshotHasPixelGuard) {
      this.markSnapshotAsBaseline(snapshot)
      this.startupBaselinePending = false
      console.info('微信视觉启动基线已建立，当前可见历史消息不进入实时消息列表', {
        contact: snapshot.contact,
        messageCount: snapshot.messages.length
      })
      return { ok: true, messages: [] }
    }
    this.startupBaselinePending = false

    const hadPreviousBaseline = this.seenMessageFingerprints.size > 0
    const latestVisibleMessage = snapshot.messages[snapshot.messages.length - 1]
    const latestVisibleCustomerKey = latestVisibleMessage && !latestVisibleMessage.isSelf
      ? this.buildFingerprint(snapshot.contact, latestVisibleMessage.content, latestVisibleMessage.isSelf, latestVisibleMessage.uiId)
      : ''
    const snapshotSessionKey = this.buildSessionKey(snapshot.contact)

    const messages: NativeDriverMessage[] = []
    const observedContentFingerprints = new Set<string>()
    const currentSnapshotLatestFingerprintByContent = this.buildLatestFingerprintByContent(snapshot)
    let hasNewReplyTrigger = false
    this.cleanupRecentSentSelfReplyContents(Date.now())
    this.cleanupCachedImageMessages(Date.now())
    for (const parsedMessage of snapshot.messages) {
      const parsedMessageType = this.normalizeMessageType(parsedMessage)
      const fingerprint = this.buildFingerprint(snapshot.contact, parsedMessage.content, parsedMessage.isSelf, parsedMessage.uiId)
      const contentFingerprint = this.buildParsedMessageContentFingerprint(snapshot.contact, parsedMessage)
      const customerReplyFingerprint = this.buildCustomerReplyFingerprint(snapshot.contact, parsedMessage)
      observedContentFingerprints.add(contentFingerprint)
      if (currentSnapshotLatestFingerprintByContent.get(contentFingerprint) !== fingerprint) {
        this.seenMessageFingerprints.add(fingerprint)
        console.info('新方式识别到同一轮重复消息，已保留最新气泡并跳过较早重复项', {
          contact: snapshot.contact,
          content: parsedMessage.content.slice(0, 40),
          isSelf: parsedMessage.isSelf,
          uiId: parsedMessage.uiId
        })
        continue
      }
      if (this.seenMessageFingerprints.has(fingerprint)) {
        continue
      }
      if (this.recentMessageContentFingerprints.has(contentFingerprint)) {
        this.seenMessageFingerprints.add(fingerprint)
        console.info('新方式识别到疑似重复消息，已按内容指纹跳过', {
          contact: snapshot.contact,
          content: parsedMessage.content.slice(0, 40),
          isSelf: parsedMessage.isSelf,
          uiId: parsedMessage.uiId
        })
        continue
      }
      this.seenMessageFingerprints.add(fingerprint)
      if (!parsedMessage.isSelf && this.isRecentSentSelfReplyContent(snapshot.contact, parsedMessage.content)) {
        console.info('新方式识别到视觉模型疑似把最近己方自动回复片段标成客户消息，已跳过触发', {
          contact: snapshot.contact,
          content: parsedMessage.content.slice(0, 40),
          uiId: parsedMessage.uiId
        })
        continue
      }
      if (parsedMessage.isSelf) {
        console.info('新方式轮询识别到己方消息，仅更新基线不追加显示', {
          contact: snapshot.contact,
          content: parsedMessage.content.slice(0, 40),
          uiId: parsedMessage.uiId
        })
        continue
      }

      const hasReliableCustomerTriggerGeometry = this.hasReliableCustomerTriggerGeometry(parsedMessage)
      if (!hasReliableCustomerTriggerGeometry) {
        console.info('微信视觉解析跳过无可信坐标的客户消息触发，仅保留为可见消息', {
          contact: snapshot.contact,
          content: parsedMessage.content.slice(0, 40),
          uiId: parsedMessage.uiId,
          type: parsedMessageType,
          bounds: parsedMessage.bounds
        })
      }

      const isLatestVisibleCustomerMessage = fingerprint === latestVisibleCustomerKey
      const hasRepliedCustomerMessage = this.hasRepliedCustomerFingerprint(customerReplyFingerprint)
      const shouldDisplayCustomerMessage = isLatestVisibleCustomerMessage &&
        hasReliableCustomerTriggerGeometry &&
        !hasRepliedCustomerMessage
      const shouldTriggerReply = shouldDisplayCustomerMessage && this.managedMode === 'full'

      if (shouldTriggerReply) {
        hasNewReplyTrigger = true
        this.pendingReplySessionKey = snapshotSessionKey
        await this.markCustomerMessageReplied(customerReplyFingerprint)
      }
      if (!shouldTriggerReply && !hadPreviousBaseline) {
        console.info('新方式首次扫描跳过当前可见历史消息', {
          contact: snapshot.contact,
          content: parsedMessage.content.slice(0, 40),
          isSelf: parsedMessage.isSelf
        })
        continue
      }

      if (!shouldDisplayCustomerMessage) {
        console.info('微信视觉解析跳过非最新或已处理的客户可见消息，仅保留基线', {
          contact: snapshot.contact,
          content: parsedMessage.content.slice(0, 40),
          uiId: parsedMessage.uiId,
          type: parsedMessageType,
          isLatestVisibleCustomerMessage,
          hasReliableCustomerTriggerGeometry,
          hasRepliedCustomerMessage
        })
        continue
      }

      const now = Date.now()
      if (!parsedMessage.isSelf && (parsedMessageType === 'image' || parsedMessageType === 'sticker')) {
        this.cacheImageMessage(snapshot.contact, parsedMessage)
      }
      messages.push({
        id: `${parsedMessage.uiId}-${now}`,
        contact: snapshot.contact,
        content: parsedMessage.content,
        timestamp: now,
        type: parsedMessageType,
        is_self: parsedMessage.isSelf,
        trigger_reply: shouldTriggerReply,
        ui_id: parsedMessage.uiId,
        bounds: parsedMessage.bounds,
        source: this.channel,
        conversation_type: snapshot.conversationType,
        account_category: snapshot.accountCategory,
        skip_auto_reply: snapshot.skipAutoReply,
        skip_reason: snapshot.skipReason
      })
    }
    for (const contentFingerprint of observedContentFingerprints) {
      this.markRecentMessageContentFingerprint(contentFingerprint)
    }

    if (messages.length > 0) {
      this.lastWechatActivityAt = Date.now()
      console.info('新方式读取到微信消息', {
        contact: snapshot.contact,
        count: messages.length,
        hasNewReplyTrigger,
        conversationType: snapshot.conversationType,
        accountCategory: snapshot.accountCategory,
        messages: messages.map((message) => ({
          content: message.content,
          type: message.type,
          isSelf: message.is_self,
          triggerReply: message.trigger_reply
        }))
      })
    }
    return { ok: true, messages }
  }

  async send(payload: { target?: string; content?: string }): Promise<NativeDriverResult> {
    const content = String(payload?.content || '').trim()
    if (!content) {
      return { ok: false, error: 'empty_content', message: '发送内容为空' }
    }
    const window = await findWeChatWindow(this.channel)
    if (!window || !isPlausibleWeChatWindow(window, this.channel)) {
      return { ok: false, error: 'wechat_window_not_found', message: '新方式未找到可信微信窗口，无法发送消息' }
    }
    this.lastWindow = window
    this.lastWechatActivityAt = Date.now()
    await focusWindow(window.hwnd)
    const success = await pasteAndSendText(window, content)
    const targetContact = String(payload.target || window.title || '微信').trim() || '微信'
    if (success) {
      this.seenMessageFingerprints.add(this.buildFingerprint(targetContact, content, true))
      this.markRecentSentSelfReplyContent(targetContact, content)
      setTimeout(() => {
        this.refreshBaseline(window).catch((error) => {
          console.warn('新方式发送后刷新消息基线失败', error)
        })
      }, 800)
    }
    if (success) {
      return {
        ok: true,
        success: true,
        mode: 'native',
        sentMessage: this.buildSentSelfMessage(targetContact, content)
      }
    }
    return { ok: false, success: false, error: 'send_failed', message: '新方式发送失败' }
  }

  async command(payload: Record<string, any>): Promise<NativeDriverResult> {
    const action = String(payload?.action || '').trim()
    if (action === 'set_managed_mode') {
      return this.setManagedMode(payload?.mode)
    }
    if (action === 'copy_image_message') {
      return this.copyImageMessage(payload)
    }
    if (action === 'reply_session_started') {
      return this.markReplySessionStarted(payload?.sessionKey)
    }
    if (action === 'reply_session_finished') {
      return this.markReplySessionFinished(payload?.sessionKey)
    }
    if (action === 'marketing_like') {
      return this.runMarketingCommand('like', payload?.config || payload)
    }
    if (action === 'marketing_comment') {
      return this.runMarketingCommand('comment', payload?.config || payload)
    }
    if (payload?.target && payload?.content) {
      return this.send({ target: String(payload.target), content: String(payload.content) })
    }
    return { ok: false, error: 'native_command_unsupported', message: `新方式暂不支持该微信指令：${action || '未知指令'}` }
  }

  async setManagedMode(mode: unknown): Promise<NativeDriverResult> {
    this.managedMode = mode === 'semi' ? 'semi' : 'full'
    console.info('新方式托管模式已更新', { managedMode: this.managedMode })
    return { ok: true, mode: this.managedMode }
  }

  async copyImageMessage(payload?: { messageUiId?: unknown; senderId?: unknown }): Promise<NativeDriverResult> {
    this.cleanupCachedImageMessages(Date.now())
    const messageUiId = String(payload?.messageUiId || '').trim()
    const senderId = String(payload?.senderId || '').trim()
    const cached = this.findCachedImageMessage(messageUiId, senderId)
    if (!cached) {
      return { ok: false, error: 'native_image_not_found', message: '未找到可裁剪的微信图片气泡' }
    }
    const sourceImage = nativeImage.createFromBuffer(cached.screenshot.png)
    if (sourceImage.isEmpty()) {
      return { ok: false, error: 'native_image_snapshot_invalid', message: '微信截图为空，无法裁剪图片' }
    }
    const sourceSize = sourceImage.getSize()
    const initialCropRect = this.buildImageCropRect(cached.bounds, sourceSize.width, sourceSize.height)
    const searchCropRect = this.buildExpandedImageSearchRect(cached.bounds, sourceSize.width, sourceSize.height)
    const cropRect = this.refineImageCropRect(sourceImage, initialCropRect, true, searchCropRect)
    const croppedImage = sourceImage.crop(cropRect)
    if (croppedImage.isEmpty()) {
      return { ok: false, error: 'native_image_crop_empty', message: '微信图片裁剪结果为空' }
    }
    const croppedSize = croppedImage.getSize()
    console.info('新方式已从微信截图裁剪图片消息', {
      contact: cached.contact,
      uiId: cached.uiId,
      cropRect,
      width: croppedSize.width,
      height: croppedSize.height
    })
    return {
      ok: true,
      dataUrl: croppedImage.toDataURL(),
      width: croppedSize.width,
      height: croppedSize.height,
      source: 'screenshot_crop',
      uiId: cached.uiId
    }
  }

  private async markReplySessionStarted(sessionKey: unknown): Promise<NativeDriverResult> {
    const normalizedSessionKey = String(sessionKey || '').trim()
    if (!normalizedSessionKey) {
      return { ok: false, error: 'empty_session_key', message: '开始回复时缺少会话标识' }
    }
    this.activeReplySessionKey = normalizedSessionKey
    this.pendingReplySessionKey = normalizedSessionKey
    console.info('新方式已锁定当前回复会话', { sessionKey: normalizedSessionKey })
    return { ok: true, sessionKey: normalizedSessionKey }
  }

  private async markReplySessionFinished(sessionKey: unknown): Promise<NativeDriverResult> {
    const normalizedSessionKey = String(sessionKey || '').trim()
    if (normalizedSessionKey && this.activeReplySessionKey && this.activeReplySessionKey !== normalizedSessionKey) {
      console.info('新方式收到其他会话的结束通知，保留当前锁定会话', {
        sessionKey: normalizedSessionKey,
        activeReplySessionKey: this.activeReplySessionKey
      })
      return { ok: true, sessionKey: this.activeReplySessionKey, ignored: true }
    }
    console.info('新方式已释放当前回复会话锁', {
      sessionKey: normalizedSessionKey || this.activeReplySessionKey || this.pendingReplySessionKey
    })
    this.activeReplySessionKey = ''
    this.pendingReplySessionKey = ''
    return { ok: true }
  }

  private async runMarketingCommand(action: MarketingActionType, rawConfig: Record<string, any>): Promise<NativeDriverResult> {
    if (rawConfig?.enabled === false) {
      return this.skipMarketingAction('marketing_disabled', '朋友圈营销配置未启用')
    }
    const busyReason = this.getMarketingBusyReason()
    if (busyReason) {
      return this.skipMarketingAction(busyReason, '当前微信窗口不适合执行朋友圈互动')
    }
    this.marketingCommandRunning = true
    try {
      await this.loadMarketingActionRecords()
      const window = await findWeChatWindow(this.channel)
      if (!window || !isPlausibleWeChatWindow(window, this.channel)) {
        return this.skipMarketingAction('wechat_window_not_found', '未找到可信个人微信窗口')
      }
      this.lastWindow = window
      const enteredMoments = await this.enterMomentsForMarketing(window)
      if (!enteredMoments) {
        return this.skipMarketingAction('moments_entry_click_failed', '朋友圈入口点击失败，已跳过本轮互动')
      }
      const momentsWindow = await findWeChatMomentsWindow(window, this.channel)
      if (!momentsWindow) {
        return this.skipMarketingAction('moments_window_not_found', '未找到朋友圈独立窗口，已跳过本轮互动')
      }
      const screenshot = await captureWeChatWindow(momentsWindow)
      const localVisualDigests = this.buildMarketingLocalVisualDigests(screenshot)
      const localDigestDuplicateError = this.getMarketingLocalVisualDigestDuplicateError(action, localVisualDigests)
      if (localDigestDuplicateError) {
        return this.skipMarketingAction(localDigestDuplicateError, '朋友圈动态本地摘要已处理过，已跳过本轮点赞')
      }
      const recognition = await recognizeMarketingMomentsWithVision(
        screenshot.dataUrl,
        momentsWindow,
        this.lastSnapshotDigest,
        this.runtimeConfig
      )
      const selection = this.selectMarketingCandidate(action, recognition.moments, screenshot, rawConfig)
      if (!selection.candidate) {
        return this.skipMarketingAction(selection.error || 'no_candidate', '没有可安全互动的朋友圈动态')
      }
      const candidate = selection.candidate
      let menuPoint: MarketingMomentPoint | null = null
      if (action === 'like' || action === 'comment') {
        menuPoint = this.resolveMarketingLikeMenuPoint(screenshot, recognition.moments, selection.candidateIndex, candidate)
        if (!menuPoint) {
          return this.skipMarketingAction(
            action === 'like' ? 'like_menu_point_not_found' : 'comment_menu_point_not_found',
            action === 'like' ? '未在朋友圈截图内确认到可匹配的点赞菜单入口' : '未在朋友圈截图内确认到可匹配的评论菜单入口',
            candidate.author
          )
        }
        candidate.localVisualDigest = this.resolveMarketingLocalVisualDigest(localVisualDigests, menuPoint)
      }

      const postFingerprint = this.buildMarketingPostFingerprint(candidate)
      const legacyPostFingerprint = this.buildMarketingLegacyPostBoundsFingerprint(candidate)
      const limitError = this.getMarketingLimitError(
        action,
        rawConfig,
        candidate.author,
        postFingerprint,
        candidate.localVisualDigest,
        legacyPostFingerprint
      )
      if (limitError) {
        return this.skipMarketingAction(limitError, '朋友圈互动已达到配置上限或已处理过该动态', candidate.author)
      }

      let commentContent = ''
      if (action === 'comment') {
        const commentGeneration = await this.generateMarketingComment(candidate, rawConfig)
        commentContent = commentGeneration.content
        if (!commentContent) {
          return this.skipMarketingAction(
            commentGeneration.error || 'comment_generation_failed',
            commentGeneration.message || '评论生成失败，已跳过本轮朋友圈评论',
            candidate.author
          )
        }
      }

      if (action === 'like') {
        const likeResult = await this.clickMarketingLikeThroughMenu(momentsWindow, candidate, menuPoint)
        if (!likeResult.ok) {
          if (likeResult.error === 'like_menu_is_unlike' || likeResult.error === 'like_menu_action_unconfirmed') {
            await this.closeMomentsWindowAfterUnsafeMarketingMenu(momentsWindow, likeResult.error, candidate.author)
          }
          return this.skipMarketingAction(likeResult.error || 'click_failed', '朋友圈点赞菜单确认或点击失败', candidate.author)
        }
      } else {
        const commentResult = await this.clickMarketingCommentThroughMenu(momentsWindow, candidate, menuPoint)
        if (!commentResult.ok) {
          if (commentResult.error === 'comment_menu_action_unconfirmed') {
            await this.closeMomentsWindowAfterUnsafeMarketingMenu(momentsWindow, commentResult.error, candidate.author)
          }
          return this.skipMarketingAction(commentResult.error || 'click_failed', '朋友圈评论菜单确认或点击失败', candidate.author)
        }
        await wait(420 + Math.floor(Math.random() * 520))
        const commented = await pasteMarketingComment(momentsWindow, commentContent)
        if (!commented) {
          return this.skipMarketingAction('comment_send_failed', '朋友圈评论发送失败', candidate.author)
        }
      }

      await this.recordMarketingAction(action, candidate, postFingerprint)
      await this.closeMomentsWindowAfterMarketing(momentsWindow, action, candidate.author)
      console.info('个人微信朋友圈互动已执行', {
        action,
        author: candidate.author,
        confidence: candidate.confidence,
        postFingerprint
      })
      return { ok: true, performed: true, action, author: candidate.author, postFingerprint }
    } catch (error: any) {
      console.warn('个人微信朋友圈互动执行异常，已跳过本轮', {
        action,
        error: error?.message || String(error)
      })
      return this.skipMarketingAction('marketing_action_failed', '朋友圈互动执行异常')
    } finally {
      this.marketingCommandRunning = false
    }
  }

  private getMarketingBusyReason(): string {
    if (!this.running) {
      return 'bridge_not_running'
    }
    if (this.channel !== 'personal') {
      return 'unsupported_channel'
    }
    if (this.managedMode !== 'full') {
      return 'unsupported_managed_mode'
    }
    if (this.activeReplySessionKey || this.pendingReplySessionKey || this.visionRequestRunning || this.marketingCommandRunning) {
      return 'busy_not_idle'
    }
    if (this.lastWechatActivityAt > 0 && Date.now() - this.lastWechatActivityAt < MARKETING_IDLE_COOLDOWN_MS) {
      return 'busy_not_idle'
    }
    return ''
  }

  private skipMarketingAction(error: string, message: string, author = ''): NativeDriverResult {
    console.info('个人微信朋友圈互动跳过', { error, message, author })
    return { ok: true, skipped: true, error, message, author }
  }

  private async enterMomentsForMarketing(window: WindowBounds): Promise<boolean> {
    // 营销互动必须先进入朋友圈页面，但点赞/评论仍由视觉候选和本地坐标校验决定。
    const clicked = await clickMomentsEntry(window)
    if (!clicked) {
      console.warn('个人微信朋友圈入口点击失败，已跳过本轮营销互动', {
        processName: window.processName,
        title: window.title
      })
      return false
    }
    await wait(900 + Math.floor(Math.random() * 500))
    return true
  }

  private async closeMomentsWindowAfterMarketing(
    window: WindowBounds,
    action: MarketingActionType,
    author: string
  ): Promise<void> {
    try {
      const delayMs = MARKETING_CLOSE_AFTER_SUCCESS_MIN_DELAY_MS +
        Math.floor(Math.random() * (MARKETING_CLOSE_AFTER_SUCCESS_MAX_DELAY_MS - MARKETING_CLOSE_AFTER_SUCCESS_MIN_DELAY_MS + 1))
      console.info('个人微信朋友圈互动成功，准备延迟关闭朋友圈窗口', {
        action,
        author,
        hwnd: window.hwnd,
        delayMs
      })
      await wait(delayMs)
      const closed = await closeMomentsWindow(window)
      if (!closed) {
        console.warn('个人微信朋友圈互动成功后关闭朋友圈窗口失败', {
          action,
          author,
          hwnd: window.hwnd
        })
        return
      }
      console.info('个人微信朋友圈互动成功后已关闭朋友圈窗口', {
        action,
        author,
        hwnd: window.hwnd
      })
    } catch (error) {
      console.warn('个人微信朋友圈互动成功后关闭朋友圈窗口异常', {
        action,
        author,
        hwnd: window.hwnd,
        error
      })
    }
  }

  private async closeMomentsWindowAfterUnsafeMarketingMenu(
    window: WindowBounds,
    error: string,
    author: string
  ): Promise<void> {
    try {
      const closed = await closeMomentsWindow(window)
      if (!closed) {
        console.warn('个人微信朋友圈互动菜单不安全，关闭朋友圈窗口失败', {
          error,
          author,
          hwnd: window.hwnd
        })
        return
      }
      console.info('个人微信朋友圈互动菜单不安全，已关闭朋友圈窗口避免误触', {
        error,
        author,
        hwnd: window.hwnd
      })
    } catch (closeError) {
      console.warn('个人微信朋友圈互动菜单不安全，关闭朋友圈窗口异常', {
        error,
        author,
        hwnd: window.hwnd,
        closeError
      })
    }
  }

  private resolveMarketingLikeMenuPoint(
    screenshot: WeChatScreenshot,
    candidates: MarketingMomentCandidate[],
    candidateIndex: number,
    candidate: MarketingMomentCandidate
  ): MarketingMomentPoint | null {
    const menuCandidates = this.findMarketingMenuPointCandidates(screenshot)
    if (menuCandidates.length === 0) {
      console.info('个人微信朋友圈未在截图内检测到点赞菜单入口候选', {
        author: candidate.author,
        screenshot: { width: screenshot.width, height: screenshot.height }
      })
      return null
    }
    const range = this.getMarketingMomentVerticalRange(candidate, screenshot)
    if (range) {
      const matched = menuCandidates
        .filter((item) => item.point.y >= range.y - MARKETING_ACTION_POINT_PADDING_PX &&
          item.point.y <= range.y + range.h + MARKETING_ACTION_POINT_PADDING_PX)
        .sort((a, b) => this.getMarketingMenuCandidatePriority(a) - this.getMarketingMenuCandidatePriority(b) ||
          Math.abs(a.point.y - (range.y + range.h / 2)) - Math.abs(b.point.y - (range.y + range.h / 2)) ||
          b.point.x - a.point.x)[0]
      if (matched) {
        console.info('个人微信朋友圈已按动态垂直范围匹配本地点赞菜单入口', {
          author: candidate.author,
          menuPoint: matched.point,
          range
        })
        return matched.point
      }
    }
    const normalizedIndex = typeof candidate.visualIndex === 'number' && candidate.visualIndex >= 0
      ? candidate.visualIndex
      : candidateIndex
    const boundedIndex = clampNumber(normalizedIndex, 0, Math.max(0, menuCandidates.length - 1))
    const matched = menuCandidates[boundedIndex]
    if (!matched) {
      return null
    }
    console.info('个人微信朋友圈已按视觉顺序匹配本地点赞菜单入口', {
      author: candidate.author,
      candidateIndex,
      visualIndex: candidate.visualIndex,
      totalMoments: candidates.length,
      totalMenuPoints: menuCandidates.length,
      menuPoint: matched.point
    })
    return matched.point
  }

  private getMarketingMomentVerticalRange(
    candidate: MarketingMomentCandidate,
    screenshot: WeChatScreenshot
  ): { y: number; h: number } | null {
    const raw = candidate.verticalRange || (candidate.postBounds ? { y: candidate.postBounds.y, h: candidate.postBounds.h } : null)
    if (!raw || !Number.isFinite(raw.y) || !Number.isFinite(raw.h) || raw.h <= 0) {
      return null
    }
    const top = clampNumber(Math.round(raw.y), 0, Math.max(0, screenshot.height - 1))
    const bottom = clampNumber(Math.round(raw.y + raw.h), top, screenshot.height)
    if (bottom - top <= 0) {
      return null
    }
    return { y: top, h: bottom - top }
  }

  private buildMarketingLocalVisualDigests(screenshot: WeChatScreenshot): MarketingLocalVisualDigest[] {
    const menuCandidates = this.findMarketingMenuPointCandidates(screenshot)
    if (menuCandidates.length === 0) {
      return []
    }
    try {
      const image = nativeImage.createFromBuffer(screenshot.png)
      if (!image || image.isEmpty()) {
        return []
      }
      const size = image.getSize()
      if (!size.width || !size.height || typeof image.toBitmap !== 'function') {
        return []
      }
      const bitmap = image.toBitmap()
      return menuCandidates
        .map((candidate) => ({
          point: candidate.point,
          digest: this.buildMarketingLocalVisualDigest(bitmap, size.width, size.height, candidate.point)
        }))
        .filter((item) => !!item.digest)
    } catch (error) {
      console.warn('个人微信朋友圈本地动态摘要生成失败，已跳过本地预拦截', error)
      return []
    }
  }

  private buildMarketingLocalVisualDigest(
    bitmap: Buffer,
    imageWidth: number,
    imageHeight: number,
    point: MarketingMomentPoint
  ): string {
    const left = clampNumber(Math.round(point.x - MARKETING_LOCAL_DIGEST_CROP_WIDTH_PX), 0, Math.max(0, imageWidth - 1))
    const top = clampNumber(Math.round(point.y - MARKETING_LOCAL_DIGEST_CROP_HEIGHT_PX / 2), 0, Math.max(0, imageHeight - 1))
    const right = clampNumber(Math.round(point.x + MARKETING_ACTION_POINT_PADDING_PX), left + 1, imageWidth)
    const bottom = clampNumber(Math.round(point.y + MARKETING_LOCAL_DIGEST_CROP_HEIGHT_PX / 2), top + 1, imageHeight)
    const cells: string[] = []
    for (let row = 0; row < MARKETING_LOCAL_DIGEST_GRID_SIZE; row += 1) {
      for (let col = 0; col < MARKETING_LOCAL_DIGEST_GRID_SIZE; col += 1) {
        const sampleLeft = Math.floor(left + ((right - left) * col) / MARKETING_LOCAL_DIGEST_GRID_SIZE)
        const sampleTop = Math.floor(top + ((bottom - top) * row) / MARKETING_LOCAL_DIGEST_GRID_SIZE)
        const sampleRight = Math.floor(left + ((right - left) * (col + 1)) / MARKETING_LOCAL_DIGEST_GRID_SIZE)
        const sampleBottom = Math.floor(top + ((bottom - top) * (row + 1)) / MARKETING_LOCAL_DIGEST_GRID_SIZE)
        cells.push(this.buildMarketingLocalVisualDigestCell(bitmap, imageWidth, sampleLeft, sampleTop, sampleRight, sampleBottom))
      }
    }
    return createHash('sha256')
      .update(`|${Math.round(point.x)}:${Math.round(point.y)}|${cells.join(',')}`)
      .digest('hex')
      .slice(0, 24)
  }

  private buildMarketingLocalVisualDigestCell(
    bitmap: Buffer,
    imageWidth: number,
    left: number,
    top: number,
    right: number,
    bottom: number
  ): string {
    let red = 0
    let green = 0
    let blue = 0
    let count = 0
    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) {
        const index = (y * imageWidth + x) * 4
        red += bitmap[index]
        green += bitmap[index + 1]
        blue += bitmap[index + 2]
        count += 1
      }
    }
    if (count <= 0) {
      return '0-0-0'
    }
    return [
      Math.floor((red / count) / MARKETING_LOCAL_DIGEST_COLOR_BUCKET_SIZE),
      Math.floor((green / count) / MARKETING_LOCAL_DIGEST_COLOR_BUCKET_SIZE),
      Math.floor((blue / count) / MARKETING_LOCAL_DIGEST_COLOR_BUCKET_SIZE)
    ].join('-')
  }

  private resolveMarketingLocalVisualDigest(
    digests: MarketingLocalVisualDigest[],
    menuPoint: MarketingMomentPoint
  ): string | null {
    const matched = digests
      .map((item) => ({
        item,
        distance: Math.abs(item.point.x - menuPoint.x) + Math.abs(item.point.y - menuPoint.y)
      }))
      .sort((a, b) => a.distance - b.distance)[0]
    return matched && matched.distance <= MARKETING_MENU_DOT_MERGE_X_PX + MARKETING_MENU_DOT_MERGE_Y_PX
      ? matched.item.digest
      : null
  }

  private getMarketingLocalVisualDigestDuplicateError(
    action: MarketingActionType,
    digests: MarketingLocalVisualDigest[]
  ): string {
    if (digests.length === 0) {
      return ''
    }
    const today = this.getMarketingDateKey()
    const handledDigests = new Set(this.marketingActionRecords
      .filter((record) => record.date === today && record.action === action && record.localVisualDigest)
      .map((record) => String(record.localVisualDigest)))
    if (handledDigests.size === 0) {
      return ''
    }
    const allVisibleHandled = digests.every((item) => handledDigests.has(item.digest))
    return allVisibleHandled ? 'duplicate_local_visual_digest' : ''
  }

  private findMarketingMenuPointCandidates(screenshot: WeChatScreenshot): MarketingMenuPointCandidate[] {
    try {
      const image = nativeImage.createFromBuffer(screenshot.png)
      if (!image || image.isEmpty()) {
        return []
      }
      const size = image.getSize()
      if (!size.width || !size.height || typeof image.toBitmap !== 'function') {
        return []
      }
      const bitmap = image.toBitmap()
      const blueButtonCandidates = this.findMarketingBlueActionButtonCandidates(bitmap, size.width, size.height)
      const rawCandidates: MarketingMenuPointCandidate[] = []
      const startX = Math.max(0, Math.floor(size.width * MARKETING_MENU_DOT_SCAN_START_RATIO))
      const endX = Math.max(startX, size.width - MARKETING_MENU_DOT_PAIR_SPACING_PX * 2 - MARKETING_MENU_DOT_RADIUS_PX)
      const startY = Math.min(size.height - 1, MARKETING_MENU_DOT_SCAN_TOP_PX)
      const endY = Math.max(startY, size.height - MARKETING_MENU_DOT_SCAN_BOTTOM_PADDING_PX)
      for (let y = startY; y <= endY; y += 1) {
        for (let x = startX; x <= endX; x += 1) {
          const first = this.countDarkPixelsAround(bitmap, size.width, size.height, x, y, MARKETING_MENU_DOT_RADIUS_PX)
          const second = this.countDarkPixelsAround(bitmap, size.width, size.height, x + MARKETING_MENU_DOT_PAIR_SPACING_PX, y, MARKETING_MENU_DOT_RADIUS_PX)
          if (first < MARKETING_MENU_DOT_MIN_PIXELS || second < MARKETING_MENU_DOT_MIN_PIXELS) {
            continue
          }
          const third = this.countDarkPixelsAround(bitmap, size.width, size.height, x + MARKETING_MENU_DOT_PAIR_SPACING_PX * 2, y, MARKETING_MENU_DOT_RADIUS_PX)
          const hasThirdDot = third >= MARKETING_MENU_DOT_MIN_PIXELS
          rawCandidates.push({
            point: {
              x: x + (hasThirdDot ? MARKETING_MENU_DOT_PAIR_SPACING_PX : Math.round(MARKETING_MENU_DOT_PAIR_SPACING_PX / 2)),
              y
            },
            score: first + second + (hasThirdDot ? third : 0),
            source: hasThirdDot ? 'dark_three_dot' : 'dark_two_dot'
          })
        }
      }
      const merged: MarketingMenuPointCandidate[] = []
      for (const candidate of rawCandidates.sort((a, b) => b.score - a.score)) {
        const nearExisting = merged.some((item) =>
          Math.abs(item.point.x - candidate.point.x) <= MARKETING_MENU_DOT_MERGE_X_PX &&
          Math.abs(item.point.y - candidate.point.y) <= MARKETING_MENU_DOT_MERGE_Y_PX)
        if (!nearExisting) {
          merged.push(candidate)
        }
      }
      return [...blueButtonCandidates, ...merged].sort((a, b) =>
        this.getMarketingMenuCandidatePriority(a) - this.getMarketingMenuCandidatePriority(b) ||
        a.point.y - b.point.y ||
        b.point.x - a.point.x)
    } catch (error) {
      console.warn('个人微信朋友圈点赞菜单入口本地识别失败', error)
      return []
    }
  }

  private getMarketingMenuCandidatePriority(candidate: MarketingMenuPointCandidate): number {
    if (candidate.source === 'blue_action_button') {
      return 0
    }
    if (candidate.source === 'dark_two_dot') {
      return 1
    }
    return 2
  }

  private findMarketingBlueActionButtonCandidates(
    bitmap: Buffer,
    width: number,
    height: number
  ): MarketingMenuPointCandidate[] {
    const startX = Math.max(0, Math.floor(width * MARKETING_BLUE_MENU_SCAN_START_RATIO))
    const startY = Math.min(height - 1, MARKETING_MENU_DOT_SCAN_TOP_PX)
    const endY = Math.max(startY, height - MARKETING_MENU_DOT_SCAN_BOTTOM_PADDING_PX)
    const visited = new Uint8Array(width * height)
    const candidates: MarketingMenuPointCandidate[] = []
    for (let y = startY; y <= endY; y += 1) {
      for (let x = startX; x < width; x += 1) {
        const index = y * width + x
        if (visited[index] || !this.isMarketingBlueMenuPixel(bitmap, index)) {
          continue
        }
        const component = this.collectMarketingBlueComponent(bitmap, visited, width, height, x, y, startX, startY, endY)
        const componentWidth = component.maxX - component.minX + 1
        const componentHeight = component.maxY - component.minY + 1
        if (component.count < MARKETING_BLUE_MENU_COMPONENT_MIN_PIXELS ||
          componentWidth < MARKETING_BLUE_MENU_COMPONENT_MIN_WIDTH_PX ||
          componentHeight < MARKETING_BLUE_MENU_COMPONENT_MIN_HEIGHT_PX ||
          componentWidth > MARKETING_BLUE_MENU_COMPONENT_MAX_WIDTH_PX ||
          componentHeight > MARKETING_BLUE_MENU_COMPONENT_MAX_HEIGHT_PX) {
          continue
        }
        candidates.push({
          point: {
            x: Math.round((component.minX + component.maxX) / 2),
            y: Math.round((component.minY + component.maxY) / 2)
          },
          score: component.count,
          source: 'blue_action_button'
        })
      }
    }
    return [
      ...candidates,
      ...this.findMarketingBlueDotCandidates(bitmap, width, height, startX, startY, endY)
    ].sort((a, b) => a.point.y - b.point.y || b.score - a.score)
  }

  private findMarketingBlueDotCandidates(
    bitmap: Buffer,
    width: number,
    height: number,
    startX: number,
    startY: number,
    endY: number
  ): MarketingMenuPointCandidate[] {
    const candidates: MarketingMenuPointCandidate[] = []
    const endX = Math.max(startX, width - MARKETING_MENU_DOT_PAIR_SPACING_PX * 2 - MARKETING_MENU_DOT_RADIUS_PX)
    for (let y = startY; y <= endY; y += 1) {
      for (let x = startX; x <= endX; x += 1) {
        const first = this.countBluePixelsAround(bitmap, width, height, x, y, MARKETING_MENU_DOT_RADIUS_PX)
        const second = this.countBluePixelsAround(bitmap, width, height, x + MARKETING_MENU_DOT_PAIR_SPACING_PX, y, MARKETING_MENU_DOT_RADIUS_PX)
        const third = this.countBluePixelsAround(bitmap, width, height, x + MARKETING_MENU_DOT_PAIR_SPACING_PX * 2, y, MARKETING_MENU_DOT_RADIUS_PX)
        if (first < MARKETING_BLUE_MENU_DOT_MIN_PIXELS ||
          second < MARKETING_BLUE_MENU_DOT_MIN_PIXELS) {
          continue
        }
        const hasThirdDot = third >= MARKETING_BLUE_MENU_DOT_MIN_PIXELS
        candidates.push({
          point: {
            x: x + (hasThirdDot ? MARKETING_MENU_DOT_PAIR_SPACING_PX : Math.round(MARKETING_MENU_DOT_PAIR_SPACING_PX / 2)),
            y
          },
          score: first + second + (hasThirdDot ? third : 0),
          source: 'blue_action_button'
        })
      }
    }
    const merged: MarketingMenuPointCandidate[] = []
    for (const candidate of candidates.sort((a, b) => b.score - a.score)) {
      const nearExisting = merged.some((item) =>
        Math.abs(item.point.x - candidate.point.x) <= MARKETING_MENU_DOT_MERGE_X_PX &&
        Math.abs(item.point.y - candidate.point.y) <= MARKETING_MENU_DOT_MERGE_Y_PX)
      if (!nearExisting) {
        merged.push(candidate)
      }
    }
    return merged
  }

  private collectMarketingBlueComponent(
    bitmap: Buffer,
    visited: Uint8Array,
    width: number,
    height: number,
    startX: number,
    startY: number,
    minScanX: number,
    minScanY: number,
    maxScanY: number
  ): { count: number; minX: number; minY: number; maxX: number; maxY: number } {
    const queue: Array<{ x: number; y: number }> = [{ x: startX, y: startY }]
    let count = 0
    let minX = startX
    let minY = startY
    let maxX = startX
    let maxY = startY
    visited[startY * width + startX] = 1
    for (let offset = 0; offset < queue.length; offset += 1) {
      const current = queue[offset]
      count += 1
      minX = Math.min(minX, current.x)
      minY = Math.min(minY, current.y)
      maxX = Math.max(maxX, current.x)
      maxY = Math.max(maxY, current.y)
      const neighbours = [
        { x: current.x + 1, y: current.y },
        { x: current.x - 1, y: current.y },
        { x: current.x, y: current.y + 1 },
        { x: current.x, y: current.y - 1 }
      ]
      for (const next of neighbours) {
        if (next.x < minScanX || next.x >= width || next.y < minScanY || next.y > maxScanY) {
          continue
        }
        const nextIndex = next.y * width + next.x
        if (visited[nextIndex] || !this.isMarketingBlueMenuPixel(bitmap, nextIndex)) {
          continue
        }
        visited[nextIndex] = 1
        queue.push(next)
      }
    }
    return { count, minX, minY, maxX, maxY }
  }

  private isMarketingBlueMenuPixel(bitmap: Buffer, pixelIndex: number): boolean {
    const offset = pixelIndex * 4
    const first = bitmap[offset]
    const green = bitmap[offset + 1]
    const third = bitmap[offset + 2]
    const alpha = bitmap[offset + 3]
    if (alpha <= 160 || green < 90) {
      return false
    }
    const rgbLooksBlue = third >= 145 && third - first >= 8 && third >= green - 12
    const bgrLooksBlue = first >= 145 && first - third >= 8 && first >= green - 12
    return rgbLooksBlue || bgrLooksBlue
  }

  private countBluePixelsAround(
    bitmap: Buffer,
    width: number,
    height: number,
    centerX: number,
    centerY: number,
    radius: number
  ): number {
    let count = 0
    const left = clampNumber(centerX - radius, 0, width - 1)
    const right = clampNumber(centerX + radius, left, width - 1)
    const top = clampNumber(centerY - radius, 0, height - 1)
    const bottom = clampNumber(centerY + radius, top, height - 1)
    for (let y = top; y <= bottom; y += 1) {
      for (let x = left; x <= right; x += 1) {
        if (this.isMarketingBlueDotPixel(bitmap, y * width + x)) {
          count += 1
        }
      }
    }
    return count
  }

  private isMarketingBlueDotPixel(bitmap: Buffer, pixelIndex: number): boolean {
    const offset = pixelIndex * 4
    const first = bitmap[offset]
    const green = bitmap[offset + 1]
    const third = bitmap[offset + 2]
    const alpha = bitmap[offset + 3]
    if (alpha <= 160) {
      return false
    }
    const rgbBlueSaturation = third - Math.max(first, green)
    const bgrBlueSaturation = first - Math.max(third, green)
    return (third >= 110 && rgbBlueSaturation >= 35) ||
      (first >= 110 && bgrBlueSaturation >= 35)
  }

  private countDarkPixelsAround(
    bitmap: Buffer,
    width: number,
    height: number,
    centerX: number,
    centerY: number,
    radius: number
  ): number {
    let count = 0
    const left = clampNumber(centerX - radius, 0, width - 1)
    const right = clampNumber(centerX + radius, left, width - 1)
    const top = clampNumber(centerY - radius, 0, height - 1)
    const bottom = clampNumber(centerY + radius, top, height - 1)
    for (let y = top; y <= bottom; y += 1) {
      for (let x = left; x <= right; x += 1) {
        const offset = (y * width + x) * 4
        const red = bitmap[offset]
        const green = bitmap[offset + 1]
        const blue = bitmap[offset + 2]
        const alpha = bitmap[offset + 3]
        if (alpha > 160 && red < 120 && green < 120 && blue < 120) {
          count += 1
        }
      }
    }
    return count
  }

  private async clickMarketingLikeThroughMenu(
    window: WindowBounds,
    candidate: MarketingMomentCandidate,
    menuPoint: MarketingMomentPoint
  ): Promise<MarketingLikeClickResult> {
    await focusWindow(window.hwnd)
    const menuClicked = await clickMarketingPoint(window, menuPoint)
    if (!menuClicked) {
      return { ok: false, error: 'click_failed', menuPoint }
    }
    await wait(280 + Math.floor(Math.random() * 220))
    const menuScreenshot = await captureWeChatWindow(window)
    const confirmPoint = this.findMarketingLikeConfirmPoint(menuScreenshot, menuPoint)
    if (!confirmPoint) {
      console.warn('个人微信朋友圈点赞菜单未通过本地确认，已跳过点赞', {
        author: candidate.author,
        menuPoint
      })
      return { ok: false, error: 'like_menu_not_confirmed', menuPoint }
    }
    const menuAction = this.detectOpenedMarketingLikeMenuAction(menuScreenshot, confirmPoint)
    if (menuAction !== 'like') {
      console.warn('个人微信朋友圈点赞菜单动作不是明确的赞，已跳过避免取消点赞', {
        author: candidate.author,
        menuAction,
        menuPoint,
        confirmPoint
      })
      return {
        ok: false,
        error: menuAction === 'unlike' ? 'like_menu_is_unlike' : 'like_menu_action_unconfirmed',
        menuPoint,
        confirmPoint
      }
    }
    const confirmed = await clickMarketingPoint(window, confirmPoint)
    if (!confirmed) {
      return { ok: false, error: 'like_confirm_click_failed', menuPoint, confirmPoint }
    }
    return { ok: true, menuPoint, confirmPoint }
  }

  private async clickMarketingCommentThroughMenu(
    window: WindowBounds,
    candidate: MarketingMomentCandidate,
    menuPoint: MarketingMomentPoint
  ): Promise<MarketingLikeClickResult> {
    await focusWindow(window.hwnd)
    const menuClicked = await clickMarketingPoint(window, menuPoint)
    if (!menuClicked) {
      return { ok: false, error: 'click_failed', menuPoint }
    }
    await wait(280 + Math.floor(Math.random() * 220))
    const menuScreenshot = await captureWeChatWindow(window)
    const commentPoint = this.findMarketingCommentConfirmPoint(menuScreenshot, menuPoint)
    if (!commentPoint) {
      console.warn('个人微信朋友圈评论菜单未通过本地确认，已跳过评论', {
        author: candidate.author,
        menuPoint
      })
      return { ok: false, error: 'comment_menu_action_unconfirmed', menuPoint }
    }
    const confirmed = await clickMarketingPoint(window, commentPoint)
    if (!confirmed) {
      return { ok: false, error: 'comment_confirm_click_failed', menuPoint, confirmPoint: commentPoint }
    }
    return { ok: true, menuPoint, confirmPoint: commentPoint }
  }

  private detectOpenedMarketingLikeMenuAction(
    screenshot: WeChatScreenshot,
    confirmPoint: MarketingMomentPoint
  ): MarketingLikeMenuAction {
    try {
      const image = nativeImage.createFromBuffer(screenshot.png)
      if (!image || image.isEmpty()) {
        return 'unknown'
      }
      const size = image.getSize()
      if (!size.width || !size.height || typeof image.toBitmap !== 'function') {
        return 'unknown'
      }
      const bitmap = image.toBitmap()
      const left = clampNumber(Math.round(confirmPoint.x - MARKETING_LIKE_STATUS_SCAN_LEFT_PX), 0, size.width - 1)
      const right = clampNumber(Math.round(confirmPoint.x + MARKETING_LIKE_STATUS_SCAN_RIGHT_PX), left, size.width - 1)
      const top = clampNumber(Math.round(confirmPoint.y - MARKETING_LIKE_STATUS_SCAN_VERTICAL_PX), 0, size.height - 1)
      const bottom = clampNumber(Math.round(confirmPoint.y + MARKETING_LIKE_STATUS_SCAN_VERTICAL_PX), top, size.height - 1)
      let redPixels = 0
      let lightPixels = 0
      for (let y = top; y <= bottom; y += 1) {
        for (let x = left; x <= right; x += 1) {
          const offset = (y * size.width + x) * 4
          const red = bitmap[offset]
          const green = bitmap[offset + 1]
          const blue = bitmap[offset + 2]
          const alpha = bitmap[offset + 3]
          if (alpha <= 180) {
            continue
          }
          if (red >= 180 && green <= 120 && blue <= 120 && red - Math.max(green, blue) >= 60) {
            redPixels += 1
            continue
          }
          if (red >= 185 && green >= 185 && blue >= 185) {
            lightPixels += 1
          }
        }
      }
      if (redPixels >= MARKETING_LIKE_STATUS_MIN_RED_PIXELS) {
        console.info('个人微信朋友圈点赞菜单本地识别为取消，已跳过避免误触', { confirmPoint, redPixels, lightPixels })
        return 'unlike'
      }
      if (lightPixels >= MARKETING_LIKE_STATUS_MIN_LIGHT_PIXELS) {
        console.info('个人微信朋友圈点赞菜单本地识别为赞', { confirmPoint, redPixels, lightPixels })
        return 'like'
      }
      console.warn('个人微信朋友圈点赞菜单本地动作识别不明确，已按不安全处理', { confirmPoint, redPixels, lightPixels })
      return 'unknown'
    } catch (error) {
      console.warn('个人微信朋友圈点赞菜单本地动作识别异常，已按不安全处理', error)
      return 'unknown'
    }
  }

  private findMarketingCommentConfirmPoint(screenshot: WeChatScreenshot, menuPoint: MarketingMomentPoint): MarketingMomentPoint | null {
    const likePoint = this.findMarketingLikeConfirmPoint(screenshot, menuPoint)
    if (!likePoint) {
      return null
    }
    const commentPoint = {
      x: clampNumber(Math.round(likePoint.x + MARKETING_COMMENT_CONFIRM_OFFSET_X_PX), 0, screenshot.width),
      y: likePoint.y
    }
    return this.detectOpenedMarketingCommentMenuAction(screenshot, commentPoint) === 'comment'
      ? commentPoint
      : null
  }

  private detectOpenedMarketingCommentMenuAction(
    screenshot: WeChatScreenshot,
    commentPoint: MarketingMomentPoint
  ): 'comment' | 'unknown' {
    try {
      const image = nativeImage.createFromBuffer(screenshot.png)
      if (!image || image.isEmpty()) {
        return 'unknown'
      }
      const size = image.getSize()
      if (!size.width || !size.height || typeof image.toBitmap !== 'function') {
        return 'unknown'
      }
      const bitmap = image.toBitmap()
      const left = clampNumber(Math.round(commentPoint.x - MARKETING_COMMENT_STATUS_SCAN_LEFT_PX), 0, size.width - 1)
      const right = clampNumber(Math.round(commentPoint.x + MARKETING_COMMENT_STATUS_SCAN_RIGHT_PX), left, size.width - 1)
      const top = clampNumber(Math.round(commentPoint.y - MARKETING_COMMENT_STATUS_SCAN_VERTICAL_PX), 0, size.height - 1)
      const bottom = clampNumber(Math.round(commentPoint.y + MARKETING_COMMENT_STATUS_SCAN_VERTICAL_PX), top, size.height - 1)
      let lightPixels = 0
      let darkPixels = 0
      for (let y = top; y <= bottom; y += 1) {
        for (let x = left; x <= right; x += 1) {
          const offset = (y * size.width + x) * 4
          const red = bitmap[offset]
          const green = bitmap[offset + 1]
          const blue = bitmap[offset + 2]
          const alpha = bitmap[offset + 3]
          if (alpha > 180 && red >= 185 && green >= 185 && blue >= 185) {
            lightPixels += 1
            continue
          }
          if (alpha > 180 && red <= 90 && green <= 90 && blue <= 90) {
            darkPixels += 1
          }
        }
      }
      const hasStandardCommentSignal = lightPixels >= MARKETING_COMMENT_STATUS_MIN_LIGHT_PIXELS &&
        darkPixels >= MARKETING_COMMENT_STATUS_MIN_DARK_PIXELS
      const hasMixedNarrowWindowCommentSignal = lightPixels >= MARKETING_COMMENT_STATUS_MIXED_MIN_LIGHT_PIXELS &&
        darkPixels >= MARKETING_COMMENT_STATUS_MIXED_MIN_DARK_PIXELS
      if (hasStandardCommentSignal || hasMixedNarrowWindowCommentSignal) {
        console.info('个人微信朋友圈评论菜单本地识别为评论', { commentPoint, lightPixels, darkPixels })
        return 'comment'
      }
      console.warn('个人微信朋友圈评论菜单本地动作识别不明确，已按不安全处理', { commentPoint, lightPixels, darkPixels })
      return 'unknown'
    } catch (error) {
      console.warn('个人微信朋友圈评论菜单本地动作识别异常，已按不安全处理', error)
      return 'unknown'
    }
  }

  private findMarketingLikeConfirmPoint(screenshot: WeChatScreenshot, menuPoint: MarketingMomentPoint): MarketingMomentPoint | null {
    try {
      const image = nativeImage.createFromBuffer(screenshot.png)
      if (!image || image.isEmpty()) {
        return null
      }
      const size = image.getSize()
      if (!size.width || !size.height || typeof image.toBitmap !== 'function') {
        return null
      }
      const bitmap = image.toBitmap()
      const left = clampNumber(Math.round(menuPoint.x - MARKETING_LIKE_MENU_SCAN_LEFT_PX), 0, size.width - 1)
      const right = clampNumber(Math.round(menuPoint.x + MARKETING_LIKE_MENU_SCAN_RIGHT_PX), left, size.width - 1)
      const top = clampNumber(Math.round(menuPoint.y - MARKETING_LIKE_MENU_SCAN_VERTICAL_PX), 0, size.height - 1)
      const bottom = clampNumber(Math.round(menuPoint.y + MARKETING_LIKE_MENU_SCAN_VERTICAL_PX), top, size.height - 1)
      let minX = Number.POSITIVE_INFINITY
      let minY = Number.POSITIVE_INFINITY
      let maxX = 0
      let maxY = 0
      let darkPixels = 0
      let scannedPixels = 0
      for (let y = top; y <= bottom; y += 1) {
        for (let x = left; x <= right; x += 1) {
          scannedPixels += 1
          const offset = (y * size.width + x) * 4
          const first = bitmap[offset]
          const second = bitmap[offset + 1]
          const third = bitmap[offset + 2]
          const alpha = bitmap[offset + 3]
          if (alpha > 180 && first < 90 && second < 90 && third < 90) {
            darkPixels += 1
            minX = Math.min(minX, x)
            minY = Math.min(minY, y)
            maxX = Math.max(maxX, x)
            maxY = Math.max(maxY, y)
          }
        }
      }
      const menuWidth = maxX - minX
      const menuHeight = maxY - minY
      const darkRatio = scannedPixels > 0 ? darkPixels / scannedPixels : 0
      if (darkPixels < MARKETING_LIKE_MENU_MIN_DARK_PIXELS ||
        menuWidth < MARKETING_LIKE_MENU_MIN_WIDTH_PX ||
        menuHeight < MARKETING_LIKE_MENU_MIN_HEIGHT_PX ||
        darkRatio < MARKETING_LIKE_MENU_MIN_DARK_RATIO ||
        maxX < menuPoint.x - MARKETING_LIKE_MENU_RIGHT_EDGE_TOLERANCE_PX) {
        return null
      }
      return {
        x: clampNumber(Math.round(minX + menuWidth * 0.28), 0, screenshot.width),
        y: clampNumber(Math.round(minY + menuHeight * 0.5), 0, screenshot.height)
      }
    } catch (error) {
      console.warn('个人微信朋友圈点赞菜单本地识别失败', error)
      return null
    }
  }

  private selectMarketingCandidate(
    action: MarketingActionType,
    candidates: MarketingMomentCandidate[],
    screenshot: WeChatScreenshot,
    rawConfig: Record<string, any>
  ): { candidate: MarketingMomentCandidate | null; candidateIndex: number; error: string } {
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return { candidate: null, candidateIndex: -1, error: 'no_candidate' }
    }
    let firstError = ''
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index]
      const error = this.getMarketingCandidateError(action, candidate, screenshot, rawConfig)
      if (!error) {
        return { candidate, candidateIndex: index, error: '' }
      }
      this.logRejectedMarketingCandidate(action, candidate, screenshot, error)
      firstError = firstError || error
    }
    return { candidate: null, candidateIndex: -1, error: firstError || 'no_candidate' }
  }

  private getMarketingCandidateError(
    action: MarketingActionType,
    candidate: MarketingMomentCandidate,
    screenshot: WeChatScreenshot,
    rawConfig: Record<string, any>
  ): string {
    const confidence = typeof candidate.confidence === 'number' ? candidate.confidence : 0
    if (confidence < MARKETING_MIN_CONFIDENCE) {
      return 'vision_low_confidence'
    }
    if (action === 'like') {
      if (candidate.suitableForLike === false) {
        return 'like_not_suitable'
      }
      if (this.hasMarketingKeywordHit(rawConfig?.keywordFilter, candidate)) {
        return 'keyword_filtered'
      }
      return ''
    }
    if (candidate.suitableForComment !== true) {
      return 'comment_not_suitable'
    }
    if (this.hasMarketingKeywordHit(rawConfig?.keywordFilter, candidate)) {
      return 'keyword_filtered'
    }
    return ''
  }

  private isPointInsideScreenshot(point: MarketingMomentPoint, screenshot: WeChatScreenshot): boolean {
    return point.x >= 0 && point.y >= 0 && point.x <= screenshot.width && point.y <= screenshot.height
  }

  private isMarketingActionPointInsideCandidate(
    action: MarketingActionType,
    point: MarketingMomentPoint,
    bounds: WeChatMessageBounds
  ): boolean {
    if (action !== 'like') {
      return this.isPointInsideBounds(point, bounds)
    }
    // 朋友圈点赞入口是动态右侧的“..”菜单，可能在正文区域右侧；先放宽菜单候选区，最终仍要截图确认点赞菜单。
    return point.x >= bounds.x - MARKETING_ACTION_POINT_PADDING_PX &&
      point.y >= bounds.y - MARKETING_ACTION_POINT_PADDING_PX &&
      point.x <= bounds.x + bounds.w + MARKETING_LIKE_POINT_RIGHT_EXTENSION_PX &&
      point.y <= bounds.y + bounds.h + MARKETING_ACTION_POINT_PADDING_PX
  }

  private isPointInsideBounds(point: MarketingMomentPoint, bounds: WeChatMessageBounds): boolean {
    const padding = MARKETING_ACTION_POINT_PADDING_PX
    return point.x >= bounds.x - padding &&
      point.y >= bounds.y - padding &&
      point.x <= bounds.x + bounds.w + padding &&
      point.y <= bounds.y + bounds.h + padding
  }

  private logRejectedMarketingCandidate(
    action: MarketingActionType,
    candidate: MarketingMomentCandidate,
    screenshot: WeChatScreenshot,
    error: string
  ): void {
    console.info('个人微信朋友圈候选动态被本地安全规则跳过', {
      action,
      error,
      author: candidate.author,
      confidence: candidate.confidence,
      alreadyLiked: candidate.alreadyLiked,
      postBounds: candidate.postBounds,
      likePoint: candidate.likePoint,
      commentPoint: candidate.commentPoint,
      screenshot: { width: screenshot.width, height: screenshot.height }
    })
  }

  private hasMarketingKeywordHit(keywordFilter: unknown, candidate: MarketingMomentCandidate): boolean {
    if (!Array.isArray(keywordFilter)) {
      return false
    }
    const sourceText = `${candidate.author}\n${candidate.content}`.toLowerCase()
    return keywordFilter
      .map((item) => String(item || '').trim().toLowerCase())
      .filter(Boolean)
      .some((keyword) => sourceText.includes(keyword))
  }

  private getMarketingLimitError(
    action: MarketingActionType,
    rawConfig: Record<string, any>,
    author: string,
    postFingerprint: string,
    localVisualDigest?: string | null,
    legacyPostFingerprint?: string
  ): string {
    const today = this.getMarketingDateKey()
    const todayRecords = this.marketingActionRecords.filter((record) => record.date === today && record.action === action)
    if (todayRecords.some((record) => record.postFingerprint === postFingerprint ||
      (!!legacyPostFingerprint && record.postFingerprint === legacyPostFingerprint))) {
      return 'duplicate_post'
    }
    if (localVisualDigest &&
      todayRecords.some((record) => record.localVisualDigest === localVisualDigest)) {
      return 'duplicate_local_visual_digest'
    }
    const totalLimit = this.readMarketingTotalLimit(action, rawConfig)
    if (totalLimit > 0 && todayRecords.length >= totalLimit) {
      return 'daily_total_limit'
    }
    const friendLimit = this.readMarketingFriendLimit(action, rawConfig)
    const normalizedAuthor = String(author || '').trim()
    const friendCount = todayRecords.filter((record) => record.author === normalizedAuthor).length
    if (friendLimit > 0 && friendCount >= friendLimit) {
      return 'daily_friend_limit'
    }
    return ''
  }

  private readMarketingTotalLimit(action: MarketingActionType, rawConfig: Record<string, any>): number {
    const key = action === 'like' ? 'maxDailyTotalLikes' : 'maxDailyTotalComments'
    return Math.max(1, Number(rawConfig?.[key] ?? 1) || 1)
  }

  private readMarketingFriendLimit(action: MarketingActionType, rawConfig: Record<string, any>): number {
    const key = action === 'like' ? 'maxDailyLikesPerFriend' : 'maxDailyCommentsPerFriend'
    return Math.max(1, Number(rawConfig?.[key] ?? 1) || 1)
  }

  private async generateMarketingComment(
    candidate: MarketingMomentCandidate,
    rawConfig: Record<string, any>
  ): Promise<MarketingCommentGenerationResult> {
    const backendUrl = String(rawConfig?.backendUrl || this.runtimeConfig.backendBaseUrl || '').replace(/\/api\/?$/, '').replace(/\/$/, '')
    const token = String(rawConfig?.token || this.runtimeConfig.token || '').trim()
    const tenantId = String(rawConfig?.tenantId || this.runtimeConfig.tenantId || '1').trim() || '1'
    if (!backendUrl || !token || typeof fetch !== 'function') {
      console.warn('个人微信朋友圈评论生成缺少后端配置，已跳过本轮评论', {
        author: candidate.author,
        hasBackendUrl: !!backendUrl,
        hasToken: !!token,
        hasFetch: typeof fetch === 'function'
      })
      return {
        content: '',
        error: 'comment_generation_backend_missing',
        message: '评论生成后端配置缺失，已跳过本轮朋友圈评论'
      }
    }
    try {
      const response = await fetch(`${backendUrl}/api/user/marketing/comment/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Tenant-Id': tenantId
        },
        body: JSON.stringify({
          postContent: candidate.content,
          userNickname: candidate.author,
          timeText: candidate.timeText || ''
        })
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload || payload.code !== 0) {
        console.warn('个人微信朋友圈评论生成接口返回失败，已跳过本轮评论', {
          author: candidate.author,
          status: response.status,
          code: payload?.code,
          message: payload?.msg || payload?.message
        })
        return {
          content: '',
          error: 'comment_generation_api_failed',
          message: '评论生成接口返回失败，已跳过本轮朋友圈评论'
        }
      }
      const content = this.normalizeGeneratedMarketingComment(candidate, payload.data)
      if (!content) {
        console.warn('个人微信朋友圈评论生成内容未通过安全过滤，已跳过本轮评论', {
          author: candidate.author
        })
        return {
          content: '',
          error: 'comment_generation_content_unsafe',
          message: '评论内容未通过安全过滤，已跳过本轮朋友圈评论'
        }
      }
      return { content }
    } catch (error) {
      console.warn('个人微信朋友圈评论生成失败，已跳过本轮评论', { author: candidate.author, error })
      return {
        content: '',
        error: 'comment_generation_request_failed',
        message: '评论生成请求异常，已跳过本轮朋友圈评论'
      }
    }
  }

  private normalizeGeneratedMarketingComment(candidate: MarketingMomentCandidate, rawContent: unknown): string {
    const content = String(rawContent || '')
      .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    const charLength = Array.from(content).length
    if (!content || charLength > MAX_MARKETING_COMMENT_LENGTH) {
      return ''
    }
    // 朋友圈评论只能发送自然短句，任何联系方式、格式化输出或营销导向内容都按不安全处理。
    const lowerContent = content.toLowerCase()
    if (/https?:\/\//i.test(content) || /www\./i.test(content) || /@\S+/.test(content)) {
      return ''
    }
    if (/1[3-9]\d{9}/.test(content)) {
      return ''
    }
    if (/(?:微信|薇信|v信|wx|wechat)[:：\s-]*[a-z0-9_-]{3,}/i.test(content)) {
      return ''
    }
    if (/^[{\[]/.test(content) || content.includes('```') || /^[-*#/>\s]/.test(content)) {
      return ''
    }
    if (/(加我|联系|私信|购买|下单|优惠|代理|返利|扫码|进群)/.test(content)) {
      return ''
    }
    const normalizedContent = lowerContent.replace(/\s+/g, '')
    const normalizedPostContent = String(candidate.content || '').toLowerCase().replace(/\s+/g, '')
    if (charLength >= 10 && normalizedPostContent.includes(normalizedContent)) {
      return ''
    }
    return content
  }

  private async loadMarketingActionRecords(): Promise<void> {
    if (this.marketingActionStoreLoaded) {
      return
    }
    try {
      const raw = await readFile(this.getMarketingStorePath(), 'utf-8')
      const parsed = JSON.parse(raw) as MarketingActionStore
      this.marketingActionRecords = Array.isArray(parsed.records) ? parsed.records : []
    } catch (error: any) {
      if (error?.code !== 'ENOENT') {
        console.warn('个人微信朋友圈互动记录加载失败，将从空记录继续', error)
      }
      this.marketingActionRecords = []
    }
    this.marketingActionStoreLoaded = true
    this.cleanupMarketingActionRecords()
  }

  private async recordMarketingAction(
    action: MarketingActionType,
    candidate: MarketingMomentCandidate,
    postFingerprint: string
  ): Promise<void> {
    this.marketingActionRecords.push({
      date: this.getMarketingDateKey(),
      action,
      author: String(candidate.author || '').trim(),
      postFingerprint,
      timeText: String(candidate.timeText || '').trim(),
      localVisualDigest: String(candidate.localVisualDigest || '').trim(),
      outcome: action === 'like' ? 'liked' : 'commented',
      createdAt: Date.now()
    })
    this.cleanupMarketingActionRecords()
    const store: MarketingActionStore = {
      version: 2,
      records: this.marketingActionRecords.slice(-MAX_MARKETING_RECORDS)
    }
    try {
      await mkdir(dirname(this.getMarketingStorePath()), { recursive: true })
      await writeFile(this.getMarketingStorePath(), `${JSON.stringify(store, null, 2)}\n`, 'utf-8')
    } catch (error) {
      console.warn('个人微信朋友圈互动记录保存失败', error)
    }
  }

  private cleanupMarketingActionRecords(): void {
    const today = this.getMarketingDateKey()
    this.marketingActionRecords = this.marketingActionRecords
      .filter((record) => record && record.date === today && record.action && record.postFingerprint)
      .slice(-MAX_MARKETING_RECORDS)
  }

  private getMarketingStorePath(): string {
    return join(app.getPath('userData'), 'wechat-native-marketing-actions.json')
  }

  private getMarketingDateKey(): string {
    const now = new Date()
    const month = `${now.getMonth() + 1}`.padStart(2, '0')
    const day = `${now.getDate()}`.padStart(2, '0')
    return `${now.getFullYear()}-${month}-${day}`
  }

  private buildMarketingPostFingerprint(candidate: MarketingMomentCandidate): string {
    const timeText = String(candidate.timeText || '').trim()
    const localVisualDigest = String(candidate.localVisualDigest || '').trim()
    const source = [
      String(candidate.author || '').trim(),
      this.normalizeFingerprintContent(candidate.content || ''),
      timeText || localVisualDigest ||
        (candidate.postBounds ? `${Math.round(candidate.postBounds.x)}:${Math.round(candidate.postBounds.y)}:${Math.round(candidate.postBounds.w)}:${Math.round(candidate.postBounds.h)}` : '')
    ].join('|')
    return createHash('sha256').update(source).digest('hex').slice(0, 24)
  }

  private buildMarketingLegacyPostBoundsFingerprint(candidate: MarketingMomentCandidate): string {
    if (!candidate.postBounds) {
      return ''
    }
    const source = [
      String(candidate.author || '').trim(),
      this.normalizeFingerprintContent(candidate.content || ''),
      `${Math.round(candidate.postBounds.x)}:${Math.round(candidate.postBounds.y)}:${Math.round(candidate.postBounds.w)}:${Math.round(candidate.postBounds.h)}`
    ].join('|')
    return createHash('sha256').update(source).digest('hex').slice(0, 24)
  }

  private async refreshBaseline(window: WindowBounds): Promise<void> {
    try {
      const snapshot = await this.readSnapshot(window)
      this.markSnapshotAsBaseline(snapshot)
      console.info('新方式已建立当前会话消息基线', { count: snapshot.messages.length })
    } catch (error) {
      console.warn('新方式建立消息基线失败，后续轮询会继续尝试', error)
    }
  }

  private markSnapshotAsBaseline(snapshot: ParsedWeChatSnapshot): void {
    for (const message of snapshot.messages) {
      this.seenMessageFingerprints.add(this.buildFingerprint(snapshot.contact, message.content, message.isSelf, message.uiId))
      this.markRecentMessageContentFingerprint(this.buildParsedMessageContentFingerprint(snapshot.contact, message))
    }
  }

  private async readSnapshotIfChanged(window: WindowBounds): Promise<ParsedWeChatSnapshot | null> {
    let screenshot = await captureWeChatWindow(window)
    let diff = comparePngSnapshots(this.lastScreenshotPng, screenshot.png)
    this.lastScreenshotPng = screenshot.png
    this.latestSnapshotFromUnreadSwitch = false
    const shouldRetryFailedVision = this.consecutiveVisionFailures > 0
    const shouldParseMinorCurrentChatChange = !diff.changed &&
      !shouldRetryFailedVision &&
      diff.changedRatio >= MIN_CURRENT_CHAT_MESSAGE_CHANGE_RATIO
    let switchedUnreadConversation = false
    if (shouldParseMinorCurrentChatChange) {
      console.info('新方式检测到当前聊天轻微变化，按短消息气泡处理并请求视觉解析', {
        digest: diff.digest,
        changedRatio: diff.changedRatio
      })
    }
    if (!diff.changed && !shouldParseMinorCurrentChatChange && !shouldRetryFailedVision) {
      const unreadCandidates = findUnreadConversationCandidates(screenshot, window, this.channel)
      const candidate = unreadCandidates.find((item) => !this.isSkippedCandidateCoolingDown(item))
      if (candidate) {
        if (this.activeReplySessionKey) {
          console.info('新方式当前会话仍在回复中，本轮仅扫描未读但不点击', {
            activeReplySessionKey: this.activeReplySessionKey,
            candidateId: candidate.id
          })
        } else {
          const shouldSkipCandidate = await this.shouldSkipUnreadCandidate(screenshot, window, candidate)
          if (!shouldSkipCandidate) {
            console.info('新方式检测到未读会话红点，准备拟人化切换会话', {
              candidateId: candidate.id,
              centerX: candidate.centerX,
              centerY: candidate.centerY,
              score: candidate.score,
              channel: this.channel
            })
            switchedUnreadConversation = await clickConversationCandidate(window, candidate)
            if (switchedUnreadConversation) {
              const settleMs = UNREAD_SWITCH_SETTLE_MIN_MS +
                Math.floor(Math.random() * (UNREAD_SWITCH_SETTLE_MAX_MS - UNREAD_SWITCH_SETTLE_MIN_MS + 1))
              await wait(settleMs)
              const previousPng = screenshot.png
              screenshot = await captureWeChatWindow(window)
              diff = comparePngSnapshots(previousPng, screenshot.png)
              this.lastScreenshotPng = screenshot.png
              console.info('新方式已切换未读会话并重新截图', {
                candidateId: candidate.id,
                settleMs,
                changedRatio: diff.changedRatio
              })
            }
          }
        }
      }
    }
    if (!diff.changed && !shouldParseMinorCurrentChatChange && !shouldRetryFailedVision && !switchedUnreadConversation) {
      console.info('新方式截图无明显变化，本轮不请求视觉模型', {
        digest: diff.digest,
        changedRatio: diff.changedRatio
      })
      this.lastSnapshotDigest = diff.digest
      return null
    }
    if (!diff.changed && !shouldParseMinorCurrentChatChange && shouldRetryFailedVision) {
      console.info('新方式上次视觉解析失败，本轮复用当前截图继续重试', {
        digest: diff.digest,
        failureCount: this.consecutiveVisionFailures
      })
    }

    this.visionRequestRunning = true
    try {
      const snapshot = await parseWeChatSnapshotWithVision(
        screenshot.dataUrl,
        window,
        this.lastSnapshotDigest,
        this.runtimeConfig
      )
      this.latestSnapshotScreenshot = screenshot
      const guardedSnapshot = this.applySnapshotVisionGuard(snapshot, screenshot)
      this.latestSnapshotFromUnreadSwitch = switchedUnreadConversation
      this.lastSnapshotDigest = snapshot.snapshotDigest || diff.digest
      this.consecutiveVisionFailures = 0
      this.lastVisionErrorMessage = ''
      return guardedSnapshot
    } catch (error: any) {
      this.consecutiveVisionFailures += 1
      const errorMessage = error?.message || String(error)
      this.lastVisionErrorMessage = this.consecutiveVisionFailures >= MAX_CONSECUTIVE_VISION_FAILURES
        ? `新方式视觉解析连续失败，请检查后端 Qwen-VL 配置或网络连接：${errorMessage}`
        : errorMessage
      console.warn('新方式视觉解析失败', {
        failureCount: this.consecutiveVisionFailures,
        error: errorMessage
      })
      return null
    } finally {
      this.visionRequestRunning = false
    }
  }

  private async readSnapshot(window: WindowBounds): Promise<ParsedWeChatSnapshot> {
    const snapshot = await this.readSnapshotIfChanged(window)
    return snapshot || { contact: window.title || '微信', messages: [] }
  }

  private applySnapshotVisionGuard(snapshot: ParsedWeChatSnapshot, screenshot: WeChatScreenshot): ParsedWeChatSnapshot {
    const guardContext = this.buildMessageVisionGuardContext(screenshot)
    this.latestSnapshotHasPixelGuard = !!guardContext?.bitmap
    const guardedMessages: ParsedWeChatMessage[] = []
    for (const message of snapshot.messages) {
      const result = applyMessageVisionGuard(message, guardContext)
      if (!result.message) {
        console.info('新方式本地视觉守卫跳过疑似模型误报消息', {
          contact: snapshot.contact,
          content: message.content.slice(0, 40),
          uiId: message.uiId,
          type: message.type,
          bounds: message.bounds,
          reason: result.skipReason
        })
        continue
      }
      if (result.correctedIsSelf) {
        console.info('新方式本地视觉守卫已按气泡颜色和位置纠正消息归属', {
          contact: snapshot.contact,
          content: message.content.slice(0, 40),
          uiId: message.uiId,
          fromIsSelf: message.isSelf,
          toIsSelf: result.message.isSelf,
          bounds: message.bounds
        })
      }
      guardedMessages.push(result.message)
    }
    return {
      ...snapshot,
      messages: guardedMessages
    }
  }

  private hasReliableCustomerTriggerGeometry(message: ParsedWeChatMessage): boolean {
    if (message.bounds) {
      return true
    }
    return !this.latestSnapshotHasPixelGuard
  }

  private buildMessageVisionGuardContext(screenshot: WeChatScreenshot): MessageVisionGuardContext | null {
    try {
      const sourceImage = nativeImage.createFromBuffer(screenshot.png)
      if (sourceImage.isEmpty() || typeof sourceImage.toBitmap !== 'function') {
        return {
          imageWidth: screenshot.width,
          imageHeight: screenshot.height
        }
      }
      const size = sourceImage.getSize()
      const bitmap = sourceImage.toBitmap()
      if (!bitmap || bitmap.length < size.width * size.height * 4) {
        return {
          imageWidth: size.width,
          imageHeight: size.height
        }
      }
      return {
        bitmap,
        imageWidth: size.width,
        imageHeight: size.height
      }
    } catch (error) {
      console.warn('新方式本地视觉守卫读取截图像素失败，降级为仅使用模型结果', error)
      return {
        imageWidth: screenshot.width,
        imageHeight: screenshot.height
      }
    }
  }

  private async shouldSkipUnreadCandidate(
    screenshot: { dataUrl: string; png: Buffer; width: number; height: number },
    window: WindowBounds,
    candidate: UnreadConversationCandidate
  ): Promise<boolean> {
    try {
      const recognized = await recognizeUnreadConversationCandidate(screenshot, window, candidate, this.channel, this.runtimeConfig)
      if (!recognized) {
        return false
      }
      const confidence = typeof recognized.confidence === 'number' ? recognized.confidence : 0
      const specialRule = getSpecialConversationRule(recognized.contact, recognized.accountCategory, recognized.skipReason)
      const shouldSkip = recognized.skipAutoReply || (specialRule?.source === 'contact') || (specialRule?.source === 'category' && confidence >= 0.5)
      if (!shouldSkip) {
        return false
      }
      if (specialRule) {
        recognized.accountCategory = specialRule.accountCategory
        recognized.skipReason = specialRule.skipReason
        recognized.skipAutoReply = true
      }
      this.markCandidateSkipped(candidate, recognized)
      console.info('新方式点击前命中特殊会话过滤规则，直接跳过', {
        candidateId: candidate.id,
        contact: recognized.contact,
        accountCategory: recognized.accountCategory,
        confidence,
        skipReason: recognized.skipReason
      })
      return true
    } catch (error) {
      console.warn('新方式点击前会话预判失败，降级为继续原流程', {
        candidateId: candidate.id,
        error
      })
      return false
    }
  }

  private async handleSkippedSnapshot(window: WindowBounds, snapshot: ParsedWeChatSnapshot): Promise<void> {
    console.info('新方式在聊天窗口中识别到特殊会话，准备返回会话列表', {
      contact: snapshot.contact,
      accountCategory: snapshot.accountCategory,
      skipReason: snapshot.skipReason
    })
    if (snapshot.accountCategory === 'SERVICE_ACCOUNT' || snapshot.accountCategory === 'CUSTOMER_SERVICE') {
      await returnFromNestedConversation(window)
    } else {
      await exitConversationToList(window)
    }
    await wait(240)
    this.lastScreenshotPng = null
    this.lastSnapshotDigest = ''
  }

  private markCandidateSkipped(candidate: UnreadConversationCandidate, recognized: ConversationListItemRecognition): void {
    const skipKey = this.buildSkippedCandidateKey(candidate, recognized.contact)
    this.skippedConversationCandidates.set(skipKey, Date.now() + SKIPPED_CANDIDATE_TTL_MS)
  }

  private isSkippedCandidateCoolingDown(candidate: UnreadConversationCandidate): boolean {
    const now = Date.now()
    const keysToDelete: string[] = []
    let coolingDown = false
    for (const [key, expiresAt] of this.skippedConversationCandidates.entries()) {
      if (expiresAt <= now) {
        keysToDelete.push(key)
        continue
      }
      if (key.startsWith(`${candidate.id}:`)) {
        coolingDown = true
      }
    }
    for (const key of keysToDelete) {
      this.skippedConversationCandidates.delete(key)
    }
    return coolingDown
  }

  private cleanupExpiredSkippedCandidates(now: number): void {
    for (const [key, expiresAt] of this.skippedConversationCandidates.entries()) {
      if (expiresAt <= now) {
        this.skippedConversationCandidates.delete(key)
      }
    }
  }

  private buildSkippedCandidateKey(candidate: UnreadConversationCandidate, contact: string): string {
    return `${candidate.id}:${String(contact || '').trim()}`
  }

  private markRecentMessageContentFingerprint(fingerprint: string): void {
    this.recentMessageContentFingerprints.set(fingerprint, Date.now())
    while (this.recentMessageContentFingerprints.size > MAX_RECENT_MESSAGE_CONTENT_FINGERPRINTS) {
      const oldestFingerprint = this.recentMessageContentFingerprints.keys().next().value
      if (!oldestFingerprint) {
        break
      }
      this.recentMessageContentFingerprints.delete(oldestFingerprint)
    }
  }

  private markRecentSentSelfReplyContent(contact: string, content: string): void {
    const normalizedContent = this.normalizeFingerprintContent(content)
    if (!normalizedContent) {
      return
    }
    const key = this.buildSentSelfReplyContentKey(contact, normalizedContent)
    this.recentSentSelfReplyContents.set(key, {
      contact: String(contact || '').trim(),
      content: normalizedContent,
      expiresAt: Date.now() + RECENT_SENT_SELF_REPLY_TTL_MS
    })
    this.cleanupRecentSentSelfReplyContents(Date.now())
    while (this.recentSentSelfReplyContents.size > MAX_RECENT_SENT_SELF_REPLY_CONTENTS) {
      const oldestKey = this.recentSentSelfReplyContents.keys().next().value
      if (!oldestKey) {
        break
      }
      this.recentSentSelfReplyContents.delete(oldestKey)
    }
  }

  private isRecentSentSelfReplyContent(contact: string, content: string): boolean {
    const normalizedContact = String(contact || '').trim()
    const normalizedContent = this.normalizeFingerprintContent(content)
    const normalizedMatchContent = this.normalizeSelfReplyMatchContent(content)
    if (!normalizedContent || normalizedMatchContent.length < MIN_SELF_REPLY_PARTIAL_MATCH_LENGTH) {
      return false
    }
    this.cleanupRecentSentSelfReplyContents(Date.now())
    for (const item of this.recentSentSelfReplyContents.values()) {
      if (item.contact !== normalizedContact) {
        continue
      }
      const sentMatchContent = this.normalizeSelfReplyMatchContent(item.content)
      if (item.content === normalizedContent) {
        return true
      }
      if (sentMatchContent === normalizedMatchContent) {
        return true
      }
      if (sentMatchContent.length >= MIN_SELF_REPLY_PARTIAL_MATCH_LENGTH && sentMatchContent.includes(normalizedMatchContent)) {
        return true
      }
      if (normalizedMatchContent.length >= MIN_SELF_REPLY_PARTIAL_MATCH_LENGTH && normalizedMatchContent.includes(sentMatchContent)) {
        return true
      }
    }
    return false
  }

  private cleanupRecentSentSelfReplyContents(now: number): void {
    for (const [key, item] of this.recentSentSelfReplyContents.entries()) {
      if (item.expiresAt <= now) {
        this.recentSentSelfReplyContents.delete(key)
      }
    }
  }

  private buildSentSelfReplyContentKey(contact: string, normalizedContent: string): string {
    return `${String(contact || '').trim()}:${normalizedContent}`
  }

  private buildSessionKey(contact: string): string {
    return String(contact || '').trim()
  }

  private async markCustomerMessageReplied(fingerprint: string): Promise<void> {
    this.cleanupExpiredRepliedCustomerFingerprints(Date.now())
    const expiresAt = Date.now() + this.getCustomerReplyFingerprintTtlMs(fingerprint)
    if (!this.repliedCustomerFingerprints.has(fingerprint)) {
      this.repliedCustomerFingerprintOrder.push(fingerprint)
    }
    this.repliedCustomerFingerprints.set(fingerprint, expiresAt)

    while (this.repliedCustomerFingerprintOrder.length > MAX_PERSISTED_REPLIED_MESSAGES) {
      const oldestFingerprint = this.repliedCustomerFingerprintOrder.shift()
      if (oldestFingerprint) {
        this.repliedCustomerFingerprints.delete(oldestFingerprint)
      }
    }

    await this.saveRepliedCustomerFingerprints()
  }

  private async loadRepliedCustomerFingerprints(): Promise<void> {
    if (this.storeLoaded) {
      return
    }
    this.storeLoaded = true
    try {
      const raw = await readFile(this.getRepliedStorePath(), 'utf-8')
      const parsed = JSON.parse(raw) as Partial<RepliedMessageStore>
      const records = this.normalizePersistedRepliedRecords(Array.isArray(parsed.records) ? parsed.records : [])
      this.repliedCustomerFingerprintOrder = records.map((record) => record.fingerprint)
      this.repliedCustomerFingerprints = new Map(records.map((record) => [record.fingerprint, record.expiresAt]))
      if (!Array.isArray(parsed.records) && Array.isArray(parsed.fingerprints) && parsed.fingerprints.length > 0) {
        console.info('检测到旧版客户消息回复记录，旧记录缺少时间边界，已忽略以避免误拦截新的同文本消息', {
          legacyCount: parsed.fingerprints.length
        })
      }
      console.info('新方式已加载客户消息回复记录', {
        count: this.repliedCustomerFingerprints.size
      })
    } catch (error: any) {
      if (error?.code !== 'ENOENT') {
        console.warn('新方式加载客户消息回复记录失败，将从空记录继续', error)
      }
      this.repliedCustomerFingerprintOrder = []
      this.repliedCustomerFingerprints.clear()
    }
  }

  private async saveRepliedCustomerFingerprints(): Promise<void> {
    this.cleanupExpiredRepliedCustomerFingerprints(Date.now())
    const store: RepliedMessageStore = {
      version: 2,
      records: this.repliedCustomerFingerprintOrder
        .slice(-MAX_PERSISTED_REPLIED_MESSAGES)
        .map((fingerprint) => ({
          fingerprint,
          expiresAt: this.repliedCustomerFingerprints.get(fingerprint) || 0
        }))
        .filter((record) => record.expiresAt > Date.now())
    }
    try {
      await mkdir(dirname(this.getRepliedStorePath()), { recursive: true })
      await writeFile(this.getRepliedStorePath(), `${JSON.stringify(store, null, 2)}\n`, 'utf-8')
    } catch (error) {
      console.warn('新方式保存客户消息回复记录失败', error)
    }
  }

  private getRepliedStorePath(): string {
    return join(app.getPath('userData'), 'wechat-native-replied-messages.json')
  }

  private buildFingerprint(contact: string, content: string, isSelf: boolean, uiId?: string): string {
    const normalizedUiId = String(uiId || '').trim()
    const normalizedContent = this.normalizeFingerprintContent(content)
    if (normalizedUiId) {
      return `${contact}:${isSelf ? 'self' : 'customer'}:${normalizedUiId}:${normalizedContent}`
    }
    return `${contact}:${isSelf ? 'self' : 'customer'}:${normalizedContent}`
  }

  private buildContentFingerprint(contact: string, content: string, isSelf: boolean): string {
    return `${contact}:${isSelf ? 'self' : 'customer'}:${this.normalizeFingerprintContent(content)}`
  }

  private buildLatestFingerprintByContent(snapshot: ParsedWeChatSnapshot): Map<string, string> {
    const latestFingerprintByContent = new Map<string, string>()
    for (const message of snapshot.messages) {
      const contentFingerprint = this.buildParsedMessageContentFingerprint(snapshot.contact, message)
      const fingerprint = this.buildFingerprint(snapshot.contact, message.content, message.isSelf, message.uiId)
      latestFingerprintByContent.set(contentFingerprint, fingerprint)
    }
    return latestFingerprintByContent
  }

  private buildParsedMessageContentFingerprint(contact: string, message: ParsedWeChatMessage): string {
    const type = this.normalizeMessageType(message)
    if (type === 'image' || type === 'sticker') {
      return this.buildImageMessageStableFingerprint(contact, message, message.isSelf)
    }
    return this.buildContentFingerprint(contact, message.content, message.isSelf)
  }

  private buildCustomerReplyFingerprint(contact: string, message: ParsedWeChatMessage): string {
    const type = this.normalizeMessageType(message)
    if (type === 'image' || type === 'sticker') {
      return this.buildImageMessageStableFingerprint(contact, message, false)
    }
    return this.buildContentFingerprint(contact, message.content, false)
  }

  private buildImageMessageStableFingerprint(contact: string, message: ParsedWeChatMessage, isSelf: boolean): string {
    const type = this.normalizeMessageType(message)
    const imageSignature = this.buildImageReplySignature(message)
    const fallbackSignature = `placeholder:${this.normalizeFingerprintContent(message.content)}`
    return `${contact}:${isSelf ? 'self' : 'customer'}:${type}:${imageSignature || fallbackSignature}`
  }

  private getCustomerReplyFingerprintTtlMs(fingerprint: string): number {
    if (fingerprint.includes(':customer:image:') || fingerprint.includes(':customer:sticker:')) {
      return IMAGE_REPLIED_CUSTOMER_FINGERPRINT_TTL_MS
    }
    return REPLIED_CUSTOMER_FINGERPRINT_TTL_MS
  }

  private buildImageReplySignature(message: ParsedWeChatMessage): string {
    if (!this.latestSnapshotScreenshot || !message.bounds) {
      return ''
    }
    try {
      const sourceImage = nativeImage.createFromBuffer(this.latestSnapshotScreenshot.png)
      if (sourceImage.isEmpty()) {
        return ''
      }
      const sourceSize = sourceImage.getSize()
      const initialCropRect = this.buildImageCropRect(message.bounds, sourceSize.width, sourceSize.height)
      const searchCropRect = this.buildExpandedImageSearchRect(message.bounds, sourceSize.width, sourceSize.height)
      const cropRect = this.refineImageCropRect(sourceImage, initialCropRect, false, searchCropRect)
      const bitmap = sourceImage.toBitmap()
      if (!bitmap || bitmap.length < sourceSize.width * sourceSize.height * 4) {
        return ''
      }
      return this.buildImageReplySignatureFromBitmap(bitmap, sourceSize.width, sourceSize.height, cropRect)
    } catch {
      return ''
    }
  }

  private buildImageReplySignatureFromBitmap(
    bitmap: Buffer,
    imageWidth: number,
    imageHeight: number,
    cropRect: ImageCropRect
  ): string {
    const left = Math.max(0, cropRect.x)
    const top = Math.max(0, cropRect.y)
    const right = Math.min(imageWidth, cropRect.x + cropRect.width)
    const bottom = Math.min(imageHeight, cropRect.y + cropRect.height)
    if (right <= left || bottom <= top) {
      return ''
    }
    const cells: string[] = []
    for (let cellY = 0; cellY < IMAGE_REPLY_SIGNATURE_GRID_SIZE; cellY += 1) {
      const sampleTop = top + Math.floor(((bottom - top) * cellY) / IMAGE_REPLY_SIGNATURE_GRID_SIZE)
      const sampleBottom = top + Math.floor(((bottom - top) * (cellY + 1)) / IMAGE_REPLY_SIGNATURE_GRID_SIZE)
      for (let cellX = 0; cellX < IMAGE_REPLY_SIGNATURE_GRID_SIZE; cellX += 1) {
        const sampleLeft = left + Math.floor(((right - left) * cellX) / IMAGE_REPLY_SIGNATURE_GRID_SIZE)
        const sampleRight = left + Math.floor(((right - left) * (cellX + 1)) / IMAGE_REPLY_SIGNATURE_GRID_SIZE)
        cells.push(this.buildImageReplySignatureCell(bitmap, imageWidth, sampleLeft, sampleTop, sampleRight, sampleBottom))
      }
    }
    return cells.join('')
  }

  private buildImageReplySignatureCell(
    bitmap: Buffer,
    imageWidth: number,
    left: number,
    top: number,
    right: number,
    bottom: number
  ): string {
    let redTotal = 0
    let greenTotal = 0
    let blueTotal = 0
    let count = 0
    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) {
        const index = (y * imageWidth + x) * 4
        blueTotal += bitmap[index]
        greenTotal += bitmap[index + 1]
        redTotal += bitmap[index + 2]
        count += 1
      }
    }
    if (count <= 0) {
      return '000'
    }
    const redBucket = Math.min(7, Math.floor((redTotal / count) / IMAGE_REPLY_SIGNATURE_COLOR_BUCKET_SIZE))
    const greenBucket = Math.min(7, Math.floor((greenTotal / count) / IMAGE_REPLY_SIGNATURE_COLOR_BUCKET_SIZE))
    const blueBucket = Math.min(7, Math.floor((blueTotal / count) / IMAGE_REPLY_SIGNATURE_COLOR_BUCKET_SIZE))
    return `${redBucket}${greenBucket}${blueBucket}`
  }

  private hasRepliedCustomerFingerprint(fingerprint: string): boolean {
    this.cleanupExpiredRepliedCustomerFingerprints(Date.now())
    return this.repliedCustomerFingerprints.has(fingerprint)
  }

  private normalizeMessageType(message: ParsedWeChatMessage): WeChatMessageType {
    if (message.type === 'image' || message.type === 'sticker') {
      return message.type
    }
    return 'text'
  }

  private cacheImageMessage(contact: string, message: ParsedWeChatMessage): void {
    if (!this.latestSnapshotScreenshot || !message.bounds) {
      console.info('新方式识别到图片消息但缺少截图或气泡坐标，暂不缓存裁剪信息', {
        contact,
        uiId: message.uiId,
        hasSnapshot: !!this.latestSnapshotScreenshot,
        hasBounds: !!message.bounds
      })
      return
    }
    this.cachedImageMessages.set(message.uiId, {
      contact,
      uiId: message.uiId,
      bounds: message.bounds,
      screenshot: this.latestSnapshotScreenshot,
      expiresAt: Date.now() + IMAGE_MESSAGE_CACHE_TTL_MS
    })
  }

  private findCachedImageMessage(messageUiId: string, senderId: string): CachedImageMessage | null {
    if (messageUiId && this.cachedImageMessages.has(messageUiId)) {
      return this.cachedImageMessages.get(messageUiId) || null
    }
    const candidates = [...this.cachedImageMessages.values()]
      .filter((item) => !senderId || item.contact === senderId)
      .sort((left, right) => right.expiresAt - left.expiresAt)
    return candidates[0] || null
  }

  private cleanupCachedImageMessages(now: number): void {
    for (const [key, item] of this.cachedImageMessages.entries()) {
      if (item.expiresAt <= now) {
        this.cachedImageMessages.delete(key)
      }
    }
  }

  private buildImageCropRect(
    bounds: WeChatMessageBounds,
    imageWidth: number,
    imageHeight: number
  ): ImageCropRect {
    const left = Math.max(0, Math.floor(bounds.x - IMAGE_CROP_PADDING_PX))
    const top = Math.max(0, Math.floor(bounds.y - IMAGE_CROP_PADDING_PX))
    const right = Math.min(imageWidth, Math.ceil(bounds.x + bounds.w + IMAGE_CROP_PADDING_PX))
    const bottom = Math.min(imageHeight, Math.ceil(bounds.y + bounds.h + IMAGE_CROP_PADDING_PX))
    return {
      x: left,
      y: top,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top)
    }
  }

  private buildExpandedImageSearchRect(
    bounds: WeChatMessageBounds,
    imageWidth: number,
    imageHeight: number
  ): ImageCropRect {
    const left = Math.max(0, Math.floor(bounds.x - IMAGE_CROP_SEARCH_HORIZONTAL_PADDING_PX))
    const top = Math.max(0, Math.floor(bounds.y - IMAGE_CROP_SEARCH_TOP_PADDING_PX))
    const bottomExtension = Math.max(
      IMAGE_CROP_SEARCH_BOTTOM_MIN_EXTENSION_PX,
      Math.floor(bounds.h * IMAGE_CROP_SEARCH_BOTTOM_RATIO)
    )
    const right = Math.min(imageWidth, Math.ceil(bounds.x + bounds.w + IMAGE_CROP_SEARCH_HORIZONTAL_PADDING_PX))
    const bottom = Math.min(imageHeight, Math.ceil(bounds.y + bounds.h + bottomExtension))
    return {
      x: left,
      y: top,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top)
    }
  }

  private refineImageCropRect(
    sourceImage: NativeImage,
    cropRect: ImageCropRect,
    shouldLog = true,
    searchCropRect: ImageCropRect = cropRect
  ): ImageCropRect {
    const size = sourceImage.getSize()
    const shouldSearchExpandedRegion = searchCropRect.x !== cropRect.x ||
      searchCropRect.y !== cropRect.y ||
      searchCropRect.width !== cropRect.width ||
      searchCropRect.height !== cropRect.height
    if (!shouldSearchExpandedRegion && !this.shouldRefineImageCropRect(cropRect, size.width, size.height)) {
      return cropRect
    }
    if (typeof sourceImage.toBitmap !== 'function') {
      return cropRect
    }
    let bitmap: Buffer
    try {
      bitmap = sourceImage.toBitmap()
    } catch (error) {
      if (shouldLog) {
        console.warn('新方式微信图片裁剪二次收紧失败，保留视觉模型原始区域', error)
      }
      return cropRect
    }
    if (!bitmap || bitmap.length < size.width * size.height * 4) {
      return cropRect
    }

    const contentBounds = this.findImageContentBounds(bitmap, size.width, size.height, searchCropRect)
    if (!contentBounds) {
      return cropRect
    }
    const refinedRect = this.buildImageCropRect(
      {
        x: contentBounds.minX,
        y: contentBounds.minY,
        w: contentBounds.maxX - contentBounds.minX + 1,
        h: contentBounds.maxY - contentBounds.minY + 1
      },
      size.width,
      size.height
    )
    const originalArea = cropRect.width * cropRect.height
    const refinedArea = refinedRect.width * refinedRect.height
    const isUsefulExpansion = refinedRect.width > cropRect.width + IMAGE_CROP_PADDING_PX ||
      refinedRect.height > cropRect.height + IMAGE_CROP_PADDING_PX
    if (
      refinedRect.width < IMAGE_CROP_REFINEMENT_MIN_SIZE_PX ||
      refinedRect.height < IMAGE_CROP_REFINEMENT_MIN_SIZE_PX ||
      (!isUsefulExpansion && refinedArea >= originalArea * IMAGE_CROP_REFINEMENT_KEEP_ORIGINAL_RATIO)
    ) {
      return cropRect
    }
    if (shouldLog) {
      console.info('新方式已二次收紧微信图片裁剪区域', {
        originalCropRect: cropRect,
        refinedCropRect: refinedRect
      })
    }
    return refinedRect
  }

  private shouldRefineImageCropRect(cropRect: ImageCropRect, imageWidth: number, imageHeight: number): boolean {
    if (imageWidth <= 0 || imageHeight <= 0) {
      return false
    }
    const widthRatio = cropRect.width / imageWidth
    const heightRatio = cropRect.height / imageHeight
    return cropRect.width >= IMAGE_CROP_REFINEMENT_MIN_WIDTH_PX ||
      cropRect.height >= IMAGE_CROP_REFINEMENT_MIN_HEIGHT_PX ||
      widthRatio >= IMAGE_CROP_REFINEMENT_MIN_WIDTH_RATIO ||
      heightRatio >= IMAGE_CROP_REFINEMENT_MIN_HEIGHT_RATIO
  }

  private findImageContentBounds(
    bitmap: Buffer,
    imageWidth: number,
    imageHeight: number,
    cropRect: ImageCropRect
  ): ImageContentBounds | null {
    const left = Math.max(0, cropRect.x)
    const top = Math.max(0, cropRect.y)
    const right = Math.min(imageWidth - 1, cropRect.x + cropRect.width - 1)
    const bottom = Math.min(imageHeight - 1, cropRect.y + cropRect.height - 1)
    if (right <= left || bottom <= top) {
      return null
    }

    const rowCounts = new Array(bottom - top + 1).fill(0)
    for (let y = top; y <= bottom; y += 1) {
      for (let x = left; x <= right; x += 1) {
        const index = (y * imageWidth + x) * 4
        const blue = bitmap[index]
        const green = bitmap[index + 1]
        const red = bitmap[index + 2]
        if (this.isLikelyImageContentPixel(red, green, blue)) {
          rowCounts[y - top] += 1
        }
      }
    }

    const rowThreshold = Math.max(8, Math.floor((right - left + 1) * IMAGE_CROP_CONTENT_DENSE_RATIO))
    const rowSpan = this.findLargestDenseSpan(rowCounts, rowThreshold)
    if (!rowSpan) {
      return null
    }

    const rowSpanTop = top + rowSpan.start
    const rowSpanBottom = top + rowSpan.end
    const columnCounts = new Array(right - left + 1).fill(0)
    for (let y = rowSpanTop; y <= rowSpanBottom; y += 1) {
      for (let x = left; x <= right; x += 1) {
        const index = (y * imageWidth + x) * 4
        const blue = bitmap[index]
        const green = bitmap[index + 1]
        const red = bitmap[index + 2]
        if (this.isLikelyImageContentPixel(red, green, blue)) {
          columnCounts[x - left] += 1
        }
      }
    }

    const columnThreshold = Math.max(8, Math.floor((rowSpanBottom - rowSpanTop + 1) * IMAGE_CROP_CONTENT_DENSE_RATIO))
    const columnSpan = this.findLargestDenseSpan(columnCounts, columnThreshold)
    if (!columnSpan) {
      return null
    }
    return {
      minX: left + columnSpan.start,
      minY: top + rowSpan.start,
      maxX: left + columnSpan.end,
      maxY: top + rowSpan.end
    }
  }

  private findLargestDenseSpan(counts: number[], threshold: number): DenseSpan | null {
    let bestSpan: DenseSpan | null = null
    let currentStart = -1
    for (let index = 0; index <= counts.length; index += 1) {
      const isDense = index < counts.length && counts[index] >= threshold
      if (isDense && currentStart < 0) {
        currentStart = index
      }
      if ((!isDense || index === counts.length) && currentStart >= 0) {
        const currentSpan = { start: currentStart, end: index - 1 }
        if (!bestSpan || currentSpan.end - currentSpan.start > bestSpan.end - bestSpan.start) {
          bestSpan = currentSpan
        }
        currentStart = -1
      }
    }
    return bestSpan
  }

  private isLikelyImageContentPixel(red: number, green: number, blue: number): boolean {
    const maxChannel = Math.max(red, green, blue)
    const minChannel = Math.min(red, green, blue)
    const channelSpread = maxChannel - minChannel
    const isLightWechatBackground = red >= 225 && green >= 225 && blue >= 225 && channelSpread <= 28
    return !isLightWechatBackground
  }

  private cleanupExpiredRepliedCustomerFingerprints(now: number): void {
    let hasExpired = false
    for (const [fingerprint, expiresAt] of this.repliedCustomerFingerprints.entries()) {
      if (expiresAt <= now) {
        this.repliedCustomerFingerprints.delete(fingerprint)
        hasExpired = true
      }
    }
    if (hasExpired) {
      this.repliedCustomerFingerprintOrder = this.repliedCustomerFingerprintOrder.filter((fingerprint) =>
        this.repliedCustomerFingerprints.has(fingerprint)
      )
    }
  }

  private normalizePersistedRepliedRecords(records: unknown[]): RepliedMessageRecord[] {
    const normalized: RepliedMessageRecord[] = []
    const seen = new Set<string>()
    const now = Date.now()
    const addRecord = (record: RepliedMessageRecord): void => {
      const value = String(record.fingerprint || '').trim()
      if (!value || seen.has(value)) {
        return
      }
      if (!Number.isFinite(record.expiresAt) || record.expiresAt <= now) {
        return
      }
      seen.add(value)
      normalized.push({ fingerprint: value, expiresAt: record.expiresAt })
    }

    for (const item of records) {
      if (!item || typeof item !== 'object') {
        continue
      }
      const raw = item as Partial<RepliedMessageRecord>
      addRecord({
        fingerprint: String(raw.fingerprint || ''),
        expiresAt: Number(raw.expiresAt)
      })
    }

    return normalized.slice(-MAX_PERSISTED_REPLIED_MESSAGES)
  }

  private buildSentSelfMessage(target: unknown, content: string): NativeDriverMessage {
    const now = Date.now()
    const contact = String(target || this.lastWindow?.title || '微信').trim() || '微信'
    const uiId = `native-self-${now}`
    return {
      id: uiId,
      contact,
      content,
      timestamp: now,
      type: 'text',
      is_self: true,
      trigger_reply: false,
      ui_id: uiId,
      source: this.channel
    }
  }

  private normalizeFingerprintContent(content: string): string {
    return content.replace(/\s+/g, ' ').trim()
  }

  private normalizeSelfReplyMatchContent(content: string): string {
    return this.normalizeFingerprintContent(content)
      .replace(/\s*(?:\.{2,}|…+|。{2,})\s*$/g, '')
      .trim()
  }
}
