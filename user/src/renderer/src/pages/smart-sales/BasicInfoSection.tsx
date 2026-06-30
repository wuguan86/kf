import { useEffect, useState } from 'react'
import styles from './CustomerProfileDetail.module.css'
import { BasicInfoSuggestion, CustomerProfile, SOURCE_OPTIONS } from '../../api/smartSales'

interface Props {
  profile: CustomerProfile
  saving: boolean
  onConfirm: (data: {
    remarkName?: string
    phone?: string
    gender?: string
    source?: string
    remark?: string
  }) => void
}

const GENDER_OPTIONS = [
  { value: 'UNKNOWN', label: '未知' },
  { value: 'MALE', label: '男' },
  { value: 'FEMALE', label: '女' },
  { value: 'OTHER', label: '其他' }
]

export default function BasicInfoSection({ profile, saving, onConfirm }: Props): JSX.Element {
  const [form, setForm] = useState(() => buildInitialForm(profile.basicInfoSuggestion, profile))

  useEffect(() => {
    setForm(buildInitialForm(profile.basicInfoSuggestion, profile))
  }, [profile.contactKey, profile.basicInfoSuggestion, profile.remarkName, profile.phone, profile.gender, profile.source])

  const handleConfirm = () => {
    onConfirm({
      remarkName: form.remarkName.trim(),
      phone: form.phone.trim(),
      gender: form.gender,
      source: form.source,
      remark: form.remark.trim()
    })
  }

  return (
    <div className={styles.basicInfoBlock}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.cardTitle}>基础资料</h2>
        {profile.basicInfoSuggestion && (
          <span className={styles.suggestionBadge}>AI待确认</span>
        )}
      </div>
      <div className={styles.basicInfoGrid}>
        <InfoItem label="客户名称" value={profile.remarkName || profile.customerName} />
        <InfoItem label="电话" value={profile.phone || '暂无'} />
        <InfoItem label="性别" value={genderLabel(profile.gender)} />
        <InfoItem label="来源" value={sourceLabel(profile.source)} />
      </div>
      {profile.basicInfoSuggestion ? (
        <div className={styles.suggestionPanel}>
          <div className={styles.suggestionTitle}>AI 提取结果需人工确认后存入</div>
          <div className={styles.editGrid}>
            <label className={styles.fieldLabel}>
              姓名/备注名
              <input
                className={styles.fieldInput}
                value={form.remarkName}
                onChange={(e) => setForm((prev) => ({ ...prev, remarkName: e.target.value }))}
              />
            </label>
            <label className={styles.fieldLabel}>
              电话
              <input
                className={styles.fieldInput}
                value={form.phone}
                onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
              />
            </label>
            <label className={styles.fieldLabel}>
              性别
              <select
                className={styles.fieldInput}
                value={form.gender}
                onChange={(e) => setForm((prev) => ({ ...prev, gender: e.target.value }))}
              >
                {GENDER_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>
            <label className={styles.fieldLabel}>
              来源
              <select
                className={styles.fieldInput}
                value={form.source}
                onChange={(e) => setForm((prev) => ({ ...prev, source: e.target.value }))}
              >
                {SOURCE_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>
          </div>
          <label className={styles.fieldLabel}>
            备注
            <textarea
              className={styles.profileTextarea}
              value={form.remark}
              onChange={(e) => setForm((prev) => ({ ...prev, remark: e.target.value }))}
            />
          </label>
          {profile.basicInfoSuggestion.evidence && (
            <div className={styles.suggestionEvidence}>
              依据：{profile.basicInfoSuggestion.evidence}
              {profile.basicInfoSuggestion.confidence != null
                ? ` · 置信度 ${profile.basicInfoSuggestion.confidence}%`
                : ''}
            </div>
          )}
          <div className={styles.aiActions}>
            <button className={styles.primaryBtn} onClick={handleConfirm} disabled={saving}>
              {saving ? '保存中...' : '确认存入'}
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.aiEmpty}>暂无待确认基础资料，重新生成 AI 画像后可能产生草稿。</div>
      )}
    </div>
  )
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.basicInfoItem}>
      <span className={styles.salesInsightLabel}>{label}</span>
      <span className={styles.salesInsightValue}>{value}</span>
    </div>
  )
}

function buildInitialForm(suggestion: BasicInfoSuggestion | null, profile: CustomerProfile) {
  return {
    remarkName: suggestion?.remarkName || profile.remarkName || '',
    phone: suggestion?.phone || profile.phone || '',
    gender: suggestion?.gender || profile.gender || 'UNKNOWN',
    source: suggestion?.source || profile.source || 'UNKNOWN',
    remark: suggestion?.remark || ''
  }
}

function genderLabel(gender: string | null): string {
  const found = GENDER_OPTIONS.find((item) => item.value === gender)
  return found ? found.label : '未知'
}

function sourceLabel(source: string | null): string {
  const found = SOURCE_OPTIONS.find((item) => item.value === source)
  return found ? found.label : '未知'
}
