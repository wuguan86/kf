import React, { useEffect, useMemo, useState } from 'react'
import http from '../../utils/http'
import styles from '../../pages/KnowledgeBasePage.module.css'
import type { KnowledgeBase, KnowledgeBaseFile } from '../../pages/KnowledgeBasePage'
import KnowledgeFileDropzone from './KnowledgeFileDropzone'
import KnowledgeCleaningReviewTable from './KnowledgeCleaningReviewTable'
import { CleaningQaItem, useKnowledgeCleaningTask } from './useKnowledgeCleaningTask'

type Props = {
  editingKnowledgeBase: KnowledgeBase | null
  files: KnowledgeBaseFile[]
  onClose: () => void
  onSaved: () => void
  onDeleteFile: (file: KnowledgeBaseFile) => void
  onRefreshFiles: (knowledgeBaseId: string) => void
}

export default function KnowledgeBaseEditModal(props: Props): JSX.Element {
  const {
    editingKnowledgeBase,
    files,
    onClose,
    onSaved,
    onDeleteFile,
    onRefreshFiles
  } = props
  const [formData, setFormData] = useState({
    name: editingKnowledgeBase?.name || '',
    description: editingKnowledgeBase?.description || '',
    permission: editingKnowledgeBase?.permission || 'only_me',
    status: editingKnowledgeBase?.status || 'ENABLED'
  })
  const [knowledgeBaseId, setKnowledgeBaseId] = useState<string | null>(editingKnowledgeBase?.id || null)
  const [saving, setSaving] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [reviewItems, setReviewItems] = useState<CleaningQaItem[]>([])
  const cleaning = useKnowledgeCleaningTask(knowledgeBaseId)

  useEffect(() => {
    if (cleaning.task?.items) {
      setReviewItems(cleaning.task.items)
    }
  }, [cleaning.task?.taskId, cleaning.task?.items])

  const isRunning = useMemo(() => {
    return cleaning.loading || ['PENDING', 'PARSING', 'EXTRACTING', 'INDEXING'].includes(cleaning.task?.taskStatus || '')
  }, [cleaning.loading, cleaning.task?.taskStatus])

  const footerHint = useMemo(() => {
    if (!knowledgeBaseId) return '创建知识库后即可上传文件进行 AI 清洗'
    if (cleaning.task?.taskStatus === 'REVIEWING') return '请确认或修改 AI 提取的问答后入库'
    if (cleaning.task?.taskStatus === 'COMPLETED') return '已保存为清洗后的知识库文档'
    if (cleaning.task?.taskStatus === 'FAILED') return '清洗失败，可重新选择文件清洗'
    return editingKnowledgeBase ? '修改现有知识库' : '创建一个新的知识库'
  }, [cleaning.task?.taskStatus, editingKnowledgeBase, knowledgeBaseId])

  const saveBaseInfo = async (): Promise<string> => {
    if (!formData.name.trim()) {
      throw new Error('请输入知识库名称')
    }
    if (knowledgeBaseId) {
      await http.put(`/api/user/knowledge-bases/${knowledgeBaseId}`, formData)
      return knowledgeBaseId
    }
    const created = await http.post<KnowledgeBase>('/api/user/knowledge-bases', formData)
    setKnowledgeBaseId(created.id)
    return created.id
  }

  const handleMainAction = async () => {
    try {
      setSaving(true)
      const kbId = await saveBaseInfo()
      if (cleaning.task?.taskStatus === 'REVIEWING') {
        await cleaning.saveItems(reviewItems)
        await cleaning.confirmItems(reviewItems)
        await onRefreshFiles(kbId)
        setSelectedFile(null)
        return
      }
      if (selectedFile) {
        await cleaning.uploadForCleaning(selectedFile)
        return
      }
      onSaved()
    } catch (error: any) {
      alert(error?.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const buttonText = () => {
    if (isRunning || saving) return '处理中...'
    if (cleaning.task?.taskStatus === 'REVIEWING') return '确认无误，保存至知识库'
    if (cleaning.task?.taskStatus === 'FAILED') return '重新清洗'
    return '保存'
  }

  const canSubmit = !isRunning && !saving && (cleaning.task?.taskStatus !== 'REVIEWING' || reviewItems.length > 0)

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalWide}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>{editingKnowledgeBase ? '编辑知识库' : '添加知识库'}</h3>
          <button onClick={onClose} className={styles.closeBtn} disabled={isRunning}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.formGroup}>
            <label className={styles.label}>名称 <span style={{ color: '#ef4444' }}>*</span></label>
            <input
              className={styles.input}
              placeholder="请输入知识库名称"
              value={formData.name}
              maxLength={128}
              onChange={event => setFormData(prev => ({ ...prev, name: event.target.value }))}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>描述</label>
            <textarea
              className={styles.textarea}
              placeholder="请输入知识库描述（可选）"
              rows={3}
              value={formData.description}
              onChange={event => setFormData(prev => ({ ...prev, description: event.target.value }))}
            />
          </div>

          <div className={styles.formDivider} />

          <div className={styles.formGroup}>
            <label className={styles.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>知识文件</span>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 'normal' }}>
                支持 PDF、Word、TXT、MD、Excel（单个 &lt; 10MB）
              </span>
            </label>
            <KnowledgeFileDropzone
              disabled={isRunning}
              selectedFile={selectedFile}
              onSelect={(file) => {
                cleaning.resetTask()
                setReviewItems([])
                setSelectedFile(file)
              }}
              onClear={() => setSelectedFile(null)}
            />

            {files.length > 0 && (
              <div className={styles.filesWrapper}>
                {files.map(file => (
                  <div key={file.id} className={styles.fileItem}>
                    <div className={styles.fileIcon}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                    </div>
                    <div className={styles.fileInfo}>
                      <div className={styles.fileName}>{file.name}</div>
                      <div className={styles.fileMeta}>已入库 · {(Number(file.fileSize || 0) / 1024 / 1024).toFixed(2)} MB · {file.indexingStatus || 'waiting'}</div>
                    </div>
                    <button className={`${styles.iconBtn} ${styles.deleteBtn}`} onClick={() => onDeleteFile(file)} title="删除文件">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {cleaning.task && (
              <div className={`${styles.uploadStatus} ${cleaning.task.taskStatus === 'FAILED' ? styles.uploadStatusError : ''}`}>
                {isRunning && <div className={styles.spinner} />}
                {cleaning.task.progressMessage || cleaning.task.taskStatus}
                {cleaning.task.failedReason ? `：${cleaning.task.failedReason}` : ''}
              </div>
            )}
            {cleaning.error && <div className={`${styles.uploadStatus} ${styles.uploadStatusError}`}>{cleaning.error}</div>}
          </div>

          {cleaning.task?.taskStatus === 'REVIEWING' && (
            <div className={styles.formGroup}>
              <label className={styles.label}>AI 清洗审核</label>
              <KnowledgeCleaningReviewTable items={reviewItems} onChange={setReviewItems} />
            </div>
          )}
        </div>
        <div className={styles.modalFooter}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{footerHint}</div>
          <div className={styles.modalActions}>
            <button className={styles.ghostBtn} onClick={onClose} disabled={isRunning}>取消</button>
            <button
              className={styles.primaryBtn}
              onClick={handleMainAction}
              disabled={!canSubmit}
              style={{ opacity: canSubmit ? 1 : 0.7 }}
            >
              {buttonText()}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
