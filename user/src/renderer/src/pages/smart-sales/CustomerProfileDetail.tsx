import { useEffect, useState } from 'react'
import styles from './CustomerProfileDetail.module.css'
import TagManagementModal from './TagManagementModal'
import BasicInfoSection from './BasicInfoSection'
import AiProfileSection from './AiProfileSection'
import SalesIntentSection from './SalesIntentSection'
import CustomerFollowUpPanel from './CustomerFollowUpPanel'
import {
  smartSalesApi,
  CustomerProfile,
  TagView,
  FollowUpSuggestion,
  STAGE_OPTIONS,
} from '../../api/smartSales'

interface Props {
  contactKey: string
  onBack: () => void
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void
}

export default function CustomerProfileDetail({
  contactKey,
  onBack,
  showToast
}: Props): JSX.Element {
  const [profile, setProfile] = useState<CustomerProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshingAi, setRefreshingAi] = useState(false)
  const [autoRefreshAiKey, setAutoRefreshAiKey] = useState('')
  const [savingStage, setSavingStage] = useState(false)
  const [savingBasicInfo, setSavingBasicInfo] = useState(false)
  const [savingAiProfile, setSavingAiProfile] = useState(false)

  // 跟进表单
  const [followUpContent, setFollowUpContent] = useState('')
  const [followUpType, setFollowUpType] = useState('WECHAT')
  const [followUpNextAt, setFollowUpNextAt] = useState('')
  const [submittingFollowUp, setSubmittingFollowUp] = useState(false)
  const [suggestingFollowUp, setSuggestingFollowUp] = useState(false)
  const [aiSuggestion, setAiSuggestion] = useState<FollowUpSuggestion | null>(null)

  // 标签管理
  const [allTags, setAllTags] = useState<TagView[]>([])
  const [tagManagerOpen, setTagManagerOpen] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState('#5B8FF9')

  useEffect(() => {
    loadProfile()
    loadTags()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactKey])

  const loadProfile = async () => {
    setLoading(true)
    try {
      const data = await smartSalesApi.getProfile(contactKey)
      setProfile(data)
    } catch (error) {
      console.error('加载客户画像失败', error)
      showToast('加载客户画像失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  const loadTags = async () => {
    try {
      const data = await smartSalesApi.listTags()
      setAllTags(data || [])
    } catch (error) {
      console.error('加载标签失败', error)
    }
  }

  const handleStageChange = async (stage: string) => {
    setSavingStage(true)
    try {
      const data = await smartSalesApi.updateStage(contactKey, stage)
      setProfile(data)
      showToast('阶段已更新', 'success')
    } catch (error) {
      console.error('更新阶段失败', error)
      showToast('更新阶段失败', 'error')
    } finally {
      setSavingStage(false)
    }
  }

  const handleToggleStar = async () => {
    const next = profile?.starred === 1 ? 0 : 1
    try {
      const data = await smartSalesApi.updateStarred(contactKey, next)
      setProfile(data)
    } catch (error) {
      console.error('切换星标失败', error)
      showToast('操作失败', 'error')
    }
  }

  const handleRefreshAi = async (force: boolean) => {
    setRefreshingAi(true)
    try {
      const ai = await smartSalesApi.refreshProfile(contactKey, force)
      // 刷新后重新拉取完整画像(更新 aiProfile + updatedAt)
      await loadProfile()
      if (ai) {
        showToast('AI 画像已更新', 'success')
      } else {
        showToast('暂无可用的 AI 画像（未配置或无会话数据）', 'info')
      }
    } catch (error) {
      console.error('AI 画像刷新失败', error)
      showToast('AI 画像刷新失败', 'error')
    } finally {
      setRefreshingAi(false)
    }
  }

  const handleConfirmBasicInfo = async (data: {
    remarkName?: string
    phone?: string
    gender?: string
    source?: string
    remark?: string
  }) => {
    setSavingBasicInfo(true)
    try {
      const nextProfile = await smartSalesApi.confirmBasicInfo(contactKey, data)
      setProfile(nextProfile)
      showToast('基础资料已确认存入', 'success')
    } catch (error) {
      console.error('确认基础资料失败', error)
      showToast('确认基础资料失败', 'error')
    } finally {
      setSavingBasicInfo(false)
    }
  }

  const handleSaveAiProfile = async (data: {
    communicationStyle: string | null
    relationshipContext: string | null
    preferenceHints: string[] | null
    riskWarnings: string[] | null
    nextConversationTips: string | null
    profileNote: string | null
  }) => {
    setSavingAiProfile(true)
    try {
      const nextProfile = await smartSalesApi.updateAiProfile(contactKey, data)
      setProfile(nextProfile)
      showToast('沟通辅助画像已保存', 'success')
    } catch (error) {
      console.error('保存沟通辅助画像失败', error)
      showToast('保存沟通辅助画像失败', 'error')
    } finally {
      setSavingAiProfile(false)
    }
  }

  useEffect(() => {
    if (!profile || refreshingAi || autoRefreshAiKey === contactKey) {
      return
    }
    if (!shouldAutoRefreshAiProfile(profile)) {
      return
    }
    setAutoRefreshAiKey(contactKey)
    handleRefreshAi(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, refreshingAi, autoRefreshAiKey, contactKey])

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return
    try {
      const created = await smartSalesApi.createTag(newTagName.trim(), newTagColor)
      setAllTags((prev) => [...prev, created])
      setNewTagName('')
      showToast('标签已创建', 'success')
    } catch (error) {
      console.error('创建标签失败', error)
      showToast('创建标签失败', 'error')
    }
  }

  const handleAddTagToCustomer = async (tagId: string) => {
    try {
      const tags = await smartSalesApi.updateCustomerTags(contactKey, [tagId], [])
      setProfile((prev) => (prev ? { ...prev, tags } : prev))
    } catch (error) {
      console.error('打标失败', error)
      showToast('打标失败', 'error')
    }
  }

  const handleRemoveTagFromCustomer = async (tagId: string) => {
    try {
      const tags = await smartSalesApi.updateCustomerTags(contactKey, [], [tagId])
      setProfile((prev) => (prev ? { ...prev, tags } : prev))
    } catch (error) {
      console.error('取消标签失败', error)
      showToast('取消标签失败', 'error')
    }
  }

  const handleManagedTagsChanged = async (tags: TagView[]) => {
    setAllTags(tags)
    await loadProfile()
  }

  const handleSubmitFollowUp = async () => {
    if (!followUpContent.trim()) {
      showToast('请填写跟进内容', 'info')
      return
    }
    setSubmittingFollowUp(true)
    try {
      await smartSalesApi.createFollowUp(contactKey, {
        content: followUpContent.trim(),
        followUpType,
        nextFollowUpAt: followUpNextAt ? toLocalDateTime(followUpNextAt) : undefined,
        aiSuggested: aiSuggestion && followUpContent === aiSuggestion.suggestedContent ? 1 : 0
      })
      setFollowUpContent('')
      setFollowUpNextAt('')
      setAiSuggestion(null)
      showToast('跟进记录已添加', 'success')
      await loadProfile()
    } catch (error) {
      console.error('新增跟进失败', error)
      showToast('新增跟进失败', 'error')
    } finally {
      setSubmittingFollowUp(false)
    }
  }

  const handleSuggestFollowUp = async () => {
    setSuggestingFollowUp(true)
    try {
      const result = await smartSalesApi.suggestFollowUp(contactKey)
      setAiSuggestion(result)
      if (result.suggestedContent) {
        setFollowUpContent(result.suggestedContent)
        showToast('AI 跟进建议已生成', 'success')
      } else {
        showToast('AI 未能生成有效建议', 'info')
      }
    } catch (error: any) {
      console.error('AI 跟进建议生成失败', error)
      showToast(error?.message || 'AI 跟进建议生成失败', 'error')
    } finally {
      setSuggestingFollowUp(false)
    }
  }

  if (loading) {
    return <div className={styles.loading}>正在加载客户画像...</div>
  }
  if (!profile) {
    return (
      <div className={styles.profile}>
        <div className={styles.backBar}>
          <button className={styles.backBtn} onClick={onBack}>
            ← 返回
          </button>
        </div>
        <div className={styles.empty}>未找到客户数据</div>
      </div>
    )
  }

  const intentClass =
    profile.intentLevel === 3
      ? styles.highBadge
      : profile.intentLevel === 2
      ? styles.midBadge
      : profile.intentLevel === 1
      ? styles.lowBadge
      : styles.unknownBadge

  const customerTags = profile.tags || []
  const unselectedTags = allTags.filter(
    (t) => !customerTags.some((c) => c.id === t.id)
  )

  return (
    <div className={styles.profile}>
      <div className={styles.backBar}>
        <button className={styles.backBtn} onClick={onBack}>
          ← 返回
        </button>
      </div>

      {/* 头部：客户名 + 意向 + 阶段流转 + 星标 */}
      <div className={styles.headerCard}>
        <div className={styles.headerLeft}>
          <div className={styles.avatar}>{profile.customerName?.charAt(0) || '?'}</div>
          <div>
            <div className={styles.headerName}>
              {profile.customerName}
              <span className={`${styles.intentBadge} ${intentClass}`}>
                {profile.intentLabel}
              </span>
            </div>
            <div className={styles.headerMeta}>
              <span>最后沟通：{formatTime(profile.lastChatTime)}</span>
            </div>
          </div>
        </div>
        <div className={styles.headerActions}>
          <button
            className={styles.starBtn}
            onClick={handleToggleStar}
            title={profile.starred === 1 ? '取消星标' : '加星标'}
          >
            <span className={profile.starred === 1 ? styles.starActive : ''}>
              {profile.starred === 1 ? '★' : '☆'}
            </span>
          </button>
          <select
            className={styles.stageSelect}
            value={profile.stage || 'LEAD'}
            onChange={(e) => handleStageChange(e.target.value)}
            disabled={savingStage}
          >
            {STAGE_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {profile.aiStageSuggestion && profile.aiStageSuggestion !== profile.stage && (
        <div className={styles.stageSuggestionBlock}>
          <div>
            <div className={styles.stageSuggestionTitle}>
              AI建议阶段：{profile.aiStageSuggestionLabel || stageLabel(profile.aiStageSuggestion)}
              {profile.aiStageConfidence != null && (
                <span className={styles.stageConfidence}>
                  置信度 {profile.aiStageConfidence}%
                </span>
              )}
            </div>
            {profile.aiStageReason && (
              <div className={styles.stageSuggestionReason}>{profile.aiStageReason}</div>
            )}
            {profile.aiStageUpdatedAt && (
              <div className={styles.aiEmpty}>更新时间：{formatTime(profile.aiStageUpdatedAt)}</div>
            )}
          </div>
          <button
            className={styles.primaryBtn}
            onClick={() => handleStageChange(profile.aiStageSuggestion!)}
            disabled={savingStage}
          >
            采纳建议
          </button>
        </div>
      )}

      <div className={styles.grid}>
        {/* 左列：意向评分 + AI 画像 */}
        <div className={styles.card}>
          <BasicInfoSection
            profile={profile}
            saving={savingBasicInfo}
            onConfirm={handleConfirmBasicInfo}
          />
          <SalesIntentSection profile={profile} />
          <AiProfileSection
            aiProfile={profile.aiProfile}
            refreshing={refreshingAi}
            saving={savingAiProfile}
            onRefresh={() => handleRefreshAi(true)}
            onSave={handleSaveAiProfile}
          />
        </div>

        {/* 右列：标签 + 跟进时间线 */}
        <div className={styles.card}>
          <CustomerFollowUpPanel
            customerTags={customerTags}
            unselectedTags={unselectedTags}
            newTagName={newTagName}
            newTagColor={newTagColor}
            followUps={profile.followUps || []}
            followUpContent={followUpContent}
            followUpType={followUpType}
            followUpNextAt={followUpNextAt}
            aiSuggestion={aiSuggestion}
            submittingFollowUp={submittingFollowUp}
            suggestingFollowUp={suggestingFollowUp}
            onOpenTagManager={() => setTagManagerOpen(true)}
            onNewTagNameChange={setNewTagName}
            onNewTagColorChange={setNewTagColor}
            onCreateTag={handleCreateTag}
            onAddTag={handleAddTagToCustomer}
            onRemoveTag={handleRemoveTagFromCustomer}
            onFollowUpContentChange={(value) => {
              setFollowUpContent(value)
              // 用户手动修改内容后，清除 AI 建议标记，避免误标为 AI 建议。
              if (aiSuggestion && value !== aiSuggestion.suggestedContent) {
                setAiSuggestion(null)
              }
            }}
            onFollowUpTypeChange={setFollowUpType}
            onFollowUpNextAtChange={setFollowUpNextAt}
            onSuggestFollowUp={handleSuggestFollowUp}
            onSubmitFollowUp={handleSubmitFollowUp}
          />
        </div>
      </div>
      <TagManagementModal
        open={tagManagerOpen}
        onClose={() => setTagManagerOpen(false)}
        showToast={showToast}
        onChanged={handleManagedTagsChanged}
      />
    </div>
  )
}

// ===================== 工具函数 =====================
function sourceLabel(source: string | null): string {
  switch (source) {
    case 'GROUP':
      return '群聊'
    case 'SCAN':
      return '扫码'
    case 'REFERRAL':
      return '介绍'
    case 'IMPORT':
      return '导入'
    default:
      return '未知'
  }
}

function genderLabel(gender: string | null): string {
  switch (gender) {
    case 'MALE':
      return '男'
    case 'FEMALE':
      return '女'
    case 'OTHER':
      return '其他'
    default:
      return '未知'
  }
}

function stageLabel(stage: string | null): string {
  if (!stage) return '未知'
  const found = STAGE_OPTIONS.find((s) => s.value === stage)
  return found ? found.label : stage
}

function shouldAutoRefreshAiProfile(profile: CustomerProfile): boolean {
  if (!profile.lastChatTime) {
    return false
  }
  if (!profile.aiProfile) {
    return true
  }
  if (!profile.aiProfile.updatedAt) {
    return true
  }
  const updatedAt = new Date(profile.aiProfile.updatedAt).getTime()
  const lastChatTime = new Date(profile.lastChatTime).getTime()
  if (Number.isNaN(updatedAt) || Number.isNaN(lastChatTime)) {
    return false
  }
  return lastChatTime > updatedAt
}

function formatTime(value: string | null): string {
  if (!value) return '暂无'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const pad = (n: number) => `${n}`.padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`
}

function toLocalDateTime(localValue: string): string {
  // datetime-local 控件值形如 2026-06-18T14:30，转为后端期望的 yyyy-MM-dd HH:mm:ss
  return localValue.replace('T', ' ') + ':00'
}
