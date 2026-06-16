import type { WindowBounds } from './types'

export type MarketingCommentSendPoint = {
  x: number
  y: number
}

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max)
}

/**
 * 获取朋友圈评论发送按钮点击坐标（绝对屏幕坐标）
 * @param bounds 朋友圈独立窗口 bounds
 * @param scaleFactor DPI 缩放因子，用于动态调整固定像素阈值
 */
export const getMarketingCommentSendPoint = (bounds: WindowBounds, scaleFactor = 1): MarketingCommentSendPoint => {
  const sf = scaleFactor || 1
  // 朋友圈评论框发送按钮固定在独立朋友圈窗口右下角，先用本地窗口尺寸约束点位，避免模型输出直接驱动点击。
  const minLocalX = Math.round(bounds.width * 0.78)
  const maxLocalX = Math.max(minLocalX, bounds.width - Math.round(40 * sf))
  const minLocalY = Math.round(bounds.height * 0.9)
  const maxLocalY = Math.max(minLocalY, bounds.height - Math.round(20 * sf))
  const localX = clamp(Math.round(bounds.width - 78 * sf), minLocalX, maxLocalX)
  const localY = clamp(Math.round(bounds.height - 38 * sf), minLocalY, maxLocalY)

  return {
    x: Math.round(bounds.x + localX),
    y: Math.round(bounds.y + localY)
  }
}
