type ClipboardImage = {
  isEmpty: () => boolean
  toDataURL: () => string
}

type ClipboardAdapter = {
  readText: () => string
  readHTML: () => string
  readImage: () => ClipboardImage
  writeText: (text: string) => void
  writeHTML: (html: string) => void
  writeImage: (image: ClipboardImage) => void
  clear: () => void
}

type CopyImageCommand = {
  action: 'copy_image_message'
  target: string
  messageUiId?: unknown
  timestamp?: number
}

type ExtractImageOptions = {
  senderId: string
  messageUiId?: unknown
  timestamp?: number
  timeoutMs?: number
  pollIntervalMs?: number
}

type ClipboardSnapshot = {
  text: string
  html: string
  image: ClipboardImage | null
}

type WeChatClipboardImageExtractorOptions = {
  clipboard: ClipboardAdapter
  executeWeChatCommand: (payload: CopyImageCommand) => Promise<{ ok?: boolean; error?: string; message?: string; strategy?: string; attempts?: unknown; dataUrl?: string }>
  sleep?: (ms: number) => Promise<void>
}

const DEFAULT_TIMEOUT_MS = 5000
const DEFAULT_POLL_INTERVAL_MS = 120

export class WeChatClipboardImageExtractor {
  private readonly clipboard: ClipboardAdapter

  private readonly executeWeChatCommand: WeChatClipboardImageExtractorOptions['executeWeChatCommand']

  private readonly sleep: (ms: number) => Promise<void>

  public constructor(options: WeChatClipboardImageExtractorOptions) {
    this.clipboard = options.clipboard
    this.executeWeChatCommand = options.executeWeChatCommand
    this.sleep = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  }

  public async extractImage(options: ExtractImageOptions): Promise<string> {
    const snapshot = this.backupClipboard()
    try {
      this.clipboard.clear()
      const commandResult = await this.executeWeChatCommand({
        action: 'copy_image_message',
        target: String(options.senderId || '').trim(),
        messageUiId: options.messageUiId,
        timestamp: options.timestamp
      })
      console.log('[微信图片复制] sidecar 复制结果', {
        ok: commandResult?.ok,
        error: commandResult?.error,
        message: commandResult?.message,
        strategy: commandResult?.strategy,
        attempts: commandResult?.attempts,
        hasDataUrl: !!commandResult?.dataUrl
      })

      if (!commandResult?.ok) {
        const reason = commandResult?.message || commandResult?.error || '未知错误'
        throw new Error(`复制微信图片失败：${reason}`)
      }
      if (commandResult.dataUrl) {
        console.log('[微信图片复制] 使用 sidecar 截图兜底图片', { dataUrlLength: commandResult.dataUrl.length })
        return commandResult.dataUrl
      }

      return await this.waitForClipboardImage(
        options.timeoutMs || DEFAULT_TIMEOUT_MS,
        options.pollIntervalMs || DEFAULT_POLL_INTERVAL_MS
      )
    } finally {
      this.restoreClipboard(snapshot)
    }
  }

  private backupClipboard(): ClipboardSnapshot {
    const image = this.clipboard.readImage()
    return {
      text: this.clipboard.readText(),
      html: this.clipboard.readHTML(),
      image: image && !image.isEmpty() ? image : null
    }
  }

  private restoreClipboard(snapshot: ClipboardSnapshot): void {
    try {
      this.clipboard.clear()
      if (snapshot.text) {
        this.clipboard.writeText(snapshot.text)
      }
      if (snapshot.html) {
        this.clipboard.writeHTML(snapshot.html)
      }
      if (snapshot.image) {
        this.clipboard.writeImage(snapshot.image)
      }
    } catch (error) {
      console.warn('[微信图片复制] 恢复剪贴板失败:', error)
    }
  }

  private async waitForClipboardImage(timeoutMs: number, pollIntervalMs: number): Promise<string> {
    const safeTimeout = Math.max(300, timeoutMs)
    const safePollInterval = Math.max(30, pollIntervalMs)
    const maxAttempts = Math.max(1, Math.ceil(safeTimeout / safePollInterval))

    for (let attempt = 0; attempt <= maxAttempts; attempt += 1) {
      const image = this.clipboard.readImage()
      if (image && !image.isEmpty()) {
        const dataUrl = image.toDataURL()
        if (dataUrl) {
          console.log('[微信图片复制] 已从剪贴板读取图片', { dataUrlLength: dataUrl.length })
          return dataUrl
        }
      }
      if (attempt < maxAttempts) {
        await this.sleep(safePollInterval)
      }
    }

    throw new Error('复制微信图片后未在剪贴板读取到图片')
  }
}
