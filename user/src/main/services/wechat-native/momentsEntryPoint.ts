import type { MarketingMomentPoint, WindowBounds } from './types'

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value))

/**
 * 获取朋友圈入口点击坐标（相对于窗口左上角）
 * @param bounds 微信主窗口 bounds
 * @param scaleFactor DPI 缩放因子，用于动态调整固定像素阈值
 */
export const getMomentsEntryPoint = (bounds: WindowBounds, scaleFactor = 1): MarketingMomentPoint => {
  const sf = scaleFactor || 1
  // 朋友圈入口是微信左侧固定导航栏按钮，营销动作只在空闲时点击该入口，后续仍由视觉候选二次校验。
  const x = clamp(Math.round(bounds.width * 0.034), Math.round(24 * sf), Math.round(34 * sf))
  const y = clamp(Math.round(bounds.height * 0.335), Math.round(218 * sf), Math.round(292 * sf))
  return { x, y }
}
