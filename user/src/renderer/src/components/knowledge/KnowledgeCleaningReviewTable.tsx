import styles from '../../pages/KnowledgeBasePage.module.css'
import type { CleaningQaItem } from './useKnowledgeCleaningTask'

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
  const updateItem = (index: number, patch: Partial<CleaningQaItem>) => {
    onChange(items.map((item, currentIndex) => currentIndex === index ? { ...item, ...patch } : item))
  }

  const deleteItem = (index: number) => {
    onChange(items.filter((_, currentIndex) => currentIndex !== index))
  }

  if (items.length === 0) {
    return <div className={styles.reviewEmpty}>AI 暂未提取到问答，请重新清洗或换一个文件。</div>
  }

  return (
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
            <tr key={`${item.question}-${index}`} className={styles[`reviewRow${item.status}`]}>
              <td>
                <span className={`${styles.reviewStatus} ${styles[`reviewStatus${item.status}`]}`}>
                  {STATUS_LABEL[item.status]}
                </span>
              </td>
              <td>
                <textarea
                  className={styles.reviewTextarea}
                  value={item.question}
                  onChange={(event) => updateItem(index, { question: event.target.value })}
                />
              </td>
              <td>
                <textarea
                  className={styles.reviewTextarea}
                  value={item.answer}
                  onChange={(event) => updateItem(index, { answer: event.target.value })}
                />
              </td>
              <td>
                <textarea
                  className={styles.reviewTextarea}
                  value={item.warning}
                  placeholder="无"
                  onChange={(event) => updateItem(index, { warning: event.target.value })}
                />
              </td>
              <td>
                <button className={`${styles.iconBtn} ${styles.deleteBtn}`} onClick={() => deleteItem(index)} title="删除">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path></svg>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
