import { nativeImage } from 'electron'
import type { SnapshotRegion } from './snapshotDiff'
import type { WeChatScreenshot } from './types'

const FALLBACK_LEFT_RATIO = 0.38
const FALLBACK_TOP_RATIO = 0.1
const FALLBACK_BOTTOM_RATIO = 0.82
const MIN_REGION_WIDTH_RATIO = 0.35
const MIN_REGION_HEIGHT_RATIO = 0.3
const CHAT_TOP_RATIO = 0.1
const SPLITTER_SCAN_LEFT_RATIO = 0.22
const SPLITTER_SCAN_RIGHT_RATIO = 0.62
const SPLITTER_SCAN_TOP_RATIO = 0.08
const SPLITTER_SCAN_BOTTOM_RATIO = 0.9
const INPUT_SCAN_TOP_RATIO = 0.55
const INPUT_SCAN_BOTTOM_RATIO = 0.92
const INPUT_BOTTOM_PADDING_PX = 8
const MIN_SPLITTER_SCORE = 22
const MIN_INPUT_TOP_SCORE = 18
const SAMPLE_STEP = 8

export type ChatRegionDetection = {
  region: SnapshotRegion
  source: 'dynamic' | 'fallback'
  confidence: number
  reason: string
}

const clampNumber = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value))

export const buildFallbackCurrentChatRegion = (screenshot: Pick<WeChatScreenshot, 'width' | 'height'>): SnapshotRegion => {
  const left = Math.floor(screenshot.width * FALLBACK_LEFT_RATIO)
  const top = Math.floor(screenshot.height * FALLBACK_TOP_RATIO)
  const bottom = Math.floor(screenshot.height * FALLBACK_BOTTOM_RATIO)
  return {
    x: left,
    y: top,
    width: Math.max(1, screenshot.width - left),
    height: Math.max(1, bottom - top)
  }
}

export const detectCurrentChatSnapshotRegion = (screenshot: WeChatScreenshot): ChatRegionDetection => {
  const fallback = buildFallbackCurrentChatRegion(screenshot)
  const image = nativeImage.createFromBuffer(screenshot.png)
  if (image.isEmpty()) {
    return { region: fallback, source: 'fallback', confidence: 0, reason: 'empty_screenshot' }
  }

  const size = image.getSize()
  if (size.width <= 0 || size.height <= 0 || typeof image.toBitmap !== 'function') {
    return { region: fallback, source: 'fallback', confidence: 0, reason: 'invalid_screenshot_size' }
  }

  const bitmap = image.toBitmap()
  if (!bitmap || bitmap.length < size.width * size.height * 4) {
    return { region: fallback, source: 'fallback', confidence: 0, reason: 'invalid_bitmap' }
  }

  const splitter = detectVerticalSplitter(bitmap, size.width, size.height)
  if (!splitter) {
    return { region: fallback, source: 'fallback', confidence: 0, reason: 'splitter_not_found' }
  }

  const inputTop = detectInputTop(bitmap, size.width, size.height, splitter.x)
  if (!inputTop) {
    return { region: fallback, source: 'fallback', confidence: splitter.confidence, reason: 'input_top_not_found' }
  }

  const top = Math.floor(size.height * CHAT_TOP_RATIO)
  // 输入框光标和草稿内容不属于消息区；底边必须停在输入框顶部上方，避免空闲时误触发视觉请求。
  const bottom = clampNumber(inputTop.y - Math.round(INPUT_BOTTOM_PADDING_PX * (screenshot.scaleFactor || 1)), top + 1, size.height)
  const left = clampNumber(splitter.x + 2, 0, size.width - 1)
  const region: SnapshotRegion = {
    x: left,
    y: top,
    width: Math.max(1, size.width - left),
    height: Math.max(1, bottom - top)
  }

  if (!isPlausibleChatRegion(region, size.width, size.height)) {
    return {
      region: fallback,
      source: 'fallback',
      confidence: Math.min(splitter.confidence, inputTop.confidence),
      reason: 'dynamic_region_not_plausible'
    }
  }

  return {
    region,
    source: 'dynamic',
    confidence: Math.min(splitter.confidence, inputTop.confidence),
    reason: 'dynamic_region_detected'
  }
}

const detectVerticalSplitter = (
  bitmap: Buffer,
  width: number,
  height: number
): { x: number; confidence: number } | null => {
  const minX = Math.max(1, Math.floor(width * SPLITTER_SCAN_LEFT_RATIO))
  const maxX = Math.min(width - 2, Math.floor(width * SPLITTER_SCAN_RIGHT_RATIO))
  const minY = Math.max(0, Math.floor(height * SPLITTER_SCAN_TOP_RATIO))
  const maxY = Math.min(height - 1, Math.floor(height * SPLITTER_SCAN_BOTTOM_RATIO))
  let bestX = 0
  let bestScore = 0

  for (let x = minX; x <= maxX; x += 1) {
    let score = 0
    let samples = 0
    for (let y = minY; y <= maxY; y += SAMPLE_STEP) {
      const current = getLuma(bitmap, width, x, y)
      const left = getLuma(bitmap, width, x - 2, y)
      const right = getLuma(bitmap, width, x + 2, y)
      score += Math.abs(current - left) + Math.abs(current - right) + Math.abs(left - right)
      samples += 1
    }
    const averageScore = samples > 0 ? score / samples : 0
    if (averageScore > bestScore) {
      bestScore = averageScore
      bestX = x
    }
  }

  if (bestScore < MIN_SPLITTER_SCORE) {
    return null
  }
  return { x: bestX, confidence: clampNumber(bestScore / 80, 0.1, 1) }
}

const detectInputTop = (
  bitmap: Buffer,
  width: number,
  height: number,
  chatLeft: number
): { y: number; confidence: number } | null => {
  const minY = Math.max(1, Math.floor(height * INPUT_SCAN_TOP_RATIO))
  const maxY = Math.min(height - 2, Math.floor(height * INPUT_SCAN_BOTTOM_RATIO))
  const minX = clampNumber(chatLeft + Math.round(width * 0.04), 1, width - 2)
  const maxX = Math.min(width - 2, Math.max(minX, width - Math.round(width * 0.04)))
  let bestY = 0
  let bestScore = 0

  for (let y = minY; y <= maxY; y += 1) {
    let score = 0
    let samples = 0
    for (let x = minX; x <= maxX; x += SAMPLE_STEP) {
      const current = getLuma(bitmap, width, x, y)
      const above = getLuma(bitmap, width, x, y - 2)
      const below = getLuma(bitmap, width, x, y + 2)
      score += Math.abs(current - above) + Math.abs(current - below) + Math.abs(above - below)
      samples += 1
    }
    const averageScore = samples > 0 ? score / samples : 0
    if (averageScore > bestScore) {
      bestScore = averageScore
      bestY = y
    }
  }

  if (bestScore < MIN_INPUT_TOP_SCORE) {
    return null
  }
  return { y: bestY, confidence: clampNumber(bestScore / 70, 0.1, 1) }
}

const isPlausibleChatRegion = (region: SnapshotRegion, width: number, height: number): boolean => {
  if (region.width < width * MIN_REGION_WIDTH_RATIO) {
    return false
  }
  if (region.height < height * MIN_REGION_HEIGHT_RATIO) {
    return false
  }
  if (region.x < width * 0.18 || region.x > width * 0.68) {
    return false
  }
  return true
}

const getLuma = (bitmap: Buffer, width: number, x: number, y: number): number => {
  const index = (y * width + x) * 4
  const first = bitmap[index]
  const second = bitmap[index + 1]
  const third = bitmap[index + 2]
  return (first + second + third) / 3
}
