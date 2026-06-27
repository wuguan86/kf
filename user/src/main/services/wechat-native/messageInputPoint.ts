import type { MarketingMomentPoint, WindowBounds } from './types'

const DEFAULT_INPUT_BOTTOM_OFFSET_PX = 72
const DEFAULT_SEND_RIGHT_OFFSET_PX = 54
const DEFAULT_SEND_BOTTOM_OFFSET_PX = 32
const INPUT_TOP_PADDING_PX = 28
const INPUT_BOTTOM_PADDING_PX = 46
const INPUT_MIN_X_RATIO = 0.48
const INPUT_MAX_X_RATIO = 0.78
const INPUT_X_RATIO = 0.66

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value))

const getScaleFactor = (bounds: WindowBounds): number => bounds.scaleFactor || 1

const resolveDynamicInputY = (bounds: WindowBounds, scaleFactor: number): number | null => {
  const inputTopY = bounds.messageInputTopY
  if (!Number.isFinite(inputTopY) || !inputTopY || inputTopY <= 0) {
    return null
  }

  const inputTopScreenY = bounds.y + Math.round(inputTopY / scaleFactor)
  const minY = inputTopScreenY + Math.round(INPUT_TOP_PADDING_PX * scaleFactor)
  const maxY = bounds.y + bounds.height - Math.round(INPUT_BOTTOM_PADDING_PX * scaleFactor)
  if (minY >= maxY) {
    return null
  }
  return clamp(minY, bounds.y + Math.round(bounds.height * 0.68), maxY)
}

export const getMessageInputClickPoint = (bounds: WindowBounds): MarketingMomentPoint => {
  const scaleFactor = getScaleFactor(bounds)
  const minX = bounds.x + Math.round(bounds.width * INPUT_MIN_X_RATIO)
  const maxX = bounds.x + Math.round(bounds.width * INPUT_MAX_X_RATIO)
  const x = clamp(Math.round(bounds.x + bounds.width * INPUT_X_RATIO), minX, maxX)
  const dynamicY = resolveDynamicInputY(bounds, scaleFactor)
  const y = dynamicY ?? Math.round(bounds.y + bounds.height - Math.round(DEFAULT_INPUT_BOTTOM_OFFSET_PX * scaleFactor))
  return { x, y }
}

export const getMessageSendButtonPoint = (bounds: WindowBounds): MarketingMomentPoint => {
  const scaleFactor = getScaleFactor(bounds)
  return {
    x: Math.round(bounds.x + bounds.width - Math.round(DEFAULT_SEND_RIGHT_OFFSET_PX * scaleFactor)),
    y: Math.round(bounds.y + bounds.height - Math.round(DEFAULT_SEND_BOTTOM_OFFSET_PX * scaleFactor))
  }
}
