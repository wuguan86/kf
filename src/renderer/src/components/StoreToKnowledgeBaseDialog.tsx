import React from 'react'
import styles from './StoreToKnowledgeBaseDialog.module.css'

export type SelectableKnowledgeBase = {
  id: string
  name: string
  description: string
  status: string
}

type Props = {
  isOpen: boolean
  loading: boolean
  options: SelectableKnowledgeBase[]
  selectedId: string
  customerMessage: string
  aiReplyMessage: string
  onSelect: (id: string) => void
  onConfirm: () => void
  onClose: () => void
}

const previewText = (text: string, maxLength = 120): string => {
  if (!text) {
    return '-'
  }
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) {
    return normalized
  }
  return `${normalized.slice(0, maxLength)}...`
}

export default function StoreToKnowledgeBaseDialog(props: Props): JSX.Element | null {
  const {
    isOpen,
    loading,
    options,
    selectedId,
    customerMessage,
    aiReplyMessage,
    onSelect,
    onConfirm,
    onClose
  } = props

  if (!isOpen) {
    return null
  }

  const enabledOptions = options.filter((item) => item.status === 'ENABLED')
  const canConfirm = !!selectedId && !loading

  return (
    <div className={styles.overlay}>
      <div className={styles.dialog}>
        <div className={styles.header}>
          <h3 className={styles.title}>选择知识库并入库</h3>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </div>
        <div className={styles.body}>
          <div className={styles.section}>
            <div className={styles.label}>客户消息</div>
            <div className={styles.preview}>{previewText(customerMessage)}</div>
          </div>
          <div className={styles.section}>
            <div className={styles.label}>AI 回复</div>
            <div className={styles.preview}>{previewText(aiReplyMessage)}</div>
          </div>
          <div className={styles.section}>
            <div className={styles.label}>知识库</div>
            {enabledOptions.length === 0 ? (
              <div className={styles.empty}>暂无可用知识库，请先在知识库管理中启用或创建知识库。</div>
            ) : (
              <div className={styles.optionList}>
                {enabledOptions.map((item) => (
                  <label key={item.id} className={styles.optionItem}>
                    <input
                      type="radio"
                      name="store-kb"
                      checked={selectedId === item.id}
                      onChange={() => onSelect(item.id)}
                    />
                    <div className={styles.optionText}>
                      <div className={styles.optionName}>{item.name}</div>
                      <div className={styles.optionDesc}>{item.description || '无描述'}</div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose} disabled={loading}>取消</button>
          <button className={styles.confirmBtn} onClick={onConfirm} disabled={!canConfirm}>
            {loading ? '入库中...' : '确认入库'}
          </button>
        </div>
      </div>
    </div>
  )
}
