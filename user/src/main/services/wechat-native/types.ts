export type ManagedMode = 'full' | 'semi'
export type WeChatChannel = 'personal' | 'enterprise'
export type WeChatConversationType = 'SINGLE' | 'GROUP' | 'SYSTEM'
export type WeChatAccountCategory = 'NORMAL' | 'FILE_HELPER' | 'TENCENT_NEWS' | 'OFFICIAL_ACCOUNT' | 'SERVICE_ACCOUNT' | 'UNKNOWN'
export type WeChatMessageType = 'text' | 'image' | 'sticker'

export type WeChatMessageBounds = {
  x: number
  y: number
  w: number
  h: number
}

export type NativeDriverMessage = {
  id: string
  contact: string
  content: string
  timestamp: number
  type: WeChatMessageType
  is_self: boolean
  trigger_reply: boolean
  ui_id?: string
  bounds?: WeChatMessageBounds
  source?: WeChatChannel
  conversation_type?: WeChatConversationType
  account_category?: WeChatAccountCategory
  skip_auto_reply?: boolean
  skip_reason?: string
}

export type NativeDriverResult = Record<string, any>

export type UnreadConversationCandidate = {
  id: string
  x: number
  y: number
  width: number
  height: number
  centerX: number
  centerY: number
  score: number
}

export type ParsedWeChatMessage = {
  content: string
  isSelf: boolean
  uiId: string
  type: WeChatMessageType
  bounds?: WeChatMessageBounds
}

export type ParsedWeChatSnapshot = {
  contact: string
  messages: ParsedWeChatMessage[]
  snapshotDigest?: string
  changed?: boolean
  conversationType?: WeChatConversationType
  accountCategory?: WeChatAccountCategory
  skipAutoReply?: boolean
  skipReason?: string
  confidence?: number | null
}

export type WindowBounds = {
  hwnd: number
  title: string
  className: string
  processName?: string
  x: number
  y: number
  width: number
  height: number
}

export type WeChatScreenshot = {
  dataUrl: string
  png: Buffer
  width: number
  height: number
}

export type WeChatVisionRuntimeConfig = {
  backendBaseUrl: string
  token: string
  tenantId: string
  channel: WeChatChannel
}

export type ConversationListItemRecognition = {
  contact: string
  conversationType: WeChatConversationType
  accountCategory: WeChatAccountCategory
  skipAutoReply: boolean
  skipReason: string
  confidence?: number | null
}
