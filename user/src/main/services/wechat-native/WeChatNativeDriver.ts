import { app } from 'electron'
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
  ParsedWeChatSnapshot,
  UnreadConversationCandidate,
  WeChatChannel,
  WeChatVisionRuntimeConfig,
  WindowBounds
} from './types'

const MAX_PERSISTED_REPLIED_MESSAGES = 200
const NATIVE_POLL_INTERVAL_MS = 1500
const MAX_CONSECUTIVE_VISION_FAILURES = 3
const UNREAD_SWITCH_SETTLE_MIN_MS = 320
const UNREAD_SWITCH_SETTLE_MAX_MS = 760
const SKIPPED_CANDIDATE_TTL_MS = 60_000
const MAX_RECENT_MESSAGE_CONTENT_FINGERPRINTS = 1000
const MIN_CURRENT_CHAT_MESSAGE_CHANGE_RATIO = 0.002

const wait = (milliseconds: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

type RepliedMessageStore = {
  version: number
  fingerprints: string[]
}

export class WeChatNativeDriver {
  private running = false
  private managedMode: ManagedMode = 'full'
  private seenMessageFingerprints = new Set<string>()
  private recentMessageContentFingerprints = new Map<string, number>()
  private repliedCustomerFingerprints = new Set<string>()
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
    this.lastPollAt = 0
    this.lastScreenshotPng = null
    this.lastSnapshotDigest = ''
    this.consecutiveVisionFailures = 0
    this.lastVisionErrorMessage = ''
    this.activeReplySessionKey = ''
    this.pendingReplySessionKey = ''
    this.skippedConversationCandidates.clear()
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
    this.lastScreenshotPng = null
    this.lastSnapshotDigest = ''
    this.visionRequestRunning = false
    this.lastVisionErrorMessage = ''
    this.activeReplySessionKey = ''
    this.pendingReplySessionKey = ''
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
    const latestCustomerMessage = [...snapshot.messages].reverse().find((message) => !message.isSelf)
    const latestCustomerKey = latestCustomerMessage
      ? this.buildFingerprint(snapshot.contact, latestCustomerMessage.content, latestCustomerMessage.isSelf, latestCustomerMessage.uiId)
      : ''
    const snapshotSessionKey = this.buildSessionKey(snapshot.contact)

    const messages: NativeDriverMessage[] = []
    const observedContentFingerprints = new Set<string>()
    let hasNewReplyTrigger = false
    for (const parsedMessage of snapshot.messages) {
      const fingerprint = this.buildFingerprint(snapshot.contact, parsedMessage.content, parsedMessage.isSelf, parsedMessage.uiId)
      const contentFingerprint = this.buildContentFingerprint(snapshot.contact, parsedMessage.content, parsedMessage.isSelf)
      const customerReplyFingerprint = this.buildCustomerReplyFingerprint(snapshot.contact, parsedMessage.content)
      observedContentFingerprints.add(contentFingerprint)
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
      if (parsedMessage.isSelf) {
        console.info('新方式轮询识别到己方消息，仅更新基线不追加显示', {
          contact: snapshot.contact,
          content: parsedMessage.content.slice(0, 40),
          uiId: parsedMessage.uiId
        })
        continue
      }

      const shouldTriggerReply = !parsedMessage.isSelf &&
        fingerprint === latestCustomerKey &&
        this.managedMode === 'full' &&
        !this.repliedCustomerFingerprints.has(customerReplyFingerprint)

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
      messages.push({
        id: `${parsedMessage.uiId}-${now}`,
        contact: snapshot.contact,
        content: parsedMessage.content,
        timestamp: now,
        type: 'text',
        is_self: parsedMessage.isSelf,
        trigger_reply: shouldTriggerReply,
        ui_id: parsedMessage.uiId,
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
      return this.copyImageMessage()
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

  async copyImageMessage(): Promise<NativeDriverResult> {
    return { ok: false, error: 'native_image_copy_unsupported', message: '新方式暂不支持图片复制' }
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

  private buildSessionKey(contact: string): string {
    return String(contact || '').trim()
  }

  private async markCustomerMessageReplied(fingerprint: string): Promise<void> {
    if (!this.repliedCustomerFingerprints.has(fingerprint)) {
      this.repliedCustomerFingerprints.add(fingerprint)
      this.repliedCustomerFingerprintOrder.push(fingerprint)
    }

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
      const fingerprints = Array.isArray(parsed.fingerprints) ? parsed.fingerprints : []
      this.repliedCustomerFingerprintOrder = this.normalizePersistedRepliedFingerprints(fingerprints)
      this.repliedCustomerFingerprints = new Set(this.repliedCustomerFingerprintOrder)
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
    const store: RepliedMessageStore = {
      version: 1,
      fingerprints: this.repliedCustomerFingerprintOrder.slice(-MAX_PERSISTED_REPLIED_MESSAGES)
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

  private buildCustomerReplyFingerprint(contact: string, content: string): string {
    return this.buildContentFingerprint(contact, content, false)
  }

  private normalizePersistedRepliedFingerprints(fingerprints: unknown[]): string[] {
    const normalized: string[] = []
    const seen = new Set<string>()
    const addFingerprint = (fingerprint: string): void => {
      const value = String(fingerprint || '').trim()
      if (!value || seen.has(value)) {
        return
      }
      seen.add(value)
      normalized.push(value)
    }

    for (const item of fingerprints) {
      const fingerprint = String(item || '').trim()
      addFingerprint(fingerprint)
      addFingerprint(this.convertLegacyReplyFingerprintToContentFingerprint(fingerprint))
    }

    return normalized.slice(-MAX_PERSISTED_REPLIED_MESSAGES)
  }

  private convertLegacyReplyFingerprintToContentFingerprint(fingerprint: string): string {
    const customerMarker = ':customer:'
    const markerIndex = fingerprint.indexOf(customerMarker)
    if (markerIndex < 0) {
      return ''
    }

    const contact = fingerprint.slice(0, markerIndex)
    const payload = fingerprint.slice(markerIndex + customerMarker.length)
    const separatorIndex = payload.indexOf(':')
    if (!contact || separatorIndex < 0) {
      return ''
    }

    const uiId = payload.slice(0, separatorIndex)
    const content = payload.slice(separatorIndex + 1)
    if (!this.looksLikeLegacyMessageUiId(uiId) || !content) {
      return ''
    }

    return this.buildCustomerReplyFingerprint(contact, content)
  }

  private looksLikeLegacyMessageUiId(uiId: string): boolean {
    return /^(vlm|msg|message|customer|native|duplicate|old-visible|minor|replied|bubble|floating)[\w-]*$/i.test(uiId) || /^\d+$/.test(uiId)
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
}
