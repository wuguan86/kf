export type ManagedMode = 'full' | 'semi'

export type NativeDriverMessage = {
  id: string
  contact: string
  content: string
  timestamp: number
  type: 'text'
  is_self: boolean
  trigger_reply: boolean
  ui_id?: string
}

export type NativeDriverResult = Record<string, any>

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
}
