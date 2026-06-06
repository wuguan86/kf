import type { MarketingMomentPoint, WindowBounds } from './types'

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value))

export const getMomentsEntryPoint = (bounds: WindowBounds): MarketingMomentPoint => {
  // 朋友圈入口是微信左侧固定导航栏按钮，营销动作只在空闲时点击该入口，后续仍由视觉候选二次校验。
  const x = clamp(Math.round(bounds.width * 0.034), 24, 34)
  const y = clamp(Math.round(bounds.height * 0.335), 218, 292)
  return { x, y }
}
