import { nativeImage } from 'electron'
import type { UnreadConversationCandidate, WeChatChannel, WeChatScreenshot, WindowBounds } from './types'

type BitmapSize = {
  width: number
  height: number
}

type RedPixelCluster = {
  minX: number
  minY: number
  maxX: number
  maxY: number
  count: number
}

const PERSONAL_LIST_LEFT_RATIO = 0.055
const ENTERPRISE_LIST_LEFT_RATIO = 0.045
const LIST_RIGHT_RATIO = 0.38
const LIST_TOP_RATIO = 0.075
const LIST_BOTTOM_RATIO = 0.92
const PERSONAL_AVATAR_LEFT_RATIO = 0.085
const PERSONAL_BADGE_MIN_X_RATIO = 0.12
const PERSONAL_BADGE_MAX_X_RATIO = 0.18
const ENTERPRISE_BADGE_MIN_X_RATIO = 0.1
const ENTERPRISE_BADGE_MAX_X_RATIO = 0.22
const SELECTED_ROW_SCAN_LEFT_PADDING_PX = 88
const SELECTED_ROW_SCAN_RIGHT_PADDING_PX = 8
const SELECTED_ROW_SCAN_VERTICAL_PADDING_PX = 22
const SELECTED_ROW_MIN_GREEN_PIXELS = 80
const RED_PIXEL_MIN_COUNT = 8
const RED_CLUSTER_MAX_SIZE = 42
const RED_CLUSTER_MIN_SIZE = 4
const RED_BADGE_MAX_HEIGHT = 24
const RED_BADGE_MAX_AREA = 620
const PERSONAL_RED_BADGE_MIN_HEIGHT = 8
const PERSONAL_RED_BADGE_MAX_ASPECT_RATIO = 1.8
const PERSONAL_RED_BADGE_WEAK_ASPECT_RATIO = 2.2
const PERSONAL_RED_BADGE_MIN_LIGHT_PIXELS = 2

const isUnreadRedPixel = (red: number, green: number, blue: number): boolean => {
  return red >= 170 && green <= 105 && blue <= 105 && red - Math.max(green, blue) >= 70
}

const isSelectedConversationGreenPixel = (red: number, green: number, blue: number): boolean => {
  return green >= 155 &&
    red <= 80 &&
    blue <= 140 &&
    green - red >= 70 &&
    green - blue >= 35
}

const isUnreadBadgeLightPixel = (red: number, green: number, blue: number): boolean => {
  return red >= 220 && green >= 220 && blue >= 220 && Math.max(red, green, blue) - Math.min(red, green, blue) <= 35
}

const toBitmap = (screenshot: WeChatScreenshot): { bitmap: Buffer; size: BitmapSize } | null => {
  const image = nativeImage.createFromBuffer(screenshot.png)
  if (image.isEmpty()) {
    return null
  }
  const size = image.getSize()
  const bitmap = image.toBitmap()
  if (size.width <= 0 || size.height <= 0 || bitmap.length === 0) {
    return null
  }
  return { bitmap, size }
}

const pushOrMergeCluster = (clusters: RedPixelCluster[], x: number, y: number, mergeGap = 3): void => {
  const nearbyCluster = clusters.find((cluster) => {
    return x >= cluster.minX - mergeGap &&
      x <= cluster.maxX + mergeGap &&
      y >= cluster.minY - mergeGap &&
      y <= cluster.maxY + mergeGap
  })
  if (!nearbyCluster) {
    clusters.push({ minX: x, minY: y, maxX: x, maxY: y, count: 1 })
    return
  }
  nearbyCluster.minX = Math.min(nearbyCluster.minX, x)
  nearbyCluster.minY = Math.min(nearbyCluster.minY, y)
  nearbyCluster.maxX = Math.max(nearbyCluster.maxX, x)
  nearbyCluster.maxY = Math.max(nearbyCluster.maxY, y)
  nearbyCluster.count += 1
}

const isInsideSelectedConversationRow = (
  bitmap: Buffer,
  size: BitmapSize,
  cluster: RedPixelCluster,
  scaleFactor: number,
  scanMinX: number
): boolean => {
  const centerX = Math.round((cluster.minX + cluster.maxX) / 2)
  const centerY = Math.round((cluster.minY + cluster.maxY) / 2)
  const minX = Math.max(0, scanMinX, centerX - Math.round(SELECTED_ROW_SCAN_LEFT_PADDING_PX * scaleFactor))
  const maxX = Math.min(size.width - 1, centerX + Math.round(SELECTED_ROW_SCAN_RIGHT_PADDING_PX * scaleFactor))
  const minY = Math.max(0, centerY - Math.round(SELECTED_ROW_SCAN_VERTICAL_PADDING_PX * scaleFactor))
  const maxY = Math.min(size.height - 1, centerY + Math.round(SELECTED_ROW_SCAN_VERTICAL_PADDING_PX * scaleFactor))
  let greenPixels = 0
  const minGreenPixels = Math.round(SELECTED_ROW_MIN_GREEN_PIXELS * scaleFactor * scaleFactor)
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const index = (y * size.width + x) * 4
      const blue = bitmap[index]
      const green = bitmap[index + 1]
      const red = bitmap[index + 2]
      if (isSelectedConversationGreenPixel(red, green, blue)) {
        greenPixels += 1
        if (greenPixels >= minGreenPixels) {
          return true
        }
      }
    }
  }
  return false
}

const hasUnreadBadgeLightText = (
  bitmap: Buffer,
  size: BitmapSize,
  cluster: RedPixelCluster,
  scaleFactor: number
): boolean => {
  const inset = Math.max(1, Math.round(2 * scaleFactor))
  const minX = Math.max(0, cluster.minX + inset)
  const maxX = Math.min(size.width - 1, cluster.maxX - inset)
  const minY = Math.max(0, cluster.minY + inset)
  const maxY = Math.min(size.height - 1, cluster.maxY - inset)
  if (minX > maxX || minY > maxY) {
    return false
  }

  let lightPixels = 0
  const minLightPixels = Math.max(1, Math.round(PERSONAL_RED_BADGE_MIN_LIGHT_PIXELS * scaleFactor * scaleFactor))
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const index = (y * size.width + x) * 4
      const blue = bitmap[index]
      const green = bitmap[index + 1]
      const red = bitmap[index + 2]
      if (isUnreadBadgeLightPixel(red, green, blue)) {
        lightPixels += 1
        if (lightPixels >= minLightPixels) {
          return true
        }
      }
    }
  }
  return false
}

const isPersonalUnreadBadgeShape = (
  bitmap: Buffer,
  size: BitmapSize,
  cluster: RedPixelCluster,
  width: number,
  height: number,
  scaleFactor: number
): boolean => {
  // 个人微信未读数字红点应接近圆形；头像图标里的红色装饰常是扁条，不能继续送后端误判。
  const minBadgeHeight = Math.round(PERSONAL_RED_BADGE_MIN_HEIGHT * scaleFactor)
  const aspectRatio = width / Math.max(1, height)
  if (height < minBadgeHeight) {
    return hasUnreadBadgeLightText(bitmap, size, cluster, scaleFactor) && aspectRatio <= PERSONAL_RED_BADGE_WEAK_ASPECT_RATIO
  }
  return aspectRatio <= PERSONAL_RED_BADGE_MAX_ASPECT_RATIO
}

export const findUnreadConversationCandidates = (
  screenshot: WeChatScreenshot,
  window: WindowBounds,
  channel: WeChatChannel = 'personal'
): UnreadConversationCandidate[] => {
  const parsed = toBitmap(screenshot)
  if (!parsed) {
    return []
  }

  const { bitmap, size } = parsed
  // 截图实际像素与逻辑窗口坐标的缩放比，用于动态调整硬编码像素阈值
  const sf = screenshot.scaleFactor || 1
  const listLeftRatio = channel === 'enterprise' ? ENTERPRISE_LIST_LEFT_RATIO : PERSONAL_LIST_LEFT_RATIO
  const unreadBadgeMinXRatio = channel === 'enterprise' ? ENTERPRISE_BADGE_MIN_X_RATIO : PERSONAL_BADGE_MIN_X_RATIO
  const unreadBadgeMaxXRatio = channel === 'enterprise' ? ENTERPRISE_BADGE_MAX_X_RATIO : PERSONAL_BADGE_MAX_X_RATIO
  const minX = Math.max(0, Math.floor(size.width * listLeftRatio))
  const maxX = Math.min(size.width - 1, Math.floor(size.width * LIST_RIGHT_RATIO))
  const minBadgeCenterX = Math.max(minX, Math.floor(size.width * unreadBadgeMinXRatio))
  const maxBadgeCenterX = Math.min(maxX, Math.floor(size.width * unreadBadgeMaxXRatio))
  const avatarLeftX = Math.floor(size.width * PERSONAL_AVATAR_LEFT_RATIO)
  const minY = Math.max(0, Math.floor(size.height * LIST_TOP_RATIO))
  const maxY = Math.min(size.height - 1, Math.floor(size.height * LIST_BOTTOM_RATIO))
  const redPixelMinCount = Math.round(RED_PIXEL_MIN_COUNT * sf)
  const redClusterMaxSize = Math.round(RED_CLUSTER_MAX_SIZE * sf)
  const redClusterMinSize = Math.round(RED_CLUSTER_MIN_SIZE * sf)
  const redBadgeMaxHeight = Math.round(RED_BADGE_MAX_HEIGHT * sf)
  const redBadgeMaxArea = Math.round(RED_BADGE_MAX_AREA * sf * sf)
  const clusters: RedPixelCluster[] = []

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const index = (y * size.width + x) * 4
      const blue = bitmap[index]
      const green = bitmap[index + 1]
      const red = bitmap[index + 2]
      if (isUnreadRedPixel(red, green, blue)) {
        pushOrMergeCluster(clusters, x, y, Math.round(3 * sf))
      }
    }
  }

  const scaleX = window.width / size.width
  const scaleY = window.height / size.height
  return clusters
    .map((cluster, index): UnreadConversationCandidate | null => {
      const width = cluster.maxX - cluster.minX + 1
      const height = cluster.maxY - cluster.minY + 1
      const area = width * height
      if (
        cluster.count < redPixelMinCount ||
        width < redClusterMinSize ||
        height < redClusterMinSize ||
        width > redClusterMaxSize ||
        height > redClusterMaxSize ||
        height > redBadgeMaxHeight ||
        area > redBadgeMaxArea
      ) {
        return null
      }

      const relativeCenterX = cluster.minX + width / 2
      const relativeCenterY = cluster.minY + height / 2
      if (relativeCenterX < minBadgeCenterX || relativeCenterX > maxBadgeCenterX) {
        return null
      }
      if (channel === 'personal' && cluster.minX < avatarLeftX) {
        return null
      }
      if (channel === 'personal' && !isPersonalUnreadBadgeShape(bitmap, size, cluster, width, height, sf)) {
        return null
      }
      if (isInsideSelectedConversationRow(bitmap, size, cluster, sf, channel === 'personal' ? avatarLeftX : minX)) {
        return null
      }
      return {
        id: `unread-${index}-${Math.round(relativeCenterY)}`,
        x: Math.round(window.x + cluster.minX * scaleX),
        y: Math.round(window.y + cluster.minY * scaleY),
        width: Math.max(1, Math.round(width * scaleX)),
        height: Math.max(1, Math.round(height * scaleY)),
        centerX: Math.round(window.x + relativeCenterX * scaleX),
        centerY: Math.round(window.y + relativeCenterY * scaleY),
        score: cluster.count
      }
    })
    .filter((candidate): candidate is UnreadConversationCandidate => !!candidate)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }
      return left.y - right.y
    })
}
