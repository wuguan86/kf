import type {
  ConversationListItemRecognition,
  ParsedWeChatMessage,
  ParsedWeChatSnapshot,
  WeChatAccountCategory,
  WeChatConversationType,
  WeChatVisionRuntimeConfig,
  WindowBounds
} from './types'

type VisionMessage = {
  content?: unknown
  isSelf?: unknown
  uiId?: unknown
  type?: unknown
  confidence?: unknown
}

type VisionResponse = {
  contact?: unknown
  messages?: VisionMessage[]
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

const requestVisionRecognition = async (
  imageDataUrl: string,
  window: WindowBounds,
  previousDigest: string,
  config: WeChatVisionRuntimeConfig,
  sceneHint: 'CHAT' | 'CONVERSATION_LIST'
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
    messages: messages
      .map((message, index): ParsedWeChatMessage | null => {
        const content = String(message?.content || '').trim()
        if (!content) {
          return null
        }
        const uiId = String(message?.uiId || `vlm-${index}`).trim()
        return {
          content,
          isSelf: message?.isSelf === true,
          uiId
        }
      })
      .filter((message): message is ParsedWeChatMessage => !!message)
  }
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
      return normalized
    default:
      return 'UNKNOWN'
  }
}
