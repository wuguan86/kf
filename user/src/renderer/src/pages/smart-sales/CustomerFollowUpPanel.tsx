import styles from './CustomerProfileDetail.module.css'
import {
  FOLLOW_UP_TYPE_OPTIONS,
  FollowUpSuggestion,
  FollowUpView,
  TagView
} from '../../api/smartSales'

interface Props {
  customerTags: TagView[]
  unselectedTags: TagView[]
  newTagName: string
  newTagColor: string
  followUps: FollowUpView[]
  followUpContent: string
  followUpType: string
  followUpNextAt: string
  aiSuggestion: FollowUpSuggestion | null
  submittingFollowUp: boolean
  suggestingFollowUp: boolean
  onOpenTagManager: () => void
  onNewTagNameChange: (value: string) => void
  onNewTagColorChange: (value: string) => void
  onCreateTag: () => void
  onAddTag: (tagId: string) => void
  onRemoveTag: (tagId: string) => void
  onFollowUpContentChange: (value: string) => void
  onFollowUpTypeChange: (value: string) => void
  onFollowUpNextAtChange: (value: string) => void
  onSuggestFollowUp: () => void
  onSubmitFollowUp: () => void
}

export default function CustomerFollowUpPanel(props: Props): JSX.Element {
  return (
    <>
      <section className={styles.panel}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.cardTitle}>客户标签</h2>
          <button className={styles.tagManageBtn} onClick={props.onOpenTagManager} title="标签管理">
            标签管理
          </button>
        </div>
        {props.customerTags.length === 0 ? (
          <div className={styles.empty}>暂无标签</div>
        ) : (
          <div className={styles.tagList}>
            {props.customerTags.map((tag) => (
              <span key={tag.id} className={styles.tagChip} style={{ backgroundColor: tag.color }}>
                {tag.name}
                <span
                  className={styles.tagRemove}
                  onClick={() => props.onRemoveTag(tag.id)}
                  title="移除"
                >
                  ×
                </span>
              </span>
            ))}
          </div>
        )}
        <div className={styles.tagTools}>
          <select
            className={styles.tagInput}
            value=""
            onChange={(e) => e.target.value && props.onAddTag(e.target.value)}
          >
            <option value="">+ 添加已有标签</option>
            {props.unselectedTags.map((tag) => (
              <option key={tag.id} value={tag.id}>{tag.name}</option>
            ))}
          </select>
          <div className={styles.tagAddRow}>
            <input
              className={styles.tagInput}
              placeholder="新建标签名称"
              value={props.newTagName}
              onChange={(e) => props.onNewTagNameChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && props.onCreateTag()}
            />
            <input
              type="color"
              className={styles.tagColorPicker}
              value={props.newTagColor}
              onChange={(e) => props.onNewTagColorChange(e.target.value)}
              title="标签颜色"
            />
            <button className={styles.primaryBtn} onClick={props.onCreateTag}>新建标签</button>
          </div>
        </div>
      </section>

      <section className={`${styles.panel} ${styles.timelinePanel}`}>
        <h2 className={styles.cardTitle}>跟进时间线</h2>
        {props.followUps.length > 0 ? (
          <div className={styles.timeline}>
            {props.followUps.map((item) => (
              <div className={styles.timelineItem} key={item.id}>
                <div className={styles.timelineTime}>{formatTime(item.createdAt)}</div>
                <div className={styles.timelineBody}>
                  <div className={styles.timelineMeta}>
                    <span className={styles.timelineType}>{followUpTypeLabel(item.followUpType)}</span>
                    {item.aiSuggested === 1 && <span className={styles.timelineAi}>AI建议</span>}
                    {item.nextFollowUpAt && (
                      <span className={styles.timelineAi}>下次跟进：{formatTime(item.nextFollowUpAt)}</span>
                    )}
                  </div>
                  <div className={styles.timelineContent}>{item.content}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>暂无跟进记录</div>
        )}

        <div className={styles.followUpForm}>
          {props.aiSuggestion && props.aiSuggestion.reason && (
            <div className={styles.aiSuggestionHint}>
              <span className={styles.aiLabel}>AI 建议理由</span>
              <span>{props.aiSuggestion.reason}</span>
            </div>
          )}
          <textarea
            className={styles.textarea}
            placeholder="记录本次跟进内容；AI 建议需人工确认后保存..."
            value={props.followUpContent}
            onChange={(e) => props.onFollowUpContentChange(e.target.value)}
          />
          <div className={styles.followUpRow}>
            <select
              className={styles.tagInput}
              value={props.followUpType}
              onChange={(e) => props.onFollowUpTypeChange(e.target.value)}
            >
              {FOLLOW_UP_TYPE_OPTIONS.map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
            <label className={styles.inlineLabel}>下次跟进</label>
            <input
              type="datetime-local"
              className={styles.tagInput}
              value={props.followUpNextAt}
              onChange={(e) => props.onFollowUpNextAtChange(e.target.value)}
            />
            <button
              className={styles.ghostBtn}
              onClick={props.onSuggestFollowUp}
              disabled={props.suggestingFollowUp}
              title="AI 根据微信会话和客户画像生成草稿，需人工确认"
            >
              {props.suggestingFollowUp ? 'AI 生成中...' : 'AI 建议'}
            </button>
            <button
              className={styles.primaryBtn}
              onClick={props.onSubmitFollowUp}
              disabled={props.submittingFollowUp}
            >
              {props.submittingFollowUp ? '保存中...' : '添加跟进'}
            </button>
          </div>
        </div>
      </section>
    </>
  )
}

function followUpTypeLabel(type: string): string {
  const found = FOLLOW_UP_TYPE_OPTIONS.find((item) => item.value === type)
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
