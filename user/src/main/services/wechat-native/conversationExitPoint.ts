import type { WindowBounds } from './types'

export type ConversationListExitPoint = {
  x: number
  y: number
}

const MIN_LIST_CLICK_X = 104
const MAX_LIST_CLICK_X = 280
const DEFAULT_TITLEBAR_HEIGHT = 32
const DEFAULT_SEARCH_AREA_HEIGHT = 50
const DEFAULT_CONVERSATION_ROW_HALF_HEIGHT = 34

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value))
}

export const getConversationListExitPoint = (bounds: WindowBounds): ConversationListExitPoint => {
  const sidebarWidth = clamp(Math.round(bounds.width * 0.067), 52, 72)
  const listWidth = clamp(Math.round(bounds.width * 0.267), 220, 280)
  const listCenterX = bounds.x + sidebarWidth + Math.round(listWidth * 0.475)
  const listX = clamp(listCenterX, bounds.x + MIN_LIST_CLICK_X, bounds.x + MAX_LIST_CLICK_X)
  const listY = bounds.y + DEFAULT_TITLEBAR_HEIGHT + DEFAULT_SEARCH_AREA_HEIGHT + DEFAULT_CONVERSATION_ROW_HALF_HEIGHT

  // 特殊会话误打开后只允许点击左侧会话列表里的普通会话区域，避免落到微信窗口右上角关闭按钮。
  return {
    x: Math.round(listX),
    y: Math.round(listY)
  }
}

export const getNestedConversationBackPoint = (bounds: WindowBounds): ConversationListExitPoint => {
  // 服务号和客服消息是微信内层列表，需要点击左上角返回按钮，而不是按 ESC。
  return {
    x: Math.round(bounds.x + 80),
    y: Math.round(bounds.y + 98)
  }
}
