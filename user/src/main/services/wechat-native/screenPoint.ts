import type { MarketingMomentPoint, WindowBounds } from './types'

export const toPhysicalScreenPoint = (bounds: WindowBounds, point: MarketingMomentPoint): MarketingMomentPoint => {
  const scaleFactor = bounds.scaleFactor || 1
  return {
    x: Math.round(point.x * scaleFactor),
    y: Math.round(point.y * scaleFactor)
  }
}
