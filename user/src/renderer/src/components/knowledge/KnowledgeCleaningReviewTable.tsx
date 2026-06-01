import styles from '../../pages/KnowledgeBasePage.module.css'
import type { CleaningQaItem } from './useKnowledgeCleaningTask'
import { Fragment, useEffect, useState } from 'react'

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
  const [activeIndex, setActiveIndex] = useState(-1)

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
      if (current === index) return -1
      return current
    })
  }

  if (items.length === 0) {
    return <div className={styles.reviewEmpty}>AI 暂未提取到问答，请重新清洗或换一个文件。</div>
  }

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
              <Fragment key={`${item.question}-${index}`}>
                <tr
                  className={`${styles[`reviewRow${item.status}`]} ${activeIndex === index ? styles.reviewRowActive : ''}`}
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
                    <div className={styles.reviewRowActions}>
                      <button
                        className={styles.reviewActionButton}
                        title={activeIndex === index ? '收起' : '编辑'}
                        onClick={(event) => {
                          event.stopPropagation()
                          setActiveIndex(current => current === index ? -1 : index)
                        }}
                        type="button"
                      >
                        {activeIndex === index ? '收起' : <EditIcon />}
                      </button>
                      <button
                        className={`${styles.reviewActionButton} ${styles.reviewActionDanger}`}
                        title="删除"
                        onClick={(event) => {
                          event.stopPropagation()
                          deleteItem(index)
                        }}
                        type="button"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </td>
                </tr>
                {activeIndex === index && (
                  <tr className={styles.reviewExpandedRow}>
                    <td colSpan={5}>
                      <div className={styles.reviewInlineEditor}>
                        <div className={styles.reviewEditorHeader}>
                          <div className={styles.reviewEditorTitle}>编辑问答</div>
                          <span className={`${styles.reviewStatus} ${styles[`reviewStatus${item.status}`]}`}>
                            {STATUS_LABEL[item.status]}
                          </span>
                        </div>
                        <div className={styles.reviewInlineGrid}>
                          <div className={styles.reviewReadonlyHint}>
                            <div className={styles.reviewReadonlyTitle}>AI 建议 / 冲突提示</div>
                            <div className={styles.reviewReadonlyText}>{item.warning || '无'}</div>
                          </div>
                          <label className={styles.reviewInlineField}>
                            <span className={styles.reviewEditorLabel}>问题</span>
                            <textarea
                              className={styles.reviewEditorTextarea}
                              value={item.question}
                              onChange={(event) => updateItem(index, { question: event.target.value })}
                            />
                          </label>
                          <label className={styles.reviewInlineField}>
                            <span className={styles.reviewEditorLabel}>答案</span>
                            <textarea
                              className={styles.reviewEditorTextarea}
                              value={item.answer}
                              onChange={(event) => updateItem(index, { answer: event.target.value })}
                            />
                          </label>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const EditIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
)

const TrashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
)
