import type { MarketingMomentPoint, UnreadConversationCandidate, WindowBounds } from './types'
import type { InputBackendLogger, WeChatInputBackend } from './inputBackendTypes'

type InputBackendOptions = {
  platform?: NodeJS.Platform | string
  nativeBackend: WeChatInputBackend
  fallbackBackend: WeChatInputBackend
  logger?: InputBackendLogger
}

type BackendAction =
  | 'pasteAndSendText'
  | 'clickConversationCandidate'
  | 'exitConversationToList'
  | 'clickMarketingPoint'
  | 'pasteMarketingComment'

const runWithFallback = async (
  action: BackendAction,
  options: Required<InputBackendOptions>,
  nativeTask: () => Promise<boolean>,
  fallbackTask: () => Promise<boolean>
): Promise<boolean> => {
  if (options.platform !== 'win32') {
    return fallbackTask()
  }

  try {
    const nativeResult = await nativeTask()
    if (nativeResult) {
      return true
    }
    options.logger.warn('原生微信输入后端返回失败，已回退到 PowerShell 输入后端', { action })
  } catch (error) {
    options.logger.warn('原生微信输入后端异常，已回退到 PowerShell 输入后端', { action, error })
  }
  return fallbackTask()
}

export const createInputBackend = (rawOptions: InputBackendOptions): WeChatInputBackend => {
  const options: Required<InputBackendOptions> = {
    platform: rawOptions.platform || process.platform,
    nativeBackend: rawOptions.nativeBackend,
    fallbackBackend: rawOptions.fallbackBackend,
    logger: rawOptions.logger || console
  }

  return {
    pasteAndSendText(bounds: WindowBounds, content: string): Promise<boolean> {
      return runWithFallback(
        'pasteAndSendText',
        options,
        () => options.nativeBackend.pasteAndSendText(bounds, content),
        () => options.fallbackBackend.pasteAndSendText(bounds, content)
      )
    },
    clickConversationCandidate(bounds: WindowBounds, candidate: UnreadConversationCandidate): Promise<boolean> {
      return runWithFallback(
        'clickConversationCandidate',
        options,
        () => options.nativeBackend.clickConversationCandidate(bounds, candidate),
        () => options.fallbackBackend.clickConversationCandidate(bounds, candidate)
      )
    },
    exitConversationToList(bounds: WindowBounds): Promise<boolean> {
      return runWithFallback(
        'exitConversationToList',
        options,
        () => options.nativeBackend.exitConversationToList(bounds),
        () => options.fallbackBackend.exitConversationToList(bounds)
      )
    },
    clickMarketingPoint(bounds: WindowBounds, point: MarketingMomentPoint): Promise<boolean> {
      return runWithFallback(
        'clickMarketingPoint',
        options,
        () => options.nativeBackend.clickMarketingPoint(bounds, point),
        () => options.fallbackBackend.clickMarketingPoint(bounds, point)
      )
    },
    pasteMarketingComment(bounds: WindowBounds, content: string): Promise<boolean> {
      return runWithFallback(
        'pasteMarketingComment',
        options,
        () => options.nativeBackend.pasteMarketingComment(bounds, content),
        () => options.fallbackBackend.pasteMarketingComment(bounds, content)
      )
    }
  }
}
