import { desktopCapturer, screen } from 'electron'
import type { WeChatScreenshot, WindowBounds } from './types'

export const captureWeChatWindow = async (bounds: WindowBounds): Promise<WeChatScreenshot> => {
  const matchedDisplay = screen.getDisplayMatching?.({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height
  }) || screen.getPrimaryDisplay()
  const { width, height } = matchedDisplay.size
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width, height }
  })
  const source = sources[0]
  if (!source) {
    throw new Error('未获取到屏幕截图源')
  }

  const cropRect = {
    x: Math.max(0, Math.round(bounds.x)),
    y: Math.max(0, Math.round(bounds.y)),
    width: Math.max(1, Math.round(bounds.width)),
    height: Math.max(1, Math.round(bounds.height))
  }
  const image = source.thumbnail.crop(cropRect)
  const imageSize = image.getSize()
  // Electron 的 desktopCapturer 缩略图裁剪坐标与 Win32 窗口定位坐标保持一致；
  // 这里用实际裁剪结果反推比例，避免 Windows 125% 缩放下对起点重复乘 DPI。
  const scaleFactor = Math.max(
    0.0001,
    Math.min(
      imageSize.width / Math.max(1, bounds.width),
      imageSize.height / Math.max(1, bounds.height)
    )
  )
  return {
    dataUrl: image.toDataURL(),
    png: image.toPNG(),
    width: imageSize.width,
    height: imageSize.height,
    scaleFactor
  }
}

export const getWindowScreenScaleFactor = (bounds: WindowBounds): number => {
  const matchedDisplay = screen.getDisplayMatching?.({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height
  }) || screen.getPrimaryDisplay()
  return matchedDisplay.scaleFactor || 1
}
