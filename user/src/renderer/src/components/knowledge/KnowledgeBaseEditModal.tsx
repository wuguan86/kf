import React, { useEffect, useMemo, useState } from 'react'
import http from '../../utils/http'
import styles from '../../pages/KnowledgeBasePage.module.css'
import type { KnowledgeBase, KnowledgeBaseFile } from '../../pages/KnowledgeBasePage'
import KnowledgeFileDropzone from './KnowledgeFileDropzone'
import KnowledgeCleaningReviewTable from './KnowledgeCleaningReviewTable'
import { CleaningQaItem, CleaningTask, useKnowledgeCleaningTask } from './useKnowledgeCleaningTask'

type Props = {
  editingKnowledgeBase: KnowledgeBase | null
  files: KnowledgeBaseFile[]
  onClose: () => void
  onSaved: () => void
  onDeleteFile: (file: KnowledgeBaseFile) => void
  onRefreshFiles: (knowledgeBaseId: string) => void
}

const RUNNING_STATUS: CleaningTask['taskStatus'][] = ['PENDING', 'PARSING', 'EXTRACTING', 'INDEXING']

const STATUS_LABEL: Record<CleaningTask['taskStatus'], string> = {
  PENDING: '等待中',
  PARSING: '解析中',
  EXTRACTING: '提炼中',
  REVIEWING: '待审核',
  INDEXING: '入库中',
  COMPLETED: '已入库',
  FAILED: '失败'
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
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [aiCleaningEnabled, setAiCleaningEnabled] = useState(true)
  const [reviewItems, setReviewItems] = useState<CleaningQaItem[]>([])
  const [activeTaskId, setActiveTaskId] = useState('')
  const cleaning = useKnowledgeCleaningTask(knowledgeBaseId)

  const isRunning = useMemo(() => {
    return cleaning.loading || cleaning.batchItems.some(item => item.task && RUNNING_STATUS.includes(item.task.taskStatus))
  }, [cleaning.batchItems, cleaning.loading])

  const reviewableItems = useMemo(() => {
    return cleaning.batchItems.filter(item => item.success && item.task?.taskStatus === 'REVIEWING')
  }, [cleaning.batchItems])
  const activeBatchItem = useMemo(() => {
    return reviewableItems.find(item => item.task?.taskId === activeTaskId) || reviewableItems[0] || null
  }, [activeTaskId, reviewableItems])
  const activeTask = activeBatchItem?.task || null
  const isReviewing = reviewableItems.length > 0
  const selectedFileCount = selectedFiles.length

  useEffect(() => {
    if (reviewableItems.length === 0) {
      if (activeTaskId) setActiveTaskId('')
      return
    }
    if (!reviewableItems.some(item => item.task?.taskId === activeTaskId)) {
      setActiveTaskId(reviewableItems[0].task?.taskId || '')
    }
  }, [activeTaskId, reviewableItems])

  useEffect(() => {
    if (activeTask?.items) {
      setReviewItems(activeTask.items)
    } else {
      setReviewItems([])
    }
  }, [activeTask?.items, activeTask?.taskId])

  const footerHint = useMemo(() => {
    if (!knowledgeBaseId) return aiCleaningEnabled ? '创建知识库后即可上传文件进行 AI 清洗' : '创建知识库后将直接上传原文件'
    if (isReviewing && activeBatchItem) return `正在审核 ${activeBatchItem.fileName}，确认后写入知识库`
    if (isRunning) return '文件正在处理中，请等待清洗结果'
    if (selectedFileCount > 0 && aiCleaningEnabled) return `将为 ${selectedFileCount} 个文件创建 AI 清洗任务，完成后逐个审核入库`
    if (selectedFileCount > 0 && !aiCleaningEnabled) return `将按原文件直接上传 ${selectedFileCount} 个文件，不做 AI 问答提炼`
    if (cleaning.batchItems.some(item => !item.success || item.task?.taskStatus === 'FAILED')) return '部分文件处理失败，可移除失败项后继续'
    if (cleaning.batchItems.some(item => item.task?.taskStatus === 'COMPLETED')) return '已完成清洗并保存至知识库'
    return editingKnowledgeBase ? '修改现有知识库' : '创建一个新的知识库'
  }, [activeBatchItem, aiCleaningEnabled, cleaning.batchItems, editingKnowledgeBase, isReviewing, isRunning, knowledgeBaseId, selectedFileCount])

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

  const confirmActiveTask = async (kbId: string) => {
    if (!activeTask) return
    await cleaning.saveItems(reviewItems, activeTask.taskId)
    await cleaning.confirmItems(reviewItems, activeTask.taskId)
    await onRefreshFiles(kbId)
  }

  const uploadSelectedFilesDirectly = async (kbId: string) => {
    const results = await cleaning.uploadDirectly(selectedFiles, kbId)
    await onRefreshFiles(kbId)
    const failedFiles = results.filter(item => !item.success).map(item => item.file)
    setSelectedFiles(failedFiles)
    if (failedFiles.length === 0) {
      onSaved()
    }
  }

  const handleMainAction = async () => {
    try {
      setSaving(true)
      const kbId = await saveBaseInfo()
      if (activeTask?.taskStatus === 'REVIEWING') {
        await confirmActiveTask(kbId)
        return
      }
      if (selectedFiles.length > 0) {
        if (aiCleaningEnabled) {
          await cleaning.uploadBatchForCleaning(selectedFiles, kbId)
          setSelectedFiles([])
          return
        }
        await uploadSelectedFilesDirectly(kbId)
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
    if (activeTask?.taskStatus === 'REVIEWING') return '确认当前文件，保存至知识库'
    if (selectedFiles.length > 0 && aiCleaningEnabled) return '下一步：AI 提炼预览'
    if (selectedFiles.length > 0) return `保存并上传 ${selectedFiles.length} 个文件`
    return '保存'
  }

  const canSubmit = !isRunning && !saving && (activeTask?.taskStatus !== 'REVIEWING' || reviewItems.length > 0)

  return (
    <div className={styles.modalOverlay}>
      <div className={`${styles.modalWide} ${isReviewing ? styles.modalReview : ''}`}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>{isReviewing ? 'AI 清洗审核' : (editingKnowledgeBase ? '编辑知识库' : '添加知识库')}</h3>
          <button onClick={onClose} className={styles.closeBtn} disabled={isRunning}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        <div className={`${styles.modalBody} ${isReviewing ? styles.reviewModalBody : ''}`}>
          {isReviewing ? (
            <div className={styles.reviewWorkspace}>
              <div className={styles.reviewBanner}>AI 清洗完成，请按文件逐个确认后入库</div>
              <div className={styles.batchReviewLayout}>
                <div className={styles.batchTaskList}>
                  {cleaning.batchItems.map((item, index) => (
                    <div
                      key={`${item.fileName}-${index}`}
                      className={`${styles.batchTaskItem} ${item.task?.taskId === activeTask?.taskId ? styles.batchTaskItemActive : ''}`}
                      onClick={() => item.task?.taskStatus === 'REVIEWING' && setActiveTaskId(item.task.taskId)}
                    >
                      <div className={styles.batchTaskName}>{item.fileName}</div>
                      <div className={styles.batchTaskMeta}>
                        {formatFileSize(item.fileSize)} · {resolveBatchStatusLabel(item)}
                      </div>
                      {(!item.success || item.task?.taskStatus === 'FAILED') && (
                        <div className={styles.batchTaskError}>{item.errorMessage || item.task?.failedReason || '清洗失败'}</div>
                      )}
                      {(!item.success || item.task?.taskStatus === 'FAILED') && (
                        <button
                          type="button"
                          className={styles.batchTaskRemoveBtn}
                          onClick={(event) => {
                            event.stopPropagation()
                            cleaning.removeBatchItem(index)
                          }}
                        >
                          移除
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <div className={styles.batchReviewPanel}>
                  {activeTask ? (
                    <KnowledgeCleaningReviewTable items={reviewItems} onChange={setReviewItems} />
                  ) : (
                    <div className={styles.reviewEmpty}>请选择一个待审核文件。</div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <>
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
                <div className={styles.knowledgeFileHeader}>
                  <span className={styles.label}>知识文件</span>
                  <button
                    type="button"
                    className={styles.aiCleaningInlineToggle}
                    onClick={() => {
                      cleaning.resetTask()
                      setReviewItems([])
                      setAiCleaningEnabled(prev => !prev)
                    }}
                    disabled={isRunning}
                    title={aiCleaningEnabled ? '开启后先生成 AI 提炼预览，确认后再入库。' : '关闭后将按原文件直接上传。'}
                    aria-pressed={aiCleaningEnabled}
                    aria-label="切换 AI 清洗"
                  >
                    <span>AI 清洗</span>
                    <span className={`${styles.switchComponent} ${aiCleaningEnabled ? styles.switchComponentActive : ''}`}>
                      <span className={styles.switchKnob} />
                    </span>
                  </button>
                </div>
                <KnowledgeFileDropzone
                  disabled={isRunning}
                  selectedFiles={selectedFiles}
                  onSelect={(files) => {
                    cleaning.resetTask()
                    setReviewItems([])
                    setSelectedFiles(prev => [...prev, ...files])
                  }}
                  onRemove={(index) => setSelectedFiles(prev => prev.filter((_, currentIndex) => currentIndex !== index))}
                  onClear={() => setSelectedFiles([])}
                />

                {cleaning.batchItems.length > 0 && (
                  <div className={styles.filesWrapper}>
                    {cleaning.batchItems.map((item, index) => (
                      <div key={`${item.fileName}-${index}`} className={`${styles.fileItem} ${(!item.success || item.task?.taskStatus === 'FAILED') ? styles.fileItemError : ''}`}>
                        <div className={styles.fileIcon}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                        </div>
                        <div className={styles.fileInfo}>
                          <div className={styles.fileName}>{item.fileName}</div>
                          <div className={styles.fileMeta}>{formatFileSize(item.fileSize)} · {resolveBatchStatusLabel(item)}</div>
                          {(!item.success || item.task?.taskStatus === 'FAILED') && (
                            <div className={styles.fileErrorText}>{item.errorMessage || item.task?.failedReason || '清洗失败'}</div>
                          )}
                        </div>
                        {(!item.success || item.task?.taskStatus === 'FAILED') && (
                          <button className={`${styles.iconBtn} ${styles.deleteBtn}`} onClick={() => cleaning.removeBatchItem(index)} title="移除失败项">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

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

                {cleaning.error && <div className={`${styles.uploadStatus} ${styles.uploadStatusError}`}>{cleaning.error}</div>}
              </div>
            </>
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

function resolveBatchStatusLabel(item: { success: boolean, task: CleaningTask | null, errorMessage: string }) {
  if (!item.success) return '创建失败'
  if (!item.task) return item.errorMessage || '未知状态'
  return STATUS_LABEL[item.task.taskStatus] || item.task.taskStatus
}

function formatFileSize(value: string) {
  const size = Number(value || 0)
  if (!Number.isFinite(size) || size <= 0) return '0.00 MB'
  return `${(size / 1024 / 1024).toFixed(2)} MB`
}
