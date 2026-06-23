import { useEffect, useState } from 'react'
import styles from './CustomerProfileDetail.module.css'
import TagManagementModal from './TagManagementModal'
import {
  smartSalesApi,
  CustomerProfile,
  TagView,
  FollowUpView,
  AiProfile,
  FollowUpSuggestion,
  STAGE_OPTIONS,
  FOLLOW_UP_TYPE_OPTIONS
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
  const [savingStage, setSavingStage] = useState(false)

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
              <span>联系人：{profile.contactKey}</span>
              {profile.phone && <span>电话：{profile.phone}</span>}
              <span>来源：{sourceLabel(profile.source)}</span>
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

      <div className={styles.grid}>
        {/* 左列：意向评分 + AI 画像 */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>意向评分</h2>
          <div className={styles.scoreRow}>
            <span className={styles.scoreLabel}>总评分</span>
            <div className={styles.scoreBarWrap}>
              <div
                className={styles.scoreBar}
                style={{ width: `${Math.min(100, (profile.totalScore || 0))}%` }}
              />
            </div>
            <span className={styles.scoreValue}>
              <span className={styles.totalScore}>{profile.totalScore ?? '—'}</span>
            </span>
          </div>
          <ScoreBar label="需求强度" level={profile.demandLevel} />
          <ScoreBar label="预算" level={profile.budgetLevel} />
          <ScoreBar label="时间紧迫度" level={profile.timeLevel} />
          <SalesInsightSection profile={profile} />
          {profile.dailySummary && (
            <div className={styles.aiBlock}>
              <span className={styles.aiLabel}>当日总结</span>
              <div className={styles.aiText}>{profile.dailySummary}</div>
            </div>
          )}
          {profile.aiReason && (
            <div className={styles.aiBlock}>
              <span className={styles.aiLabel}>AI 判定理由</span>
              <div className={styles.aiText}>{profile.aiReason}</div>
            </div>
          )}
          <AiProfileSection
            aiProfile={profile.aiProfile}
            refreshing={refreshingAi}
            onRefresh={() => handleRefreshAi(true)}
          />
        </div>

        {/* 右列：标签 + 跟进时间线 */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>客户标签</h2>
          <button
            className={styles.tagManageBtn}
            onClick={() => setTagManagerOpen(true)}
            title="标签管理"
          >
            ⚙ 标签管理
          </button>
          {customerTags.length === 0 ? (
            <div className={styles.empty}>暂无标签</div>
          ) : (
            <div className={styles.tagList}>
              {customerTags.map((tag) => (
                <span
                  key={tag.id}
                  className={styles.tagChip}
                  style={{ backgroundColor: tag.color }}
                >
                  {tag.name}
                  <span
                    className={styles.tagRemove}
                    onClick={() => handleRemoveTagFromCustomer(tag.id)}
                    title="移除"
                  >
                    ×
                  </span>
                </span>
              ))}
            </div>
          )}
          <div className={styles.tagAddRow}>
            <select
              className={styles.tagInput}
              value=""
              onChange={(e) => e.target.value && handleAddTagToCustomer(e.target.value)}
            >
              <option value="">+ 添加已有标签</option>
              {unselectedTags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.tagAddRow} style={{ marginTop: 8 }}>
            <input
              className={styles.tagInput}
              placeholder="新建标签名称"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateTag()}
            />
            <input
              type="color"
              className={styles.tagColorPicker}
              value={newTagColor}
              onChange={(e) => setNewTagColor(e.target.value)}
              title="标签颜色"
            />
            <button className={styles.primaryBtn} onClick={handleCreateTag}>
              新建标签
            </button>
          </div>

          <h2 className={styles.cardTitle} style={{ marginTop: 24 }}>
            跟进时间线
          </h2>
          {profile.followUps && profile.followUps.length > 0 ? (
            <div className={styles.timeline}>
              {profile.followUps.map((f: FollowUpView) => (
                <div className={styles.timelineItem} key={f.id}>
                  <div className={styles.timelineTime}>{formatTime(f.createdAt)}</div>
                  <div className={styles.timelineBody}>
                    <span className={styles.timelineType}>
                      {followUpTypeLabel(f.followUpType)}
                    </span>
                    {f.aiSuggested === 1 && <span className={styles.timelineAi}>AI建议</span>}
                    {f.nextFollowUpAt && (
                      <span className={styles.timelineAi}>
                        下次跟进：{formatTime(f.nextFollowUpAt)}
                      </span>
                    )}
                    <div className={styles.timelineContent}>{f.content}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.empty}>暂无跟进记录</div>
          )}

          <div className={styles.followUpForm}>
            {aiSuggestion && aiSuggestion.reason && (
              <div className={styles.aiSuggestionHint}>
                <span className={styles.aiLabel}>✨ AI 建议理由：</span>
                <span>{aiSuggestion.reason}</span>
              </div>
            )}
            <textarea
              className={styles.textarea}
              placeholder="记录本次跟进内容；AI 建议需人工确认后保存..."
              value={followUpContent}
              onChange={(e) => {
                setFollowUpContent(e.target.value)
                // 用户手动修改内容后，清除 AI 建议标记
                if (aiSuggestion && e.target.value !== aiSuggestion.suggestedContent) {
                  setAiSuggestion(null)
                }
              }}
            />
            <div className={styles.followUpRow}>
              <select
                className={styles.tagInput}
                value={followUpType}
                onChange={(e) => setFollowUpType(e.target.value)}
              >
                {FOLLOW_UP_TYPE_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>下次跟进</label>
              <input
                type="datetime-local"
                className={styles.tagInput}
                value={followUpNextAt}
                onChange={(e) => setFollowUpNextAt(e.target.value)}
              />
              <button
                className={styles.ghostBtn}
                onClick={handleSuggestFollowUp}
                disabled={suggestingFollowUp}
                title="AI 根据微信会话和客户画像生成草稿，需人工确认"
              >
                {suggestingFollowUp ? 'AI 生成中...' : '✨ AI 建议'}
              </button>
              <button
                className={styles.primaryBtn}
                onClick={handleSubmitFollowUp}
                disabled={submittingFollowUp}
              >
                {submittingFollowUp ? '保存中...' : '添加跟进'}
              </button>
            </div>
          </div>
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

// ===================== 子组件 =====================
function ScoreBar({ label, level }: { label: string; level: string | null }) {
  const ratio = levelToRatio(level)
  return (
    <div className={styles.scoreRow}>
      <span className={styles.scoreLabel}>{label}</span>
      <div className={styles.scoreBarWrap}>
        <div className={styles.scoreBar} style={{ width: `${ratio * 100}%` }} />
      </div>
      <span className={styles.scoreValue}>{levelText(level)}</span>
    </div>
  )
}

function SalesInsightSection({ profile }: { profile: CustomerProfile }) {
  const items = [
    { label: '预算描述', value: displaySalesValue(profile.budgetDesc) },
    { label: '购买时间', value: displaySalesValue(profile.timeDesc) },
    { label: '核心痛点', value: displaySalesValue(profile.painPoints) },
    { label: '提及竞品', value: displaySalesValue(profile.competitors) },
    { label: '最近事件', value: displaySalesValue(latestEventText(profile.latestEvent)) }
  ]

  return (
    <div className={styles.salesInsightBlock}>
      <div className={styles.salesInsightHeader}>销售线索明细</div>
      <div className={styles.salesInsightGrid}>
        {items.map((item) => (
          <div className={styles.salesInsightItem} key={item.label}>
            <span className={styles.salesInsightLabel}>{item.label}</span>
            <span
              className={
                item.value === '暂无' ? styles.salesInsightEmpty : styles.salesInsightValue
              }
            >
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function AiProfileSection({
  aiProfile,
  refreshing,
  onRefresh
}: {
  aiProfile: AiProfile | null
  refreshing: boolean
  onRefresh: () => void
}) {
  return (
    <div className={styles.aiBlock}>
      <span className={styles.aiLabel}>✨ AI 画像补充（基于会话生成，可能存在偏差）</span>
      {aiProfile ? (
        <>
          {aiProfile.communicationFocus && (
            <div className={styles.aiText}>
              <strong>沟通重点：</strong>
              {aiProfile.communicationFocus}
            </div>
          )}
          {aiProfile.interestTags && aiProfile.interestTags.length > 0 && (
            <div className={styles.aiText}>
              <strong>兴趣标签：</strong>
              {aiProfile.interestTags.join('、')}
            </div>
          )}
          {aiProfile.suggestedNextAction && (
            <div className={styles.aiText}>
              <strong>下一步建议：</strong>
              {aiProfile.suggestedNextAction}
            </div>
          )}
          {aiProfile.updatedAt && (
            <div className={styles.aiEmpty} style={{ marginTop: 6 }}>
              更新时间：{formatTime(aiProfile.updatedAt)}
            </div>
          )}
        </>
      ) : (
        <div className={styles.aiEmpty}>暂无 AI 画像，点击下方按钮生成</div>
      )}
      <div className={styles.aiActions}>
        <button className={styles.primaryBtn} onClick={onRefresh} disabled={refreshing}>
          {refreshing ? 'AI 分析中...' : aiProfile ? '重新生成' : '生成 AI 画像'}
        </button>
      </div>
    </div>
  )
}

// ===================== 工具函数 =====================
function levelToRatio(level: string | null): number {
  if (!level) return 0
  const v = level.toLowerCase()
  if (v === 'high') return 1
  if (v === 'medium' || v === 'mid') return 0.66
  if (v === 'low') return 0.33
  return 0
}

function levelText(level: string | null): string {
  if (!level) return '未知'
  const v = level.toLowerCase()
  if (v === 'high') return '高'
  if (v === 'medium' || v === 'mid') return '中'
  if (v === 'low') return '低'
  return '未知'
}

function latestEventText(value: string | null): string | null {
  if (!value) return null
  const normalized = value.toLowerCase()
  if (normalized === 'price') return '询价'
  if (normalized === 'demo') return '预约演示'
  if (normalized === 'trial') return '试用咨询'
  if (normalized === 'refusal') return '明确拒绝'
  if (normalized === 'objection') return '提出异议'
  if (normalized === 'handoff') return '转人工跟进'
  return value
}

function displaySalesValue(value: string | null): string {
  if (!value) return '暂无'
  const normalized = value.trim().toLowerCase()
  if (['', '未知', 'none', 'null', 'undefined'].includes(normalized)) {
    return '暂无'
  }
  return value.trim()
}

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

function followUpTypeLabel(type: string): string {
  const found = FOLLOW_UP_TYPE_OPTIONS.find((t) => t.value === type)
  return found ? found.label : type
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
