import type { MarketingMomentPoint, UnreadConversationCandidate, WeChatOutboundAttachment, WindowBounds } from './types'

export type WeChatInputBackend = {
  pasteAndSendText: (bounds: WindowBounds, content: string) => Promise<boolean>
  pasteAndSendAttachments: (bounds: WindowBounds, attachments: WeChatOutboundAttachment[]) => Promise<boolean>
  clickConversationCandidate: (bounds: WindowBounds, candidate: UnreadConversationCandidate) => Promise<boolean>
  exitConversationToList: (bounds: WindowBounds) => Promise<boolean>
  returnFromNestedConversation: (bounds: WindowBounds) => Promise<boolean>
  clickMomentsEntry: (bounds: WindowBounds) => Promise<boolean>
  clickMarketingPoint: (bounds: WindowBounds, point: MarketingMomentPoint) => Promise<boolean>
  closeMomentsWindow: (bounds: WindowBounds) => Promise<boolean>
  pasteMarketingComment: (bounds: WindowBounds, content: string) => Promise<boolean>
}

export type InputBackendLogger = {
  warn: (...args: unknown[]) => void
}
