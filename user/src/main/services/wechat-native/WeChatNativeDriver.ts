import { app, nativeImage, type NativeImage } from 'electron'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { recognizeUnreadConversationCandidate } from './conversationListRecognizer'
import { clickConversationCandidate, exitConversationToList, pasteAndSendText } from './inputBackend'
import { captureWeChatWindow } from './screenReader'
import { comparePngSnapshots } from './snapshotDiff'
import { findUnreadConversationCandidates } from './unreadDetector'
import { parseWeChatSnapshotWithVision } from './visionClient'
import { findWeChatWindow, focusWindow, isPlausibleWeChatWindow } from './windowLocator'
import type {
  ConversationListItemRecognition,
  ManagedMode,
  NativeDriverMessage,
  NativeDriverResult,
  ParsedWeChatMessage,
  ParsedWeChatSnapshot,
  UnreadConversationCandidate,
  WeChatChannel,
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

const wait = (milliseconds: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

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
  private cachedImageMessages = new Map<string, CachedImageMessage>()

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
    this.cachedImageMessages.clear()
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
    this.cachedImageMessages.clear()
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
    if (snapshot.skipAutoReply) {
      await this.handleSkippedSnapshot(window, snapshot)
      return { ok: true, messages: [] }
    }
    if (snapshot.messages.length === 0) {
      return { ok: true, messages: [] }
    }

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

      const shouldTriggerReply = !parsedMessage.isSelf &&
        fingerprint === latestVisibleCustomerKey &&
        this.managedMode === 'full' &&
        !this.hasRepliedCustomerFingerprint(customerReplyFingerprint)

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
    if (action === 'marketing_like' || action === 'marketing_comment') {
      return { ok: false, error: 'native_marketing_unsupported', message: '新方式暂不支持朋友圈营销任务' }
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

  private async refreshBaseline(window: WindowBounds): Promise<void> {
    try {
      const snapshot = await this.readSnapshot(window)
      for (const message of snapshot.messages) {
        this.seenMessageFingerprints.add(this.buildFingerprint(snapshot.contact, message.content, message.isSelf, message.uiId))
      }
      console.info('新方式已建立当前会话消息基线', { count: snapshot.messages.length })
    } catch (error) {
      console.warn('新方式建立消息基线失败，后续轮询会继续尝试', error)
    }
  }

  private async readSnapshotIfChanged(window: WindowBounds): Promise<ParsedWeChatSnapshot | null> {
    let screenshot = await captureWeChatWindow(window)
    let diff = comparePngSnapshots(this.lastScreenshotPng, screenshot.png)
    this.lastScreenshotPng = screenshot.png
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
      this.lastSnapshotDigest = snapshot.snapshotDigest || diff.digest
      this.consecutiveVisionFailures = 0
      this.lastVisionErrorMessage = ''
      return snapshot
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
      const hitFixedRule = recognized.accountCategory === 'FILE_HELPER'
        || recognized.accountCategory === 'TENCENT_NEWS'
        || recognized.accountCategory === 'OFFICIAL_ACCOUNT'
        || recognized.accountCategory === 'SERVICE_ACCOUNT'
      const shouldSkip = recognized.skipAutoReply || (hitFixedRule && confidence >= 0.5)
      if (!shouldSkip) {
        return false
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
    await exitConversationToList(window)
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
