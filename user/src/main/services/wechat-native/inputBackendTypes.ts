import type { MarketingMomentPoint, UnreadConversationCandidate, WindowBounds } from './types'

export type WeChatInputBackend = {
  pasteAndSendText: (bounds: WindowBounds, content: string) => Promise<boolean>
  clickConversationCandidate: (bounds: WindowBounds, candidate: UnreadConversationCandidate) => Promise<boolean>
  exitConversationToList: (bounds: WindowBounds) => Promise<boolean>
  clickMarketingPoint: (bounds: WindowBounds, point: MarketingMomentPoint) => Promise<boolean>
  pasteMarketingComment: (bounds: WindowBounds, content: string) => Promise<boolean>
}

export type InputBackendLogger = {
  warn: (...args: unknown[]) => void
}
