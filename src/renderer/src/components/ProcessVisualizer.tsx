import React, { useEffect, useRef } from 'react'
import styles from './ProcessVisualizer.module.css'

export type ProcessStep = 'INTENT' | 'KNOWLEDGE' | 'LOGIC' | 'OUTPUT'

export interface ProcessItem {
  id: string
  step: ProcessStep
  content: string
  status: 'pending' | 'running' | 'completed'
  timestamp: string
}

export interface ProcessVisualizerProps {
  items: ProcessItem[]
  managedMode?: 'full' | 'semi'
  onUpdateItem?: (id: string, newContent: string) => void
  onStoreItem?: (id: string, content: string) => void
}

const StepIcons: Record<ProcessStep, React.ReactNode> = {
  INTENT: (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
  ),
  KNOWLEDGE: (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
  ),
  LOGIC: (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5"/><path d="M8.5 8.5v.01"/><path d="M16 12v.01"/><path d="M12 16v.01"/><path d="M12 2v4"/><path d="M12 18v4"/><path d="M4.93 4.93l2.83 2.83"/><path d="M16.24 16.24l2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="M4.93 19.07l2.83-2.83"/><path d="M16.24 7.76l2.83-2.83"/></svg>
  ),
  OUTPUT: (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
  )
}

const ActionIcons = {
  COPY: (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
  ),
  EDIT: (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
  ),
  STORE: (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
  ),
  CHECK: (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
  ),
  X: (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
  )
}

const LoadingIcon = (
  <svg className={styles.animateSpin} xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
)

export const ProcessVisualizer: React.FC<ProcessVisualizerProps> = ({ items, managedMode = 'full', onUpdateItem, onStoreItem }) => {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [editContent, setEditContent] = React.useState('')
  const [copiedId, setCopiedId] = React.useState<string | null>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [items])

  const handleCopy = (id: string, content: string) => {
    navigator.clipboard.writeText(content)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleStartEdit = (item: ProcessItem) => {
    setEditingId(item.id)
    setEditContent(item.content)
  }

  const handleSaveEdit = (id: string) => {
    if (onUpdateItem) {
      onUpdateItem(id, editContent)
    }
    setEditingId(null)
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditContent('')
  }

  const handleStore = (item: ProcessItem) => {
    if (onStoreItem) {
      onStoreItem(item.id, item.content)
    }
  }

  if (items.length === 0) {
    return (
      <div className={styles.processVisualizerEmpty}>
        <div className={styles.emptyContent}>
          <div className={styles.emptyIcon}>
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          </div>
          <p>启动后，收到的微信消息会出现在这里...</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.processVisualizer} ref={scrollRef}>
      <div className={styles.processTimeline}>
        {items.map((item) => {
          const isEditing = editingId === item.id
          const showActions = managedMode === 'semi' && item.step === 'OUTPUT' && item.status === 'completed' && !isEditing

          return (
            <div key={item.id} className={`${styles.processStep} ${styles[item.step.toLowerCase()]}`}>
              <div className={styles.processIconWrapper}>
                {item.status === 'running' ? LoadingIcon : StepIcons[item.step]}
              </div>
              <div className={styles.processContent}>
                <div className={styles.processHeader}>
                  <span className={styles.stepName}>{item.step}</span>
                  <span className={styles.timestamp}>{item.timestamp}</span>
                </div>
                <div className={styles.processBody}>
                  {isEditing ? (
                    <div className={styles.editArea}>
                      <textarea
                        className={styles.editTextarea}
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        autoFocus
                      />
                      <div className={styles.editActions}>
                        <button className={`${styles.actionBtn} ${styles.cancelBtn}`} onClick={handleCancelEdit}>
                          {ActionIcons.X} 取消
                        </button>
                        <button className={`${styles.actionBtn} ${styles.saveBtn}`} onClick={() => handleSaveEdit(item.id)}>
                          {ActionIcons.CHECK} 确定
                        </button>
                      </div>
                    </div>
                  ) : (
                    item.content
                  )}
                </div>

                {showActions && (
                  <div className={styles.actionBar}>
                    <button
                      className={`${styles.actionBtn} ${copiedId === item.id ? styles.active : ''}`}
                      onClick={() => handleCopy(item.id, item.content)}
                    >
                      {ActionIcons.COPY} {copiedId === item.id ? '已复制' : '复制'}
                    </button>
                    <button className={styles.actionBtn} onClick={() => handleStartEdit(item)}>
                      {ActionIcons.EDIT} 编辑
                    </button>
                    <button className={styles.actionBtn} onClick={() => handleStore(item)}>
                      {ActionIcons.STORE} 入库
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
