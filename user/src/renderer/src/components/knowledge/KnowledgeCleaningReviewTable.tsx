import styles from '../../pages/KnowledgeBasePage.module.css'
import type { CleaningQaItem } from './useKnowledgeCleaningTask'
import { useEffect, useState } from 'react'

type Props = {
  items: CleaningQaItem[]
  onChange: (items: CleaningQaItem[]) => void
}

const STATUS_LABEL: Record<CleaningQaItem['status'], string> = {
  NORMAL: '正常',
  WARNING: '有冲突',
  INCOMPLETE: '不完整'
}

export default function KnowledgeCleaningReviewTable({ items, onChange }: Props): JSX.Element {
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    if (activeIndex > items.length - 1) {
      setActiveIndex(Math.max(items.length - 1, 0))
    }
  }, [activeIndex, items.length])

  const updateItem = (index: number, patch: Partial<CleaningQaItem>) => {
    onChange(items.map((item, currentIndex) => currentIndex === index ? { ...item, ...patch } : item))
  }

  const deleteItem = (index: number) => {
    onChange(items.filter((_, currentIndex) => currentIndex !== index))
    setActiveIndex(current => {
      if (current > index) return current - 1
      if (current === index) return Math.max(index - 1, 0)
      return current
    })
  }

  if (items.length === 0) {
    return <div className={styles.reviewEmpty}>AI 暂未提取到问答，请重新清洗或换一个文件。</div>
  }

  const activeItem = items[activeIndex]

  return (
    <div className={styles.reviewLayout}>
      <div className={styles.reviewTableWrapper}>
        <table className={styles.reviewTable}>
          <thead>
            <tr>
              <th>状态</th>
              <th>问(Q)</th>
              <th>答(A)</th>
              <th>AI 建议 / 冲突提示</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr
                key={`${item.question}-${index}`}
                className={`${styles[`reviewRow${item.status}`]} ${activeIndex === index ? styles.reviewRowActive : ''}`}
                onClick={() => setActiveIndex(index)}
              >
                <td>
                  <span className={`${styles.reviewStatus} ${styles[`reviewStatus${item.status}`]}`}>
                    {STATUS_LABEL[item.status]}
                  </span>
                </td>
                <td>
                  <div className={styles.reviewCellPreview} title={item.question}>{item.question}</div>
                </td>
                <td>
                  <div className={styles.reviewCellPreview} title={item.answer}>{item.answer}</div>
                </td>
                <td>
                  <div className={styles.reviewCellPreview} title={item.warning || '无'}>{item.warning || '无'}</div>
                </td>
                <td>
                  <button className={`${styles.iconBtn} ${styles.deleteBtn}`} onClick={(event) => {
                    event.stopPropagation()
                    deleteItem(index)
                  }} title="删除">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path></svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {activeItem && (
        <aside className={styles.reviewEditor}>
          <div className={styles.reviewEditorHeader}>
            <div className={styles.reviewEditorTitle}>编辑问答</div>
            <span className={`${styles.reviewStatus} ${styles[`reviewStatus${activeItem.status}`]}`}>
              {STATUS_LABEL[activeItem.status]}
            </span>
          </div>
          <label className={styles.reviewEditorLabel}>问题</label>
          <textarea
            className={styles.reviewEditorTextarea}
            value={activeItem.question}
            onChange={(event) => updateItem(activeIndex, { question: event.target.value })}
          />
          <label className={styles.reviewEditorLabel}>答案</label>
          <textarea
            className={styles.reviewEditorTextarea}
            value={activeItem.answer}
            onChange={(event) => updateItem(activeIndex, { answer: event.target.value })}
          />
          <label className={styles.reviewEditorLabel}>AI 建议 / 冲突提示</label>
          <textarea
            className={styles.reviewEditorTextarea}
            value={activeItem.warning}
            placeholder="无"
            onChange={(event) => updateItem(activeIndex, { warning: event.target.value })}
          />
        </aside>
      )}
    </div>
  )
}
