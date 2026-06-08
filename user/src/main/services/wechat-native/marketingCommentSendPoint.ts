import type { WindowBounds } from './types'

export type MarketingCommentSendPoint = {
  x: number
  y: number
}

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max)
}

export const getMarketingCommentSendPoint = (bounds: WindowBounds): MarketingCommentSendPoint => {
  // 朋友圈评论框发送按钮固定在独立朋友圈窗口右下角，先用本地窗口尺寸约束点位，避免模型输出直接驱动点击。
  const minLocalX = Math.round(bounds.width * 0.78)
  const maxLocalX = Math.max(minLocalX, bounds.width - 40)
  const minLocalY = Math.round(bounds.height * 0.9)
  const maxLocalY = Math.max(minLocalY, bounds.height - 20)
  const localX = clamp(Math.round(bounds.width - 78), minLocalX, maxLocalX)
  const localY = clamp(Math.round(bounds.height - 38), minLocalY, maxLocalY)

  return {
    x: Math.round(bounds.x + localX),
    y: Math.round(bounds.y + localY)
  }
}
