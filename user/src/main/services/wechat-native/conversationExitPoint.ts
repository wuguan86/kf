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

/**
 * 获取会话列表点击坐标（绝对屏幕坐标），用于特殊会话误打开后返回会话列表
 * @param bounds 微信主窗口 bounds
 * @param scaleFactor DPI 缩放因子，用于动态调整固定像素阈值
 */
export const getConversationListExitPoint = (bounds: WindowBounds, scaleFactor = 1): ConversationListExitPoint => {
  const sf = scaleFactor || 1
  const sidebarWidth = clamp(Math.round(bounds.width * 0.067), Math.round(52 * sf), Math.round(72 * sf))
  const listWidth = clamp(Math.round(bounds.width * 0.267), Math.round(220 * sf), Math.round(280 * sf))
  const listCenterX = bounds.x + sidebarWidth + Math.round(listWidth * 0.475)
  const listX = clamp(listCenterX, bounds.x + Math.round(MIN_LIST_CLICK_X * sf), bounds.x + Math.round(MAX_LIST_CLICK_X * sf))
  const listY = bounds.y + Math.round(DEFAULT_TITLEBAR_HEIGHT * sf) + Math.round(DEFAULT_SEARCH_AREA_HEIGHT * sf) + Math.round(DEFAULT_CONVERSATION_ROW_HALF_HEIGHT * sf)

  // 特殊会话误打开后只允许点击左侧会话列表里的普通会话区域，避免落到微信窗口右上角关闭按钮。
  return {
    x: Math.round(listX),
    y: Math.round(listY)
  }
}

/**
 * 获取内层会话返回按钮坐标（绝对屏幕坐标），用于服务号和客服消息返回
 * @param bounds 微信主窗口 bounds
 * @param scaleFactor DPI 缩放因子，用于动态调整固定像素阈值
 */
export const getNestedConversationBackPoint = (bounds: WindowBounds, scaleFactor = 1): ConversationListExitPoint => {
  const sf = scaleFactor || 1
  // 服务号和客服消息是微信内层列表，需要点击左上角返回按钮，而不是按 ESC。
  return {
    x: Math.round(bounds.x + Math.round(80 * sf)),
    y: Math.round(bounds.y + Math.round(98 * sf))
  }
}
