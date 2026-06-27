import type { MarketingMomentPoint, WindowBounds } from './types'

export const toPhysicalScreenPoint = (bounds: WindowBounds, point: MarketingMomentPoint): MarketingMomentPoint => {
  const scaleFactor = bounds.scaleFactor || 1
  if (scaleFactor === 1) {
    return {
      x: Math.round(point.x),
      y: Math.round(point.y)
    }
  }
  // 截图裁剪坐标与窗口 bounds 保持一致，但 Win32 SetCursorPos 使用物理屏幕坐标；
  // Windows 125% 缩放下必须以窗口左上角为锚点转换，避免点到聊天气泡区域。
  return {
    x: Math.round(bounds.x + (point.x - bounds.x) * scaleFactor),
    y: Math.round(bounds.y + (point.y - bounds.y) * scaleFactor)
  }
}
