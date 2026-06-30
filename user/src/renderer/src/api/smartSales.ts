import http from '../utils/http'

// --- Types ---
// 所有 Long 类型 ID 后端已转成 String，前端按 string 处理，避免雪花 ID 精度丢失。

export interface TagView {
  id: string
  name: string
  color: string
  category: 'PRESET' | 'CUSTOM'
}

export interface AiProfile {
  communicationStyle: string | null
  relationshipContext: string | null
  preferenceHints: string[] | null
  riskWarnings: string[] | null
  nextConversationTips: string | null
  profileNote: string | null
  updatedAt: string | null
}

export interface BasicInfoSuggestion {
  remarkName: string | null
  phone: string | null
  gender: string | null
  source: string | null
  remark: string | null
  evidence: string | null
  confidence: number | null
  updatedAt: string | null
}

export interface FollowUpView {
  id: string
  content: string
  followUpType: 'PHONE' | 'WECHAT' | 'MEETING' | 'NOTE'
  aiSuggested: number
  nextFollowUpAt: string | null
  createdAt: string
}

export interface CustomerListItem {
  contactKey: string
  customerName: string
  intentLevel: number | null
  intentLabel: string
  totalScore: number | null
  dailySummary: string | null
  demandLevel: string | null
  budgetLevel: string | null
  timeLevel: string | null
  budgetDesc: string | null
  timeDesc: string | null
  painPoints: string | null
  competitors: string | null
  latestEvent: string | null
  customerId: string | null
  phone: string | null
  source: string | null
  stage: string | null
  aiStageSuggestion: string | null
  aiStageSuggestionLabel: string | null
  aiStageConfidence: number | null
  aiStageReason: string | null
  aiStageUpdatedAt: string | null
  starred: number | null
  nextFollowUpAt: string | null
  lastChatTime: string | null
  tags: TagView[]
}

export interface CustomerListResponse {
  total: number
  list: CustomerListItem[]
}

export interface CustomerProfile {
  contactKey: string
  customerName: string
  intentLevel: number | null
  intentLabel: string
  totalScore: number | null
  demandLevel: string | null
  budgetLevel: string | null
  timeLevel: string | null
  budgetDesc: string | null
  timeDesc: string | null
  painPoints: string | null
  competitors: string | null
  latestEvent: string | null
  aiReason: string | null
  dailySummary: string | null
  customerId: string | null
  remarkName: string | null
  phone: string | null
  gender: string | null
  source: string | null
  stage: string | null
  aiStageSuggestion: string | null
  aiStageSuggestionLabel: string | null
  aiStageConfidence: number | null
  aiStageReason: string | null
  aiStageUpdatedAt: string | null
  starred: number | null
  nextFollowUpAt: string | null
  lastChatTime: string | null
  tags: TagView[]
  followUps: FollowUpView[]
  basicInfoSuggestion: BasicInfoSuggestion | null
  aiProfile: AiProfile | null
}

export interface StageCountView {
  stage: string
  stageLabel: string
  count: number
}

export interface PendingFollowUpView {
  contactKey: string
  customerName: string
  intentLevel: number | null
  intentLabel: string
  nextFollowUpAt: string
}

export interface DashboardView {
  stageFunnel: StageCountView[]
  starredCount: number
  highIntentWithoutStageCount: number
  todayPendingFollowUps: PendingFollowUpView[]
  todayPendingTotal: number
}

export interface FollowUpSuggestion {
  suggestedContent: string
  reason: string
}

// --- API ---
const BASE = '/api/user/smart-sales'

export const smartSalesApi = {
  getDashboard: () => http.get<any, DashboardView>(`${BASE}/dashboard`),
  listCustomers: (params: {
    pageNo: number
    pageSize: number
    intentLevel?: number
    stage?: string
    starred?: boolean
    keyword?: string
  }) => {
    const search = new URLSearchParams()
    search.set('pageNo', String(params.pageNo))
    search.set('pageSize', String(params.pageSize))
    if (params.intentLevel != null) search.set('intentLevel', String(params.intentLevel))
    if (params.stage) search.set('stage', params.stage)
    if (params.starred != null) search.set('starred', String(params.starred))
    if (params.keyword) search.set('keyword', params.keyword)
    return http.get<any, CustomerListResponse>(`${BASE}/customers?${search.toString()}`)
  },
  getProfile: (contactKey: string) =>
    http.get<any, CustomerProfile>(`${BASE}/customers/${encodeURIComponent(contactKey)}`),
  saveCustomer: (data: {
    contactKey: string
    remarkName?: string
    phone?: string
    gender?: string
    source?: string
    stage?: string
    assignedRoleId?: string
    remark?: string
    nextFollowUpAt?: string
    starred?: number
  }) => http.post<any, CustomerProfile>(`${BASE}/customers`, data),
  updateStage: (contactKey: string, stage: string) =>
    http.post<any, CustomerProfile>(`${BASE}/customers/${encodeURIComponent(contactKey)}/stage`, { stage }),
  updateStarred: (contactKey: string, starred: number) =>
    http.post<any, CustomerProfile>(`${BASE}/customers/${encodeURIComponent(contactKey)}/starred`, { starred }),
  confirmBasicInfo: (
    contactKey: string,
    data: { remarkName?: string; phone?: string; gender?: string; source?: string; remark?: string }
  ) =>
    http.post<any, CustomerProfile>(
      `${BASE}/customers/${encodeURIComponent(contactKey)}/basic-info/confirm`,
      data
    ),
  updateAiProfile: (contactKey: string, data: Omit<AiProfile, 'updatedAt'>) =>
    http.put<any, CustomerProfile>(`${BASE}/customers/${encodeURIComponent(contactKey)}/profile`, data),
  listTags: () => http.get<any, TagView[]>(`${BASE}/tags`),
  createTag: (name: string, color?: string) =>
    http.post<any, TagView>(`${BASE}/tags`, { name, color }),
  updateTag: (tagId: string, name: string, color?: string) =>
    http.put<any, TagView>(`${BASE}/tags/${encodeURIComponent(tagId)}`, { name, color }),
  deleteTag: (tagId: string) =>
    http.delete<any, boolean>(`${BASE}/tags/${encodeURIComponent(tagId)}`),
  updateCustomerTags: (contactKey: string, addTagIds: string[], removeTagIds: string[]) =>
    http.post<any, TagView[]>(`${BASE}/customers/${encodeURIComponent(contactKey)}/tags`, {
      addTagIds,
      removeTagIds
    }),
  createFollowUp: (
    contactKey: string,
    data: { content: string; followUpType: string; nextFollowUpAt?: string; aiSuggested?: number }
  ) => http.post<any, FollowUpView>(`${BASE}/customers/${encodeURIComponent(contactKey)}/follow-ups`, data),
  refreshProfile: (contactKey: string, force = false) =>
    http.post<any, AiProfile | null>(
      `${BASE}/customers/${encodeURIComponent(contactKey)}/profile/refresh?force=${force}`
    ),
  suggestFollowUp: (contactKey: string) =>
    http.post<any, FollowUpSuggestion>(
      `${BASE}/customers/${encodeURIComponent(contactKey)}/follow-up/suggest`
    )
}

// --- 常量 ---
export const STAGE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'LEAD', label: '线索' },
  { value: 'FOLLOWING', label: '跟进中' },
  { value: 'INTENDED', label: '明确意向' },
  { value: 'WON', label: '已成交' },
  { value: 'LOST', label: '已流失' }
]

export const SOURCE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'UNKNOWN', label: '未知' },
  { value: 'GROUP', label: '群聊' },
  { value: 'SCAN', label: '扫码' },
  { value: 'REFERRAL', label: '介绍' },
  { value: 'IMPORT', label: '导入' }
]

export const FOLLOW_UP_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'WECHAT', label: '微信' },
  { value: 'PHONE', label: '电话' },
  { value: 'MEETING', label: '见面' },
  { value: 'NOTE', label: '备注' }
]
