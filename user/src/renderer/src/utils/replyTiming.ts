export type ReplyIntervalConfig = {
  replyIntervalStartSec?: number | null
  replyIntervalEndSec?: number | null
}

const QUICK_REPLY_FREE_CHARS = 12
const HUMAN_TYPING_DELAY_PER_CHAR_MS = 120
const HUMAN_TYPING_DELAY_MAX_MS = 12_000

const normalizeRandomValue = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0
  }
  return Math.min(1, Math.max(0, value))
}

const countMeaningfulChars = (text: string): number => {
  return Array.from(String(text || '').replace(/\s+/g, '')).length
}

export const calculateHumanReplyDelayMs = (
  reply: string,
  config: ReplyIntervalConfig | null | undefined,
  randomSource: () => number = Math.random
): number => {
  const minMs = Math.max(0, Number(config?.replyIntervalStartSec) || 0) * 1000
  const maxMs = Math.max(minMs, Math.max(0, Number(config?.replyIntervalEndSec) || 0) * 1000)
  const baseDelayMs = Math.floor(minMs + normalizeRandomValue(randomSource()) * (maxMs - minMs))
  // 短回复只走基础等待，长回复按字数补充一点输入节奏，避免长文本秒回显得不自然。
  const typingChars = Math.max(0, countMeaningfulChars(reply) - QUICK_REPLY_FREE_CHARS)
  const contentDelayMs = Math.min(HUMAN_TYPING_DELAY_MAX_MS, typingChars * HUMAN_TYPING_DELAY_PER_CHAR_MS)
  return Math.floor(baseDelayMs + contentDelayMs)
}
