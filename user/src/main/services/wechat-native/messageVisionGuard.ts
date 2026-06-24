import type { ParsedWeChatMessage } from './types'

export type MessageVisionGuardContext = {
  bitmap?: Buffer
  imageWidth: number
  imageHeight: number
}

export type MessageVisionGuardResult = {
  message: ParsedWeChatMessage | null
  correctedIsSelf: boolean
  skipReason: string
}

const MIN_CUSTOMER_IMAGE_BOUNDS_WIDTH_PX = 72
const MIN_CUSTOMER_IMAGE_BOUNDS_HEIGHT_PX = 72
const SELF_GREEN_RATIO_THRESHOLD = 0.12
const SELF_SIDE_LEFT_RATIO_THRESHOLD = 0.5
const SELF_SIDE_CENTER_RATIO_THRESHOLD = 0.62
const BLANK_IMAGE_CONTENT_RATIO_THRESHOLD = 0.015
const BLANK_IMAGE_LIGHT_RATIO_THRESHOLD = 0.95
const SAMPLE_STEP_PX = 3

export const applyMessageVisionGuard = (
  message: ParsedWeChatMessage,
  context: MessageVisionGuardContext | null
): MessageVisionGuardResult => {
  const correctedMessage = { ...message }
  if (context && correctedMessage.bounds && isLikelySelfOwnedBubble(correctedMessage, context)) {
    correctedMessage.isSelf = true
  }
  if (!correctedMessage.isSelf && correctedMessage.type === 'image') {
    if (!isPlausibleCustomerImageMessage(correctedMessage, context)) {
      return {
        message: null,
        correctedIsSelf: correctedMessage.isSelf !== message.isSelf,
        skipReason: '疑似头像或空白区域被模型误识别为图片消息'
      }
    }
  }
  return {
    message: correctedMessage,
    correctedIsSelf: correctedMessage.isSelf !== message.isSelf,
    skipReason: ''
  }
}

const isLikelySelfOwnedBubble = (
  message: ParsedWeChatMessage,
  context: MessageVisionGuardContext
): boolean => {
  const bounds = message.bounds
  if (!bounds || !context.bitmap) {
    return false
  }
  const centerX = bounds.x + bounds.w / 2
  if (centerX < context.imageWidth * 0.5) {
    return false
  }
  const stats = collectPixelStats(context, bounds)
  if (stats.total > 0 && stats.selfGreenRatio >= SELF_GREEN_RATIO_THRESHOLD) {
    return true
  }
  if (message.type === 'text') {
    return false
  }
  return bounds.x >= context.imageWidth * SELF_SIDE_LEFT_RATIO_THRESHOLD ||
    centerX >= context.imageWidth * SELF_SIDE_CENTER_RATIO_THRESHOLD
}

const isPlausibleCustomerImageMessage = (
  message: ParsedWeChatMessage,
  context: MessageVisionGuardContext | null
): boolean => {
  const bounds = message.bounds
  if (!bounds) {
    return false
  }
  if (bounds.w < MIN_CUSTOMER_IMAGE_BOUNDS_WIDTH_PX || bounds.h < MIN_CUSTOMER_IMAGE_BOUNDS_HEIGHT_PX) {
    return false
  }
  if (!context?.bitmap) {
    return true
  }
  const stats = collectPixelStats(context, bounds)
  if (stats.total <= 0) {
    return false
  }
  return !(stats.contentRatio < BLANK_IMAGE_CONTENT_RATIO_THRESHOLD && stats.lightRatio >= BLANK_IMAGE_LIGHT_RATIO_THRESHOLD)
}

const collectPixelStats = (
  context: MessageVisionGuardContext,
  bounds: NonNullable<ParsedWeChatMessage['bounds']>
): { total: number; selfGreenRatio: number; contentRatio: number; lightRatio: number } => {
  const left = Math.max(0, Math.floor(bounds.x))
  const top = Math.max(0, Math.floor(bounds.y))
  const right = Math.min(context.imageWidth, Math.ceil(bounds.x + bounds.w))
  const bottom = Math.min(context.imageHeight, Math.ceil(bounds.y + bounds.h))
  let total = 0
  let selfGreenCount = 0
  let contentCount = 0
  let lightCount = 0
  for (let y = top; y < bottom; y += SAMPLE_STEP_PX) {
    for (let x = left; x < right; x += SAMPLE_STEP_PX) {
      const index = (y * context.imageWidth + x) * 4
      const blue = context.bitmap?.[index] ?? 0
      const green = context.bitmap?.[index + 1] ?? 0
      const red = context.bitmap?.[index + 2] ?? 0
      total += 1
      if (isLikelySelfGreenPixel(red, green, blue)) {
        selfGreenCount += 1
      }
      if (isLightWechatBackgroundPixel(red, green, blue)) {
        lightCount += 1
      } else {
        contentCount += 1
      }
    }
  }
  return {
    total,
    selfGreenRatio: total > 0 ? selfGreenCount / total : 0,
    contentRatio: total > 0 ? contentCount / total : 0,
    lightRatio: total > 0 ? lightCount / total : 0
  }
}

const isLikelySelfGreenPixel = (red: number, green: number, blue: number): boolean => {
  return green >= 180 &&
    red >= 90 &&
    red <= 190 &&
    blue >= 50 &&
    blue <= 170 &&
    green - red >= 35 &&
    green - blue >= 55
}

const isLightWechatBackgroundPixel = (red: number, green: number, blue: number): boolean => {
  const maxChannel = Math.max(red, green, blue)
  const minChannel = Math.min(red, green, blue)
  return red >= 225 && green >= 225 && blue >= 225 && maxChannel - minChannel <= 28
}
