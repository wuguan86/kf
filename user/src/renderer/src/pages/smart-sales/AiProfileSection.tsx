import { useEffect, useState } from 'react'
import styles from './CustomerProfileDetail.module.css'
import { AiProfile } from '../../api/smartSales'

interface Props {
  aiProfile: AiProfile | null
  refreshing: boolean
  saving: boolean
  onRefresh: () => void
  onSave: (profile: Omit<AiProfile, 'updatedAt'>) => void
}

export default function AiProfileSection({
  aiProfile,
  refreshing,
  saving,
  onRefresh,
  onSave
}: Props): JSX.Element {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(() => toForm(aiProfile))

  useEffect(() => {
    if (!editing) {
      setForm(toForm(aiProfile))
    }
  }, [aiProfile, editing])

  const handleSave = () => {
    onSave({
      communicationStyle: form.communicationStyle.trim(),
      relationshipContext: form.relationshipContext.trim(),
      preferenceHints: splitLines(form.preferenceHints),
      riskWarnings: splitLines(form.riskWarnings),
      nextConversationTips: form.nextConversationTips.trim(),
      profileNote: form.profileNote.trim()
    })
    setEditing(false)
  }

  return (
    <section className={`${styles.panel} ${styles.aiProfilePanel}`}>
      <div className={styles.sectionHeader}>
        <span className={styles.aiLabel}>AI 沟通辅助画像</span>
        {aiProfile?.updatedAt && (
          <span className={styles.aiEmpty}>更新时间：{formatTime(aiProfile.updatedAt)}</span>
        )}
      </div>
      {editing ? (
        <div className={styles.profileEditForm}>
          <ProfileInput label="沟通风格" value={form.communicationStyle} onChange={(value) => setForm((prev) => ({ ...prev, communicationStyle: value }))} />
          <ProfileInput label="关系背景" value={form.relationshipContext} onChange={(value) => setForm((prev) => ({ ...prev, relationshipContext: value }))} />
          <ProfileTextarea label="偏好线索（一行一条）" value={form.preferenceHints} onChange={(value) => setForm((prev) => ({ ...prev, preferenceHints: value }))} />
          <ProfileTextarea label="风险提醒（一行一条）" value={form.riskWarnings} onChange={(value) => setForm((prev) => ({ ...prev, riskWarnings: value }))} />
          <ProfileInput label="下次沟通提示" value={form.nextConversationTips} onChange={(value) => setForm((prev) => ({ ...prev, nextConversationTips: value }))} />
          <ProfileTextarea label="画像备注" value={form.profileNote} onChange={(value) => setForm((prev) => ({ ...prev, profileNote: value }))} />
          <div className={styles.aiActions}>
            <button className={styles.primaryBtn} onClick={handleSave} disabled={saving}>
              {saving ? '保存中...' : '保存画像'}
            </button>
            <button className={styles.ghostBtn} onClick={() => setEditing(false)} disabled={saving}>
              取消
            </button>
          </div>
        </div>
      ) : aiProfile ? (
        <>
          <ProfileText label="沟通风格" value={aiProfile.communicationStyle} />
          <ProfileText label="关系背景" value={aiProfile.relationshipContext} />
          <ProfileText label="偏好线索" value={joinList(aiProfile.preferenceHints)} />
          <ProfileText label="风险提醒" value={joinList(aiProfile.riskWarnings)} />
          <ProfileText label="下次沟通提示" value={aiProfile.nextConversationTips} />
          <ProfileText label="画像备注" value={aiProfile.profileNote} />
          <div className={styles.aiActions}>
            <button className={styles.primaryBtn} onClick={onRefresh} disabled={refreshing}>
              {refreshing ? 'AI 分析中...' : '重新生成'}
            </button>
            <button className={styles.ghostBtn} onClick={() => setEditing(true)}>
              编辑画像
            </button>
          </div>
        </>
      ) : (
        <>
          <div className={styles.aiEmpty}>暂无沟通辅助画像，点击下方按钮生成。</div>
          <div className={styles.aiActions}>
            <button className={styles.primaryBtn} onClick={onRefresh} disabled={refreshing}>
              {refreshing ? 'AI 分析中...' : '生成 AI 画像'}
            </button>
          </div>
        </>
      )}
    </section>
  )
}

function ProfileText({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div className={styles.aiText}>
      <strong>{label}：</strong>
      {value}
    </div>
  )
}

function ProfileInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className={styles.fieldLabel}>
      {label}
      <input className={styles.fieldInput} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

function ProfileTextarea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className={styles.fieldLabel}>
      {label}
      <textarea className={styles.profileTextarea} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

function toForm(aiProfile: AiProfile | null) {
  return {
    communicationStyle: aiProfile?.communicationStyle || '',
    relationshipContext: aiProfile?.relationshipContext || '',
    preferenceHints: (aiProfile?.preferenceHints || []).join('\n'),
    riskWarnings: (aiProfile?.riskWarnings || []).join('\n'),
    nextConversationTips: aiProfile?.nextConversationTips || '',
    profileNote: aiProfile?.profileNote || ''
  }
}

function splitLines(value: string): string[] {
  return value.split('\n').map((item) => item.trim()).filter(Boolean)
}

function joinList(value: string[] | null | undefined): string {
  return value && value.length > 0 ? value.join('、') : ''
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
