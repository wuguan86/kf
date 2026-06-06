import type { WeChatAccountCategory } from './types'

export type SpecialConversationRule = {
  accountCategory: WeChatAccountCategory
  skipReason: string
  source: 'category' | 'contact'
}

const SPECIAL_ACCOUNT_CATEGORIES = new Set<WeChatAccountCategory>([
  'FILE_HELPER',
  'TENCENT_NEWS',
  'OFFICIAL_ACCOUNT',
  'SERVICE_ACCOUNT',
  'CUSTOMER_SERVICE'
])

const CONTACT_NAME_RULES: Array<{ keywords: string[]; accountCategory: WeChatAccountCategory; label: string }> = [
  { keywords: ['文件传输助手', 'filetransfer'], accountCategory: 'FILE_HELPER', label: '文件传输助手' },
  { keywords: ['腾讯新闻', 'tencentnews'], accountCategory: 'TENCENT_NEWS', label: '腾讯新闻' },
  { keywords: ['公众号', '订阅号'], accountCategory: 'OFFICIAL_ACCOUNT', label: '公众号' },
  { keywords: ['服务号'], accountCategory: 'SERVICE_ACCOUNT', label: '服务号' },
  { keywords: ['客服消息', '微信客服'], accountCategory: 'CUSTOMER_SERVICE', label: '客服消息' }
]

const ACCOUNT_CATEGORY_LABELS: Partial<Record<WeChatAccountCategory, string>> = {
  FILE_HELPER: '文件传输助手',
  TENCENT_NEWS: '腾讯新闻',
  OFFICIAL_ACCOUNT: '公众号',
  SERVICE_ACCOUNT: '服务号',
  CUSTOMER_SERVICE: '客服消息'
}

export const getSpecialConversationRule = (
  contact: string,
  accountCategory?: WeChatAccountCategory | null,
  skipReason?: string
): SpecialConversationRule | null => {
  if (accountCategory && SPECIAL_ACCOUNT_CATEGORIES.has(accountCategory)) {
    const label = ACCOUNT_CATEGORY_LABELS[accountCategory] || '特殊会话'
    return {
      accountCategory,
      skipReason: String(skipReason || '').trim() || `命中${label}固定过滤规则`,
      source: 'category'
    }
  }

  const normalizedContact = normalizeContactName(contact)
  if (!normalizedContact) {
    return null
  }

  for (const rule of CONTACT_NAME_RULES) {
    if (rule.keywords.some((keyword) => normalizedContact.includes(normalizeContactName(keyword)))) {
      return {
        accountCategory: rule.accountCategory,
        skipReason: String(skipReason || '').trim() || `命中${rule.label}联系人名称过滤规则`,
        source: 'contact'
      }
    }
  }

  return null
}

const normalizeContactName = (value: string): string => {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_\-·.。:：｜|【】()[\]{}]+/g, '')
}
