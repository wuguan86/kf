import type {
  ConversationListItemRecognition,
  MarketingMomentCandidate,
  MarketingMomentsRecognition,
  ParsedWeChatMessage,
  ParsedWeChatSnapshot,
  WeChatAccountCategory,
  WeChatConversationType,
  WeChatMessageBounds,
  WeChatMessageType,
  WeChatVisionRuntimeConfig,
  WindowBounds
} from './types'

type VisionMessage = {
  content?: unknown
  isSelf?: unknown
  uiId?: unknown
  type?: unknown
  bounds?: unknown
  confidence?: unknown
}

type VisionResponse = {
  contact?: unknown
  messages?: VisionMessage[]
  moments?: unknown
  snapshotDigest?: unknown
  changed?: unknown
  conversationType?: unknown
  accountCategory?: unknown
  skipAutoReply?: unknown
  skipReason?: unknown
  confidence?: unknown
}

const VISION_REQUEST_TIMEOUT_MS = 15_000

export const parseWeChatSnapshotWithVision = async (
  imageDataUrl: string,
  window: WindowBounds,
  previousDigest: string,
  config: WeChatVisionRuntimeConfig
): Promise<ParsedWeChatSnapshot> => {
  return requestVisionRecognition(imageDataUrl, window, previousDigest, config, 'CHAT')
}

export const recognizeConversationListItemWithVision = async (
  imageDataUrl: string,
  window: WindowBounds,
  config: WeChatVisionRuntimeConfig
): Promise<ConversationListItemRecognition> => {
  const parsed = await requestVisionRecognition(imageDataUrl, window, '', config, 'CONVERSATION_LIST')
  return {
    contact: parsed.contact,
    conversationType: parsed.conversationType || 'SINGLE',
    accountCategory: parsed.accountCategory || 'UNKNOWN',
    skipAutoReply: parsed.skipAutoReply === true,
    skipReason: String(parsed.skipReason || '').trim(),
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : null
  }
}

export const recognizeMarketingMomentsWithVision = async (
  imageDataUrl: string,
  window: WindowBounds,
  previousDigest: string,
  config: WeChatVisionRuntimeConfig
): Promise<MarketingMomentsRecognition> => {
  const parsed = await requestVisionRecognition(imageDataUrl, window, previousDigest, config, 'MARKETING_MOMENTS')
  return {
    moments: parsed.moments || [],
    snapshotDigest: parsed.snapshotDigest,
    changed: parsed.changed,
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : null
  }
}

const requestVisionRecognition = async (
  imageDataUrl: string,
  window: WindowBounds,
  previousDigest: string,
  config: WeChatVisionRuntimeConfig,
  sceneHint: 'CHAT' | 'CONVERSATION_LIST' | 'MARKETING_MOMENTS'
): Promise<ParsedWeChatSnapshot> => {
  if (!config.backendBaseUrl || !config.token) {
    throw new Error('新方式缺少后端地址或登录凭证，请重新登录后再启动')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), VISION_REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(`${config.backendBaseUrl.replace(/\/api\/?$/, '').replace(/\/$/, '')}/api/user/wechat-vision/parse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.token}`,
        'X-Tenant-Id': config.tenantId || '1'
      },
      body: JSON.stringify({
        imageDataUrl,
        windowTitle: window.title,
        previousDigest,
        driverMode: config.channel === 'enterprise' ? 'native-enterprise' : 'native-personal',
        sceneHint
      }),
      signal: controller.signal
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      throw new Error(payload?.msg || payload?.message || `视觉解析请求失败，状态码 ${response.status}`)
    }
    if (!payload || payload.code !== 0) {
      throw new Error(payload?.msg || '视觉解析返回异常')
    }
    return normalizeVisionResponse(payload.data)
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error('视觉解析请求超时')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

const normalizeVisionResponse = (data: VisionResponse): ParsedWeChatSnapshot => {
  const contact = String(data?.contact || '微信').trim() || '微信'
  const messages = Array.isArray(data?.messages) ? data.messages : []
  return {
    contact,
    snapshotDigest: String(data?.snapshotDigest || '').trim(),
    changed: data?.changed !== false,
    conversationType: normalizeConversationType(data?.conversationType),
    accountCategory: normalizeAccountCategory(data?.accountCategory),
    skipAutoReply: data?.skipAutoReply === true,
    skipReason: String(data?.skipReason || '').trim(),
    confidence: typeof data?.confidence === 'number' ? data.confidence : null,
    moments: normalizeMarketingMoments(data?.moments),
    messages: messages
      .map((message, index): ParsedWeChatMessage | null => {
        const type = normalizeMessageType(message?.type)
        let content = String(message?.content || '').trim()
        if (!content && type === 'image') {
          content = '[图片]'
        }
        if (!content && type === 'sticker') {
          content = '[表情包]'
        }
        if (!content) {
          return null
        }
        const uiId = String(message?.uiId || `vlm-${index}`).trim()
        return {
          content,
          isSelf: message?.isSelf === true,
          uiId,
          type,
          bounds: normalizeBounds(message?.bounds)
        }
      })
      .filter((message): message is ParsedWeChatMessage => !!message)
  }
}

const normalizeMarketingMoments = (value: unknown): MarketingMomentCandidate[] => {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .map((item): MarketingMomentCandidate | null => {
      if (!item || typeof item !== 'object') {
        return null
      }
      const raw = item as Record<string, unknown>
      const author = String(raw.author || '').trim()
      const content = String(raw.content || '').trim()
      if (!author && !content) {
        return null
      }
      return {
        author,
        content,
        visualIndex: normalizeVisualIndex(raw.visualIndex ?? raw.index ?? raw.order),
        suitableForLike: typeof raw.suitableForLike === 'boolean' ? raw.suitableForLike : null,
        verticalRange: normalizeVerticalRange(raw.verticalRange),
        postBounds: normalizeBounds(raw.postBounds || raw.bounds),
        likePoint: normalizePoint(raw.likePoint),
        commentPoint: normalizePoint(raw.commentPoint),
        confidence: typeof raw.confidence === 'number' ? raw.confidence : null
      }
    })
    .filter((item): item is MarketingMomentCandidate => !!item)
}

const normalizeVisualIndex = (value: unknown): number | null => {
  const index = Number(value)
  if (!Number.isInteger(index) || index < 0) {
    return null
  }
  return index
}

const normalizeVerticalRange = (value: unknown): { y: number; h: number } | undefined => {
  if (!value || typeof value !== 'object') {
    return undefined
  }
  const raw = value as Record<string, unknown>
  const y = Number(raw.y ?? raw.top)
  const h = Number(raw.h ?? raw.height ?? (Number(raw.bottom) - y))
  if (![y, h].every(Number.isFinite) || h <= 0) {
    return undefined
  }
  return { y, h }
}

const normalizePoint = (value: unknown): { x: number; y: number } | undefined => {
  if (!value || typeof value !== 'object') {
    return undefined
  }
  const raw = value as Record<string, unknown>
  const x = Number(raw.x)
  const y = Number(raw.y)
  if (![x, y].every(Number.isFinite)) {
    return undefined
  }
  return { x, y }
}

const normalizeMessageType = (value: unknown): WeChatMessageType => {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'image' || normalized === 'sticker') {
    return normalized
  }
  return 'text'
}

const normalizeBounds = (value: unknown): WeChatMessageBounds | undefined => {
  if (!value || typeof value !== 'object') {
    return undefined
  }
  const raw = value as Record<string, unknown>
  const x = Number(raw.x)
  const y = Number(raw.y)
  const w = Number(raw.w ?? raw.width)
  const h = Number(raw.h ?? raw.height)
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) {
    return undefined
  }
  return { x, y, w, h }
}

const normalizeConversationType = (value: unknown): WeChatConversationType => {
  const normalized = String(value || '').trim().toUpperCase()
  if (normalized === 'GROUP' || normalized === 'SYSTEM') {
    return normalized
  }
  return 'SINGLE'
}

const normalizeAccountCategory = (value: unknown): WeChatAccountCategory => {
  const normalized = String(value || '').trim().toUpperCase()
  switch (normalized) {
    case 'NORMAL':
    case 'FILE_HELPER':
    case 'TENCENT_NEWS':
    case 'OFFICIAL_ACCOUNT':
    case 'SERVICE_ACCOUNT':
    case 'CUSTOMER_SERVICE':
      return normalized
    default:
      return 'UNKNOWN'
  }
}
