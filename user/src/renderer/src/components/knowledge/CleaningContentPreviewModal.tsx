import { useState } from 'react'
import styles from '../../pages/KnowledgeBasePage.module.css'
import type { CleaningQaItem } from './useKnowledgeCleaningTask'

type Props = {
  fileName: string
  items: CleaningQaItem[]
  onClose: () => void
}

const STATUS_LABEL: Record<CleaningQaItem['status'], string> = {
  NORMAL: '正常',
  WARNING: '有冲突',
  INCOMPLETE: '不完整'
}

export default function CleaningContentPreviewModal({ fileName, items, onClose }: Props): JSX.Element {
  const [expandedIndex, setExpandedIndex] = useState(-1)

  const normalCount = items.filter(item => item.status === 'NORMAL').length
  const warningCount = items.filter(item => item.status === 'WARNING').length
  const incompleteCount = items.filter(item => item.status === 'INCOMPLETE').length

  const toggleExpand = (index: number) => {
    setExpandedIndex(current => current === index ? -1 : index)
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div
        className={`${styles.modalWide} ${styles.modalReview}`}
        onClick={event => event.stopPropagation()}
        style={{ height: '80vh', maxHeight: '80vh' }}
      >
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>清洗内容预览 · {fileName}</h3>
          <button onClick={onClose} className={styles.closeBtn}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.previewStats}>
            <span>共 {items.length} 条问答</span>
            {normalCount > 0 && (
              <span className={styles.reviewStatusNORMAL}>正常 {normalCount}</span>
            )}
            {warningCount > 0 && (
              <span className={styles.reviewStatusWARNING}>有冲突 {warningCount}</span>
            )}
            {incompleteCount > 0 && (
              <span className={styles.reviewStatusINCOMPLETE}>不完整 {incompleteCount}</span>
            )}
          </div>

          {items.length === 0 ? (
            <div className={styles.previewError}>该文件没有清洗内容，可能是在清洗功能上线前上传的。</div>
          ) : (
            <div className={styles.previewQaList}>
              {items.map((item, index) => {
                const isExpanded = expandedIndex === index
                return (
                  <div
                    key={`${item.question}-${index}`}
                    className={styles.previewQaCard}
                    onClick={() => toggleExpand(index)}
                  >
                    <div className={styles.previewQaHeader}>
                      <div className={styles.previewQaIndex}>{index + 1}</div>
                      <div className={styles.previewQaBody}>
                        <div className={styles.previewQaRow}>
                          <span className={styles.previewQaLabel}>Q：</span>
                          <span className={styles.previewQaText}>
                            {isExpanded ? item.question : truncate(item.question, 80)}
                          </span>
                        </div>
                        <div className={styles.previewQaRow}>
                          <span className={styles.previewQaLabel}>A：</span>
                          <span className={styles.previewQaText}>
                            {isExpanded ? item.answer : truncate(item.answer, 80)}
                          </span>
                        </div>
                      </div>
                      <span className={`${styles.reviewStatus} ${styles[`reviewStatus${item.status}`]}`}>
                        {STATUS_LABEL[item.status]}
                      </span>
                    </div>
                    {isExpanded && (
                      <div className={styles.previewQaExpanded}>
                        <div className={styles.previewQaRow}>
                          <span className={styles.previewQaLabel}>问题：</span>
                          <div className={styles.previewQaText}>{item.question}</div>
                        </div>
                        <div className={styles.previewQaRow}>
                          <span className={styles.previewQaLabel}>答案：</span>
                          <div className={styles.previewQaText}>{item.answer}</div>
                        </div>
                        {item.warning && (
                          <div className={styles.previewQaRow}>
                            <span className={styles.previewQaLabel}>AI 提示：</span>
                            <div className={styles.previewQaText} style={{ color: '#92400e' }}>{item.warning}</div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
        <div className={styles.modalFooter}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            点击问答卡片可展开查看完整内容
          </div>
          <div className={styles.modalActions}>
            <button className={styles.ghostBtn} onClick={onClose}>关闭</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function truncate(text: string, maxLength: number): string {
  if (!text) return ''
  return text.length > maxLength ? text.slice(0, maxLength) + '…' : text
}
