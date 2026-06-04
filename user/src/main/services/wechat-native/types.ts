export type ManagedMode = 'full' | 'semi'
export type WeChatChannel = 'personal' | 'enterprise'
export type WeChatConversationType = 'SINGLE' | 'GROUP' | 'SYSTEM'
export type WeChatAccountCategory = 'NORMAL' | 'FILE_HELPER' | 'TENCENT_NEWS' | 'OFFICIAL_ACCOUNT' | 'SERVICE_ACCOUNT' | 'UNKNOWN'

export type NativeDriverMessage = {
  id: string
  contact: string
  content: string
  timestamp: number
  type: 'text'
  is_self: boolean
  trigger_reply: boolean
  ui_id?: string
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
