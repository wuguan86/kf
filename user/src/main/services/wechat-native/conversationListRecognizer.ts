import { nativeImage } from 'electron'
import { recognizeConversationListItemWithVision } from './visionClient'
import type {
  ConversationListItemRecognition,
  UnreadConversationCandidate,
  WeChatChannel,
  WeChatScreenshot,
  WeChatVisionRuntimeConfig,
  WindowBounds
} from './types'

const PERSONAL_LIST_LEFT_RATIO = 0.02
const ENTERPRISE_LIST_LEFT_RATIO = 0.02
const LIST_RIGHT_RATIO = 0.39
const ROW_HORIZONTAL_PADDING = 8
const ROW_VERTICAL_PADDING = 10
const MIN_ROW_HEIGHT = 56
const MAX_ROW_HEIGHT = 96

export const recognizeUnreadConversationCandidate = async (
  screenshot: WeChatScreenshot,
  window: WindowBounds,
  candidate: UnreadConversationCandidate,
  channel: WeChatChannel,
  config: WeChatVisionRuntimeConfig
): Promise<ConversationListItemRecognition | null> => {
  const rowScreenshot = cropConversationRowScreenshot(screenshot, window, candidate, channel)
  if (!rowScreenshot) {
    return null
  }
  return recognizeConversationListItemWithVision(rowScreenshot.dataUrl, window, config)
}

const cropConversationRowScreenshot = (
  screenshot: WeChatScreenshot,
  window: WindowBounds,
  candidate: UnreadConversationCandidate,
  channel: WeChatChannel
): WeChatScreenshot | null => {
  const image = nativeImage.createFromBuffer(screenshot.png)
  if (image.isEmpty()) {
    return null
  }
  const size = image.getSize()
  if (size.width <= 0 || size.height <= 0) {
    return null
  }

  const scaleX = size.width / Math.max(1, window.width)
  const scaleY = size.height / Math.max(1, window.height)
  const listLeftRatio = channel === 'enterprise' ? ENTERPRISE_LIST_LEFT_RATIO : PERSONAL_LIST_LEFT_RATIO
  const rowHeight = Math.max(MIN_ROW_HEIGHT, Math.min(MAX_ROW_HEIGHT, Math.round(candidate.height / Math.max(scaleY, 0.0001) * 3.8)))
  const rowCenterY = Math.round((candidate.centerY - window.y) * scaleY)
  const cropTop = Math.max(0, rowCenterY - Math.round(rowHeight / 2))
  const cropHeight = Math.min(size.height - cropTop, rowHeight + ROW_VERTICAL_PADDING * 2)
  const cropLeft = Math.max(0, Math.floor(size.width * listLeftRatio) - ROW_HORIZONTAL_PADDING)
  const cropRight = Math.min(size.width, Math.floor(size.width * LIST_RIGHT_RATIO) + ROW_HORIZONTAL_PADDING)
  const cropWidth = Math.max(1, cropRight - cropLeft)
  if (cropHeight <= 0) {
    return null
  }

  const cropped = image.crop({
    x: cropLeft,
    y: cropTop,
    width: cropWidth,
    height: cropHeight
  })
  return {
    dataUrl: cropped.toDataURL(),
    png: cropped.toPNG(),
    width: cropped.getSize().width,
    height: cropped.getSize().height
  }
}
