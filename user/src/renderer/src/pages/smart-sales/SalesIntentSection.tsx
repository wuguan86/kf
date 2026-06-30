import styles from './CustomerProfileDetail.module.css'
import { CustomerProfile } from '../../api/smartSales'

export default function SalesIntentSection({ profile }: { profile: CustomerProfile }): JSX.Element {
  return (
    <section className={styles.panel}>
      <div className={styles.intentSummary}>
        <div>
          <h2 className={styles.cardTitle}>销售判断</h2>
          <div className={styles.intentHint}>根据会话内容提取预算、需求和推进时机。</div>
        </div>
        <div className={styles.intentScore}>
          <span>{profile.totalScore ?? '—'}</span>
          <small>总评分</small>
        </div>
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
    </section>
  )
}

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
    { label: '提及竞品', value: displaySalesValue(profile.competitors) }
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

function displaySalesValue(value: string | null): string {
  if (!value) return '暂无'
  const normalized = value.trim().toLowerCase()
  if (['', '未知', 'none', 'null', 'undefined'].includes(normalized)) {
    return '暂无'
  }
  return value.trim()
}
