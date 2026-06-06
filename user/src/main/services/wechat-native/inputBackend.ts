import { createInputBackend } from './inputBackendSelector'
import { createPowerShellInputBackend } from './powerShellInputBackend'
import { createWin32InputBackend } from './win32InputBackend'

const inputBackend = createInputBackend({
  nativeBackend: createWin32InputBackend(),
  fallbackBackend: createPowerShellInputBackend(),
  logger: console
})

export const pasteAndSendText = inputBackend.pasteAndSendText
export const clickConversationCandidate = inputBackend.clickConversationCandidate
export const exitConversationToList = inputBackend.exitConversationToList
export const returnFromNestedConversation = inputBackend.returnFromNestedConversation
export const clickMarketingPoint = inputBackend.clickMarketingPoint
export const pasteMarketingComment = inputBackend.pasteMarketingComment
