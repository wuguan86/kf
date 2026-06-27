import { desktopCapturer, screen } from 'electron'
import type { WeChatScreenshot, WindowBounds } from './types'

export const captureWeChatWindow = async (bounds: WindowBounds): Promise<WeChatScreenshot> => {
  const matchedDisplay = screen.getDisplayMatching?.({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height
  }) || screen.getPrimaryDisplay()
  const scaleFactor = matchedDisplay.scaleFactor || 1
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
    x: Math.max(0, Math.round(bounds.x * scaleFactor)),
    y: Math.max(0, Math.round(bounds.y * scaleFactor)),
    width: Math.max(1, Math.round(bounds.width * scaleFactor)),
    height: Math.max(1, Math.round(bounds.height * scaleFactor))
  }
  const image = source.thumbnail.crop(cropRect)
  return {
    dataUrl: image.toDataURL(),
    png: image.toPNG(),
    width: image.getSize().width,
    height: image.getSize().height,
    scaleFactor
  }
}
