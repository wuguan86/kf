import { useEffect, useRef, useState } from 'react'
import http from '../../utils/http'

export type CleaningStatus = 'PENDING' | 'PARSING' | 'EXTRACTING' | 'REVIEWING' | 'INDEXING' | 'COMPLETED' | 'FAILED'

export type CleaningQaItem = {
  question: string
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

const RUNNING_STATUS: CleaningStatus[] = ['PENDING', 'PARSING', 'EXTRACTING', 'INDEXING']

export function useKnowledgeCleaningTask(knowledgeBaseId: string | null) {
  const [task, setTask] = useState<CleaningTask | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const timerRef = useRef<number | null>(null)

  const clearPolling = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const pollTask = async (taskId: string) => {
    if (!knowledgeBaseId) return
    const latest = await http.get<CleaningTask>(`/api/user/knowledge-bases/${knowledgeBaseId}/cleaning-tasks/${taskId}`)
    setTask(latest)
    if (!RUNNING_STATUS.includes(latest.taskStatus)) {
      clearPolling()
      setLoading(false)
    }
  }

  const startPolling = (taskId: string) => {
    clearPolling()
    timerRef.current = window.setInterval(() => {
      pollTask(taskId).catch((err) => {
        console.error('轮询知识库清洗任务失败', err)
        setError(err?.message || '获取清洗进度失败')
        clearPolling()
        setLoading(false)
      })
    }, 1500)
  }

  const uploadForCleaning = async (file: File) => {
    if (!knowledgeBaseId) {
      throw new Error('请先保存知识库后再上传文件')
    }
    setError('')
    setLoading(true)
    const payload = new FormData()
    payload.append('file', file)
    const created = await http.postForm<CleaningTask>(`/api/user/knowledge-bases/${knowledgeBaseId}/cleaning-tasks`, payload)
    setTask(created)
    startPolling(created.taskId)
  }

  const saveItems = async (items: CleaningQaItem[]) => {
    if (!knowledgeBaseId || !task) return
    const updated = await http.put<CleaningTask>(`/api/user/knowledge-bases/${knowledgeBaseId}/cleaning-tasks/${task.taskId}/items`, { items })
    setTask(updated)
  }

  const confirmItems = async (items: CleaningQaItem[]) => {
    if (!knowledgeBaseId || !task) return null
    setLoading(true)
    setError('')
    try {
      const confirmed = await http.post<CleaningTask>(`/api/user/knowledge-bases/${knowledgeBaseId}/cleaning-tasks/${task.taskId}/confirm`, { items })
      setTask(confirmed)
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
    setError('')
    setLoading(false)
  }

  useEffect(() => {
    return () => clearPolling()
  }, [])

  return {
    task,
    loading,
    error,
    setTask,
    uploadForCleaning,
    saveItems,
    confirmItems,
    resetTask
  }
}
