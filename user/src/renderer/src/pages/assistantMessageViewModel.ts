export type IncomingMessageType = 'text' | 'image' | 'sticker'

type IncomingMessageInput = {
  content: string
  type?: unknown
  isSelf: boolean
}

type MessageDisplayInput = {
  content: string
  type: IncomingMessageType
  imageDataUrl?: string
}

export const normalizeMessage = (text: string): string => {
  return text.replace(/\s+/g, ' ').replace(/\u200B/g, '').trim()
}

export const normalizeIncomingMessageType = (value: unknown): IncomingMessageType => {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'image' || normalized === 'sticker') {
    return normalized
  }
  return 'text'
}

export const isImagePlaceholderMessage = (text: string): boolean => {
  const normalized = normalizeMessage(String(text || ''))
  return normalized === '[图片]' ||
    normalized === '图片' ||
    normalized === '[Image]' ||
    normalized === '[表情包]' ||
    normalized === '表情包' ||
    normalized === '[动态表情]'
}

export const shouldExtractImageForIncomingMessage = (message: IncomingMessageInput): boolean => {
  const messageType = normalizeIncomingMessageType(message.type)
  if (message.isSelf || (messageType !== 'image' && messageType !== 'sticker')) {
    return false
  }
  // 后端视觉解析已经给出结构化类型，前端只在明确占位时提取截图，避免把文字气泡误画成图片。
  return isImagePlaceholderMessage(message.content)
}

export const buildMessageDisplayPayload = (message: MessageDisplayInput): { displayText: string; imageDataUrl?: string } => {
  const messageType = normalizeIncomingMessageType(message.type)
  const displayText = normalizeMessage(message.content)
  if ((messageType === 'image' || messageType === 'sticker') && isImagePlaceholderMessage(displayText) && message.imageDataUrl) {
    return { displayText, imageDataUrl: message.imageDataUrl }
  }
  return { displayText }
}
