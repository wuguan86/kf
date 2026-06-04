import type { UnreadConversationCandidate, WindowBounds } from './types'

export type WeChatInputBackend = {
  pasteAndSendText: (bounds: WindowBounds, content: string) => Promise<boolean>
  clickConversationCandidate: (bounds: WindowBounds, candidate: UnreadConversationCandidate) => Promise<boolean>
  exitConversationToList: (bounds: WindowBounds) => Promise<boolean>
}

export type InputBackendLogger = {
  warn: (...args: unknown[]) => void
}
