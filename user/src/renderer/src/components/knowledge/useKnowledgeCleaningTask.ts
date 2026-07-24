import { useEffect, useRef, useState } from 'react'
import http from '../../utils/http'

export type CleaningStatus = 'PENDING' | 'PARSING' | 'EXTRACTING' | 'REVIEWING' | 'INDEXING' | 'COMPLETED' | 'FAILED'

export type CleaningQaItem = {
  questions: string[]
  answer: string
  status: 'NORMAL' | 'WARNING' | 'INCOMPLETE'
  warning: string
}

export type CleaningTask = {
  taskId: string
  taskStatus: CleaningStatus
  progressMessage: string
  originalFileName: string
  fileSize: string
  extension: string
  rawTextSummary: string
  items: CleaningQaItem[]
  failedReason: string
  difyDocumentId: string
}

export type CleaningBatchItem = {
  fileName: string
  fileSize: string
  success: boolean
  task: CleaningTask | null
  errorMessage: string
}

export type DirectUploadResult = {
  file: File
  success: boolean
  errorMessage: string
}

const RUNNING_STATUS: CleaningStatus[] = ['PENDING', 'PARSING', 'EXTRACTING', 'INDEXING']
const DIRECT_UPLOAD_DATA = JSON.stringify({
  indexing_technique: 'high_quality',
  process_rule: {
    mode: 'automatic'
  }
})

export function useKnowledgeCleaningTask(knowledgeBaseId: string | null) {
  const [task, setTask] = useState<CleaningTask | null>(null)
  const [batchItems, setBatchItems] = useState<CleaningBatchItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const timerRef = useRef<number | null>(null)
  const batchItemsRef = useRef<CleaningBatchItem[]>([])

  const clearPolling = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const resolveKnowledgeBaseId = (overrideKnowledgeBaseId?: string) => overrideKnowledgeBaseId || knowledgeBaseId

  const applyBatchItems = (items: CleaningBatchItem[]) => {
    batchItemsRef.current = items
    setBatchItems(items)
    setTask(items.find(item => item.task)?.task || null)
  }

  const pollTask = async (taskId: string, overrideKnowledgeBaseId?: string) => {
    const targetKnowledgeBaseId = resolveKnowledgeBaseId(overrideKnowledgeBaseId)
    if (!targetKnowledgeBaseId) return
    const latest = await http.get<CleaningTask>(`/api/user/knowledge-bases/${targetKnowledgeBaseId}/cleaning-tasks/${taskId}`)
    setTask(latest)
    if (!RUNNING_STATUS.includes(latest.taskStatus)) {
      clearPolling()
      setLoading(false)
    }
  }

  const pollBatchTasks = async (overrideKnowledgeBaseId?: string) => {
    const targetKnowledgeBaseId = resolveKnowledgeBaseId(overrideKnowledgeBaseId)
    if (!targetKnowledgeBaseId) return
    const currentItems = batchItemsRef.current
    const updatedItems = await Promise.all(currentItems.map(async (item) => {
      if (!item.success || !item.task || !RUNNING_STATUS.includes(item.task.taskStatus)) {
        return item
      }
      const latest = await http.get<CleaningTask>(`/api/user/knowledge-bases/${targetKnowledgeBaseId}/cleaning-tasks/${item.task.taskId}`)
      return { ...item, task: latest }
    }))
    applyBatchItems(updatedItems)
    const stillRunning = updatedItems.some(item => item.task && RUNNING_STATUS.includes(item.task.taskStatus))
    if (!stillRunning) {
      clearPolling()
      setLoading(false)
    }
  }

  const startPolling = (taskId: string, overrideKnowledgeBaseId?: string) => {
    clearPolling()
    timerRef.current = window.setInterval(() => {
      pollTask(taskId, overrideKnowledgeBaseId).catch((err) => {
        console.error('轮询知识库清洗任务失败', err)
        setError(err?.message || '获取清洗进度失败')
        clearPolling()
        setLoading(false)
      })
    }, 1500)
  }

  const startBatchPolling = (overrideKnowledgeBaseId?: string) => {
    clearPolling()
    timerRef.current = window.setInterval(() => {
      pollBatchTasks(overrideKnowledgeBaseId).catch((err) => {
        console.error('轮询知识库批量清洗任务失败', err)
        setError(err?.message || '获取批量清洗进度失败')
        clearPolling()
        setLoading(false)
      })
    }, 1500)
  }

  const uploadForCleaning = async (file: File, overrideKnowledgeBaseId?: string) => {
    const targetKnowledgeBaseId = resolveKnowledgeBaseId(overrideKnowledgeBaseId)
    if (!targetKnowledgeBaseId) {
      throw new Error('请先保存知识库后再上传文件')
    }
    setError('')
    setLoading(true)
    const payload = new FormData()
    payload.append('file', file)
    const created = await http.postForm<CleaningTask>(`/api/user/knowledge-bases/${targetKnowledgeBaseId}/cleaning-tasks`, payload)
    setTask(created)
    applyBatchItems([{ fileName: created.originalFileName, fileSize: created.fileSize, success: true, task: created, errorMessage: '' }])
    startPolling(created.taskId, targetKnowledgeBaseId)
  }

  const uploadBatchForCleaning = async (files: File[], overrideKnowledgeBaseId?: string) => {
    const targetKnowledgeBaseId = resolveKnowledgeBaseId(overrideKnowledgeBaseId)
    if (!targetKnowledgeBaseId) {
      throw new Error('请先保存知识库后再上传文件')
    }
    if (files.length === 0) return []
    setError('')
    setLoading(true)
    const payload = new FormData()
    files.forEach(file => payload.append('files', file))
    try {
      const createdItems = await http.postForm<CleaningBatchItem[]>(`/api/user/knowledge-bases/${targetKnowledgeBaseId}/cleaning-tasks/batch`, payload)
      applyBatchItems(createdItems)
      const hasRunningTask = createdItems.some(item => item.task && RUNNING_STATUS.includes(item.task.taskStatus))
      if (hasRunningTask) {
        startBatchPolling(targetKnowledgeBaseId)
      } else {
        setLoading(false)
      }
      return createdItems
    } catch (err: any) {
      setError(err?.message || '创建批量清洗任务失败')
      throw err
    } finally {
      if (batchItemsRef.current.length === 0) {
        setLoading(false)
      }
    }
  }

  const uploadDirectly = async (files: File | File[], overrideKnowledgeBaseId?: string): Promise<DirectUploadResult[]> => {
    const targetKnowledgeBaseId = resolveKnowledgeBaseId(overrideKnowledgeBaseId)
    if (!targetKnowledgeBaseId) {
      throw new Error('请先保存知识库后再上传文件')
    }
    const fileList = Array.isArray(files) ? files : [files]
    if (fileList.length === 0) return []
    setError('')
    setLoading(true)
    const results: DirectUploadResult[] = []
    try {
      for (const file of fileList) {
        const payload = new FormData()
        payload.append('data', DIRECT_UPLOAD_DATA)
        payload.append('file', file)
        try {
          await http.postForm(`/api/user/knowledge-bases/${targetKnowledgeBaseId}/files`, payload)
          results.push({ file, success: true, errorMessage: '' })
        } catch (err: any) {
          const message = err?.message || '文件直接上传失败'
          console.error('知识库文件直接上传失败', file.name, err)
          results.push({ file, success: false, errorMessage: message })
        }
      }
      const failedItems = results.filter(item => !item.success)
      if (failedItems.length > 0) {
        setError(`部分文件上传失败：${failedItems.map(item => item.file.name).join('、')}`)
      }
      return results
    } finally {
      setLoading(false)
    }
  }

  const replaceBatchTask = (updatedTask: CleaningTask) => {
    applyBatchItems(batchItemsRef.current.map(item => {
      if (item.task?.taskId !== updatedTask.taskId) return item
      return { ...item, task: updatedTask }
    }))
  }

  const resolveTaskId = (taskId?: string) => taskId || task?.taskId || ''

  const saveItems = async (items: CleaningQaItem[], taskId?: string) => {
    const targetTaskId = resolveTaskId(taskId)
    if (!knowledgeBaseId || !targetTaskId) return
    const updated = await http.put<CleaningTask>(`/api/user/knowledge-bases/${knowledgeBaseId}/cleaning-tasks/${targetTaskId}/items`, { items })
    setTask(updated)
    replaceBatchTask(updated)
  }

  const confirmItems = async (items: CleaningQaItem[], taskId?: string) => {
    const targetTaskId = resolveTaskId(taskId)
    if (!knowledgeBaseId || !targetTaskId) return null
    setLoading(true)
    setError('')
    try {
      const confirmed = await http.post<CleaningTask>(`/api/user/knowledge-bases/${knowledgeBaseId}/cleaning-tasks/${targetTaskId}/confirm`, { items })
      setTask(confirmed)
      replaceBatchTask(confirmed)
      return confirmed
    } catch (err: any) {
      setError(err?.message || '保存至知识库失败')
      throw err
    } finally {
      setLoading(false)
    }
  }

  const resetTask = () => {
    clearPolling()
    setTask(null)
    applyBatchItems([])
    setError('')
    setLoading(false)
  }

  const removeBatchItem = (index: number) => {
    applyBatchItems(batchItemsRef.current.filter((_, currentIndex) => currentIndex !== index))
  }

  useEffect(() => {
    return () => clearPolling()
  }, [])

  return {
    task,
    batchItems,
    loading,
    error,
    setTask,
    uploadForCleaning,
    uploadBatchForCleaning,
    uploadDirectly,
    saveItems,
    confirmItems,
    removeBatchItem,
    resetTask
  }
}
