import { nativeImage } from 'electron'
import type { SnapshotRegion } from './snapshotDiff'
import type { WeChatScreenshot } from './types'

const FALLBACK_LEFT_RATIO = 0.38
const FALLBACK_TOP_RATIO = 0.1
const FALLBACK_BOTTOM_RATIO = 0.82
const MIN_REGION_WIDTH_RATIO = 0.35
const MIN_REGION_HEIGHT_RATIO = 0.3
const CHAT_TOP_RATIO = 0.09
const SPLITTER_SCAN_LEFT_RATIO = 0.22
const SPLITTER_SCAN_RIGHT_RATIO = 0.62
const SPLITTER_SCAN_TOP_RATIO = 0.08
const SPLITTER_SCAN_BOTTOM_RATIO = 0.9
const INPUT_SCAN_TOP_RATIO = 0.48
const INPUT_SCAN_BOTTOM_RATIO = 0.96
const INPUT_BOTTOM_PADDING_PX = 8
const MIN_SPLITTER_SCORE = 22
const MIN_INPUT_TOP_SCORE = 18
const INPUT_TOP_STRONG_EDGE_SCORE = 10
const INPUT_TOP_MIN_COVERAGE = 0.5
const SAMPLE_STEP = 8
const LIGHT_ROW_LUMA = 243
const LIGHT_ROW_SPREAD = 18
const MIN_LIGHT_RUN_ROWS = 14
const CONTENT_EDGE_MIN_LUMA = 160
const CONTENT_EDGE_MIN_COVERAGE = 0.45

export type ChatRegionDetection = {
  region: SnapshotRegion
  source: 'dynamic' | 'fallback'
  confidence: number
  reason: string
  splitterX?: number
  inputTopY?: number
  rightEdgeX?: number
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
    return { region: fallback, source: 'fallback', confidence: splitter.confidence, reason: 'input_top_not_found', splitterX: splitter.x }
  }

  const top = Math.floor(size.height * CHAT_TOP_RATIO)
  // 输入框光标和草稿内容不属于消息区，底边必须停在输入框顶部上方，避免空闲时误触发视觉请求。
  const bottom = clampNumber(
    inputTop.y - Math.round(INPUT_BOTTOM_PADDING_PX * (screenshot.scaleFactor || 1)),
    top + 1,
    size.height
  )
  const left = clampNumber(splitter.x + 2, 0, size.width - 1)
  const right = clampNumber(detectChatRightEdge(bitmap, size.width, size.height, left, top, bottom), left + 1, size.width)
  const region: SnapshotRegion = {
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top)
  }

  if (!isPlausibleChatRegion(region, size.width, size.height)) {
    return {
      region: fallback,
      source: 'fallback',
      confidence: Math.min(splitter.confidence, inputTop.confidence),
      reason: 'dynamic_region_not_plausible',
      splitterX: splitter.x,
      inputTopY: inputTop.y,
      rightEdgeX: right
    }
  }

  return {
    region,
    source: 'dynamic',
    confidence: Math.min(splitter.confidence, inputTop.confidence),
    reason: 'dynamic_region_detected',
    splitterX: splitter.x,
    inputTopY: inputTop.y,
    rightEdgeX: right
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
  const minWhiteRun = Math.max(MIN_LIGHT_RUN_ROWS, Math.floor(height * 0.03))
  let whiteRunLength = 0

  for (let y = maxY; y >= minY; y -= 1) {
    if (isLightRow(bitmap, width, minX, maxX, y)) {
      whiteRunLength += 1
      continue
    }

    if (whiteRunLength >= minWhiteRun) {
      return {
        y,
        confidence: clampNumber(Math.min(1, whiteRunLength / Math.max(1, height * 0.25)), 0.1, 1)
      }
    }

    whiteRunLength = 0
  }

  let bestY = 0
  let bestScore = 0
  let bestCoverage = 0

  for (let y = maxY; y >= minY; y -= 1) {
    let score = 0
    let samples = 0
    let strongEdges = 0
    for (let x = minX; x <= maxX; x += SAMPLE_STEP) {
      const current = getLuma(bitmap, width, x, y)
      const above = getLuma(bitmap, width, x, y - 2)
      const below = getLuma(bitmap, width, x, y + 2)
      const edgeScore = Math.abs(current - above) + Math.abs(current - below) + Math.abs(above - below)
      score += edgeScore
      if (edgeScore >= INPUT_TOP_STRONG_EDGE_SCORE) {
        strongEdges += 1
      }
      samples += 1
    }
    const averageScore = samples > 0 ? score / samples : 0
    const coverage = samples > 0 ? strongEdges / samples : 0
    // 输入框顶部应是一条横向连续分割线；单个消息气泡边缘虽然局部很强，但横向覆盖不足，不能作为下边界。
    if (coverage < INPUT_TOP_MIN_COVERAGE) {
      continue
    }
    if (averageScore > bestScore || (averageScore >= bestScore * 0.9 && y > bestY)) {
      bestScore = averageScore
      bestY = y
      bestCoverage = coverage
    }
  }

  if (bestScore < MIN_INPUT_TOP_SCORE) {
    return null
  }
  return { y: bestY, confidence: clampNumber((bestScore / 70) * bestCoverage, 0.1, 1) }
}

const isLightRow = (bitmap: Buffer, width: number, startX: number, endX: number, y: number): boolean => {
  let lightCount = 0
  let sampleCount = 0

  for (let x = startX; x <= endX; x += 6) {
    const index = (y * width + x) * 4
    const first = bitmap[index]
    const second = bitmap[index + 1]
    const third = bitmap[index + 2]
    const luma = (first + second + third) / 3
    const spread = Math.max(first, second, third) - Math.min(first, second, third)
    if (luma >= LIGHT_ROW_LUMA && spread <= LIGHT_ROW_SPREAD) {
      lightCount += 1
    }
    sampleCount += 1
  }

  return sampleCount > 0 && lightCount / sampleCount >= 0.82
}

const isWechatContentColumn = (bitmap: Buffer, width: number, x: number, top: number, bottom: number): boolean => {
  let contentCount = 0
  let sampleCount = 0
  for (let y = top; y <= bottom; y += SAMPLE_STEP) {
    if (getLuma(bitmap, width, x, y) >= CONTENT_EDGE_MIN_LUMA) {
      contentCount += 1
    }
    sampleCount += 1
  }
  return sampleCount > 0 && contentCount / sampleCount >= CONTENT_EDGE_MIN_COVERAGE
}

const detectChatRightEdge = (bitmap: Buffer, width: number, height: number, left: number, top: number, bottom: number): number => {
  const minX = clampNumber(left + Math.round(width * 0.2), left + 1, width - 1)
  const maxY = Math.min(height - 1, bottom)
  for (let x = width - 1; x >= minX; x -= 1) {
    if (isWechatContentColumn(bitmap, width, x, top, maxY)) {
      return x + 1
    }
  }
  return width
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
