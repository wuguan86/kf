import { app, type NativeImage } from 'electron'
import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import type { WeChatScreenshot, WindowBounds } from './types'

type VisionDebugStage = 'window' | 'chat-region' | 'conversation-row' | 'image-message'

type VisionDebugSaveOptions = {
  stage: VisionDebugStage
  image: WeChatScreenshot | NativeImage
  window?: WindowBounds
  metadata?: Record<string, unknown>
}

type VisionDebugStatus = {
  enabled: boolean
  outputDir: string
}

let debugEnabled = String(process.env.WECHAT_VISION_DEBUG_SAVE || '').trim() === '1'
let debugOutputDir = String(process.env.WECHAT_VISION_DEBUG_DIR || '').trim()

const resolveOutputDir = (): string => {
  if (debugOutputDir) {
    return debugOutputDir
  }
  return join(app.getPath('userData'), 'wechat-vision-debug')
}

const sanitizeFilePart = (value: string): string => {
  return value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/\s+/g, '_').slice(0, 60) || 'unknown'
}

const imageToPng = (image: WeChatScreenshot | NativeImage): Buffer => {
  if ('png' in image) {
    return image.png
  }
  return image.toPNG()
}

const describeImage = (image: WeChatScreenshot | NativeImage): Record<string, unknown> => {
  if ('png' in image) {
    return {
      width: image.width,
      height: image.height,
      scaleFactor: image.scaleFactor
    }
  }
  const size = image.getSize()
  return {
    width: size.width,
    height: size.height
  }
}

const buildMetadata = (options: VisionDebugSaveOptions, fileName: string): Record<string, unknown> => {
  return {
    stage: options.stage,
    fileName,
    savedAt: new Date().toISOString(),
    image: describeImage(options.image),
    window: options.window
      ? {
          hwnd: options.window.hwnd,
          title: options.window.title,
          className: options.window.className,
          processName: options.window.processName,
          x: options.window.x,
          y: options.window.y,
          width: options.window.width,
          height: options.window.height,
          scaleFactor: options.window.scaleFactor
        }
      : undefined,
    ...options.metadata
  }
}

export const configureVisionDebugRecorder = (enabled: boolean, outputDir?: string): VisionDebugStatus => {
  debugEnabled = enabled
  if (typeof outputDir === 'string' && outputDir.trim()) {
    debugOutputDir = outputDir.trim()
  }
  console.info('微信视觉调试截图落盘配置已更新', {
    enabled: debugEnabled,
    outputDir: resolveOutputDir()
  })
  return getVisionDebugRecorderStatus()
}

export const getVisionDebugRecorderStatus = (): VisionDebugStatus => {
  return {
    enabled: debugEnabled,
    outputDir: resolveOutputDir()
  }
}

export const saveVisionDebugImage = async (options: VisionDebugSaveOptions): Promise<string | null> => {
  if (!debugEnabled) {
    return null
  }
  try {
    const outputDir = resolveOutputDir()
    await mkdir(outputDir, { recursive: true })
    const timePart = new Date().toISOString().replace(/[:.]/g, '-')
    const titlePart = sanitizeFilePart(String(options.window?.title || options.stage))
    const fileBase = `${timePart}-${options.stage}-${titlePart}`
    const pngPath = join(outputDir, `${fileBase}.png`)
    const metadataPath = join(outputDir, `${fileBase}.json`)
    await writeFile(pngPath, imageToPng(options.image))
    await writeFile(metadataPath, JSON.stringify(buildMetadata(options, `${fileBase}.png`), null, 2), 'utf8')
    console.info('微信视觉调试截图已保存', {
      stage: options.stage,
      pngPath,
      metadataPath
    })
    return pngPath
  } catch (error) {
    console.warn('微信视觉调试截图保存失败', {
      stage: options.stage,
      error: error instanceof Error ? error.message : String(error)
    })
    return null
  }
}
