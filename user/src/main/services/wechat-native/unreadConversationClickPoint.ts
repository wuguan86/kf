import type { MarketingMomentPoint, UnreadConversationCandidate, WindowBounds } from './types'

const PERSONAL_ROW_BODY_OFFSET_PX = 72
const PERSONAL_ROW_BODY_Y_OFFSET_PX = 30
const PERSONAL_ROW_BODY_RIGHT_PADDING_RATIO = 0.035
const PERSONAL_LIST_RIGHT_RATIO = 0.38

export const getUnreadConversationClickPoint = (
  bounds: WindowBounds,
  candidate: UnreadConversationCandidate
): MarketingMomentPoint => {
  const rowBodyX = candidate.centerX + PERSONAL_ROW_BODY_OFFSET_PX
  const listRightX = bounds.x + bounds.width * PERSONAL_LIST_RIGHT_RATIO
  const maxX = listRightX - bounds.width * PERSONAL_ROW_BODY_RIGHT_PADDING_RATIO
  return {
    // 未读红点只用于确定会话行，实际点击放在联系人名称/摘要区域，避免点到红点本身或行顶部搜索框边界。
    x: Math.round(Math.min(Math.max(rowBodyX, candidate.centerX), maxX)),
    y: Math.round(candidate.centerY + PERSONAL_ROW_BODY_Y_OFFSET_PX)
  }
}
