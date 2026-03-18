import React, { useEffect, useRef, useState } from 'react'
import http from '../utils/http'
import { readAuthSnapshot } from '../auth/authStore'
import { ProcessVisualizer, ProcessItem, ProcessStep } from '../components/ProcessVisualizer'
import StoreToKnowledgeBaseDialog, { SelectableKnowledgeBase } from '../components/StoreToKnowledgeBaseDialog'
import { Toast, useToast } from '../components/Toast'
import styles from './AssistantPage.module.css'
import { AppConfig } from '../config'

type CaptureBounds = { x: number; y: number; w: number; h: number }
type Role = { id: number; name: string; content: string; status: string }
type SessionConfig = {
  sceneConfig: {
    replyIntervalStartSec: number
    replyIntervalEndSec: number
  }
}
type MarketingLikeConfig = {
  enabled: boolean
  likeIntervalStart: number
  likeIntervalEnd: number
  maxDailyLikesPerFriend: number
  maxDailyTotalLikes: number
  keywordFilter: string[]
}
type MarketingCommentConfig = {
  enabled: boolean
  commentIntervalStart: number
  commentIntervalEnd: number
  maxDailyCommentsPerFriend: number
  maxDailyTotalComments: number
  keywordFilter: string[]
}
type ChatMessage = {
  id: string
  contact: string
  content: string
  isSelf: boolean
  timestamp: number
}
type StoreContext = {
  itemId: string
  contactKey: string
  customerMessage: string
  aiReplyMessage: string
}

const MONITOR_INTERVAL_MIN = 500
const MONITOR_INTERVAL_MAX = 1000
const PIXEL_DIFF_THRESHOLD = 30
const CHANGE_RATIO_THRESHOLD = 0.015
const SAMPLE_STEP = 4

const getNextMonitorDelay = (): number => {
  return Math.floor(MONITOR_INTERVAL_MIN + Math.random() * (MONITOR_INTERVAL_MAX - MONITOR_INTERVAL_MIN))
}

const getItemCenterY = (item: any): number => {
  return (item.box[0][1] + item.box[2][1]) / 2
}

const getItemCenterX = (item: any): number => {
  return (item.box[0][0] + item.box[2][0]) / 2
}

const clamp = (value: number, min: number, max: number): number => {
  if (value < min) return min
  if (value > max) return max
  return value
}

const getItemText = (item: any): string => {
  return (item?.text ?? '').toString()
}

const getItemScore = (item: any): number | null => {
  const score = item?.score ?? item?.confidence ?? item?.probability
  return typeof score === 'number' ? score : null
}

const getItemHeight = (item: any): number => {
  if (!item?.box) return 0
  return Math.abs(item.box[2][1] - item.box[0][1])
}

const getItemWidth = (item: any): number => {
  if (!item?.box) return 0
  return Math.abs(item.box[2][0] - item.box[0][0])
}

const getAverageItemHeight = (items: any[]): number => {
  if (!items || items.length === 0) return 0
  const heights = items.map(getItemHeight).filter((h) => h > 0)
  if (heights.length === 0) return 0
  const sum = heights.reduce((acc, h) => acc + h, 0)
  return sum / heights.length
}

const findSendButtonItem = (items: any[]): any | null => {
  if (!items || items.length === 0) return null
  return items.find((item) => {
    const text = getItemText(item)
    return text.includes('发送') || text.toLowerCase().includes('send')
  }) || null
}

const isNoiseText = (text: string): boolean => {
  const trimmed = text.replace(/\s+/g, '').replace(/\u200B/g, '')
  if (!trimmed) return true
  if (/^[%?·•*#@]+$/.test(trimmed)) return true
  if (trimmed.length === 1 && !/[\u4e00-\u9fff]/.test(trimmed)) return true
  return false
}

const isNoiseItem = (item: any, avgHeight: number): boolean => {
  const text = getItemText(item)
  const trimmed = text.replace(/\s+/g, '').replace(/\u200B/g, '')
  if (!trimmed) return true
  if (/^[%?·•*#@]+$/.test(trimmed)) return true
  const score = getItemScore(item)
  if (score !== null && score < 0.45) return true
  if (trimmed.length === 1) {
    if (!/[\u4e00-\u9fff]/.test(trimmed)) return true
    const height = getItemHeight(item)
    const width = getItemWidth(item)
    if (avgHeight > 0 && (height < avgHeight * 0.6 || width < avgHeight * 0.6)) return true
  }
  return false
}

const getAdaptiveBottomThreshold = (items: any[], height: number): number => {
  if (!items || items.length < 4) return height * 0.88
  const centers = items.map(getItemCenterY).sort((a, b) => a - b)
  const span = centers[centers.length - 1] - centers[0]
  const avgGap = span / Math.max(1, centers.length - 1)
  let maxGap = 0
  let threshold = height * 0.88
  for (let i = 1; i < centers.length; i += 1) {
    const gap = centers[i] - centers[i - 1]
    if (gap > maxGap && centers[i] > height * 0.4) {
      maxGap = gap
      threshold = (centers[i] + centers[i - 1]) / 2
    }
  }
  if (maxGap > Math.max(20, avgGap * 2)) {
    return threshold
  }
  return height * 0.88
}

type Props = {
  backendBaseUrl: string
  tenantId: string
  userToken: string
  onNavigateSettings: () => void
  onLogout?: () => void
}

const getBottomThreshold = (items: any[], height: number): number => {
  const sendBtn = items.find((item) => item.text.includes('发送') || item.text.includes('Send'))
  if (sendBtn) {
    return sendBtn.box[0][1]
  }
  return getAdaptiveBottomThreshold(items, height)
}

const getCleanText = (items: any[], bounds: any, realImageSize?: { w: number; h: number }): string => {
  if (!items || items.length === 0 || !bounds) return ''

  const dpr = window.devicePixelRatio || 1
  const height = realImageSize ? realImageSize.h : bounds.h * dpr
  const bottomThreshold = getBottomThreshold(items, height)
  const avgHeight = getAverageItemHeight(items.filter((item) => {
    const text = getItemText(item)
    return !(text.includes('发送') || text.toLowerCase().includes('send'))
  }))

  const contentItems = items.filter((item) => {
    const text = getItemText(item)
    if (text.includes('发送') || text.includes('Send')) return false

    const itemCenterY = getItemCenterY(item)
    if (itemCenterY > bottomThreshold) {
      return false
    }
    if (isNoiseItem(item, avgHeight)) return false
    return true
  })

  contentItems.sort((a, b) => {
    const centerY_a = (a.box[0][1] + a.box[2][1]) / 2
    const centerY_b = (b.box[0][1] + b.box[2][1]) / 2
    return centerY_a - centerY_b
  })

  return contentItems.map((item) => item.text).join('\n')
}

const normalizeMessage = (text: string): string => {
  return text.replace(/\s+/g, ' ').replace(/\u200B/g, '').trim()
}

const normalizeLikeConfig = (raw: any): MarketingLikeConfig => {
  const start = Math.max(1, Number(raw?.likeIntervalStart ?? 60) || 60)
  const endCandidate = Math.max(1, Number(raw?.likeIntervalEnd ?? start) || start)
  const end = endCandidate < start ? start : endCandidate
  return {
    enabled: Boolean(raw?.enabled),
    likeIntervalStart: start,
    likeIntervalEnd: end,
    maxDailyLikesPerFriend: Math.max(1, Number(raw?.maxDailyLikesPerFriend ?? 3) || 3),
    maxDailyTotalLikes: Math.max(1, Number(raw?.maxDailyTotalLikes ?? 100) || 100),
    keywordFilter: Array.isArray(raw?.keywordFilter) ? raw.keywordFilter.map((item: any) => String(item)) : []
  }
}

const normalizeCommentConfig = (raw: any): MarketingCommentConfig => {
  const start = Math.max(1, Number(raw?.commentIntervalStart ?? 120) || 120)
  const endCandidate = Math.max(1, Number(raw?.commentIntervalEnd ?? start) || start)
  const end = endCandidate < start ? start : endCandidate
  return {
    enabled: Boolean(raw?.enabled),
    commentIntervalStart: start,
    commentIntervalEnd: end,
    maxDailyCommentsPerFriend: Math.max(1, Number(raw?.maxDailyCommentsPerFriend ?? 3) || 3),
    maxDailyTotalComments: Math.max(1, Number(raw?.maxDailyTotalComments ?? 50) || 50),
    keywordFilter: Array.isArray(raw?.keywordFilter) ? raw.keywordFilter.map((item: any) => String(item)) : []
  }
}

const buildAutoSendPayload = (
  reply: string,
  items: any[],
  bounds: CaptureBounds | null,
  imageSize?: { w: number; h: number }
): { text: string; focusCoords?: { x: number; y: number }; sendCoords?: { x: number; y: number } } | null => {
  if (!bounds) return null
  const realSize = imageSize && imageSize.w > 0 && imageSize.h > 0 ? imageSize : { w: bounds.w, h: bounds.h }
  const sendBtn = findSendButtonItem(items)
  let sendCoords: { x: number; y: number } | undefined
  let focusCoords: { x: number; y: number } | undefined

  if (sendBtn) {
    const sendCenterX = getItemCenterX(sendBtn)
    const sendCenterY = getItemCenterY(sendBtn)
    const sendX = bounds.x + (sendCenterX / realSize.w) * bounds.w
    const sendY = bounds.y + (sendCenterY / realSize.h) * bounds.h
    sendCoords = {
      x: clamp(sendX, bounds.x + 5, bounds.x + bounds.w - 5),
      y: clamp(sendY, bounds.y + 5, bounds.y + bounds.h - 5)
    }

    const sendLeft = sendBtn.box[0][0]
    const sendWidth = Math.max(1, sendBtn.box[2][0] - sendBtn.box[0][0])
    const focusXInImage = sendLeft - Math.max(80, sendWidth * 1.6)
    const focusX = bounds.x + (focusXInImage / realSize.w) * bounds.w
    focusCoords = {
      x: clamp(focusX, bounds.x + 10, bounds.x + bounds.w - 10),
      y: clamp(sendY, bounds.y + 5, bounds.y + bounds.h - 5)
    }
  } else {
    focusCoords = {
      x: bounds.x + bounds.w * 0.5,
      y: bounds.y + bounds.h * 0.92
    }
    sendCoords = {
      x: bounds.x + bounds.w * 0.9,
      y: bounds.y + bounds.h * 0.92
    }
  }

  return { text: reply, focusCoords, sendCoords }
}

const getImageDataFromDataUrl = (dataUrl: string): Promise<ImageData | null> => {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(null)
        return
      }
      ctx.drawImage(img, 0, 0)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      resolve(imageData)
    }
    img.onerror = () => resolve(null)
    img.src = dataUrl
  })
}

const hasSignificantChange = (prev: ImageData, current: ImageData): boolean => {
  if (prev.width !== current.width || prev.height !== current.height) return true
  const prevData = prev.data
  const currData = current.data
  const step = Math.max(1, SAMPLE_STEP)
  const stride = 4 * step
  let total = 0
  let changed = 0
  for (let i = 0; i < prevData.length; i += stride) {
    const dr = Math.abs(prevData[i] - currData[i])
    const dg = Math.abs(prevData[i + 1] - currData[i + 1])
    const db = Math.abs(prevData[i + 2] - currData[i + 2])
    total += 1
    if (dr + dg + db > PIXEL_DIFF_THRESHOLD) {
      changed += 1
    }
  }
  if (total === 0) return true
  const ratio = changed / total
  return ratio >= CHANGE_RATIO_THRESHOLD
}

const getLastSpeaker = (items: any[], bounds: any, realImageSize?: { w: number; h: number }): 'ME' | 'THEM' | 'UNKNOWN' => {
  if (!items || items.length === 0 || !bounds) return 'UNKNOWN'

  const dpr = window.devicePixelRatio || 1
  const width = realImageSize ? realImageSize.w : bounds.w * dpr
  const height = realImageSize ? realImageSize.h : bounds.h * dpr
  const bottomThreshold = getBottomThreshold(items, height)
  const avgHeight = getAverageItemHeight(items.filter((item) => {
    const text = getItemText(item)
    return !(text.includes('发送') || text.toLowerCase().includes('send'))
  }))

  const contentItems = items.filter((item) => {
    const text = getItemText(item)
    if (text.includes('发送') || text.includes('Send')) return false

    const itemCenterY = getItemCenterY(item)
    if (itemCenterY > bottomThreshold) {
      return false
    }
    if (isNoiseItem(item, avgHeight)) return false

    return true
  })

  if (contentItems.length === 0) return 'UNKNOWN'

  contentItems.sort((a, b) => getItemCenterY(b) - getItemCenterY(a))

  const lastItem = contentItems[0]
  const centerX = getItemCenterX(lastItem)

  if (centerX > width * 0.55) {
    return 'ME'
  }
  return 'THEM'
}

const getLastMessageFromThem = (items: any[], bounds: any, realImageSize?: { w: number; h: number }): string => {
  if (!items || items.length === 0 || !bounds) return ''

  const dpr = window.devicePixelRatio || 1
  const width = realImageSize ? realImageSize.w : bounds.w * dpr
  const height = realImageSize ? realImageSize.h : bounds.h * dpr
  const bottomThreshold = getBottomThreshold(items, height)
  const avgHeight = getAverageItemHeight(items.filter((item) => {
    const text = getItemText(item)
    return !(text.includes('发送') || text.toLowerCase().includes('send'))
  }))

  const contentItems = items.filter((item) => {
    const text = getItemText(item)
    if (text.includes('发送') || text.includes('Send')) return false

    const itemCenterY = getItemCenterY(item)
    if (itemCenterY > bottomThreshold) {
      return false
    }

    const itemCenterX = getItemCenterX(item)
    if (itemCenterX > width * 0.55) {
      return false
    }
    if (isNoiseItem(item, avgHeight)) return false

    return true
  })

  if (contentItems.length === 0) return ''

  const heights = contentItems.map((item) => Math.abs(item.box[2][1] - item.box[0][1]))
  const avgLineHeight = heights.reduce((sum, v) => sum + v, 0) / heights.length
  const lineGap = Math.max(12, avgLineHeight * 0.9)

  contentItems.sort((a, b) => {
    const centerY_a = (a.box[0][1] + a.box[2][1]) / 2
    const centerY_b = (b.box[0][1] + b.box[2][1]) / 2
    return centerY_a - centerY_b
  })

  const lines: { centerY: number; items: any[] }[] = []
  contentItems.forEach((item) => {
    const centerY = getItemCenterY(item)
    const lastLine = lines[lines.length - 1]
    if (!lastLine || Math.abs(centerY - lastLine.centerY) > lineGap) {
      lines.push({ centerY, items: [item] })
    } else {
      lastLine.items.push(item)
      lastLine.centerY = (lastLine.centerY + centerY) / 2
    }
  })

  let startIndex = lines.length - 1
  while (startIndex > 0) {
    const gap = lines[startIndex].centerY - lines[startIndex - 1].centerY
    if (gap <= lineGap * 1.8) {
      startIndex -= 1
    } else {
      break
    }
  }

  const messageLines = lines.slice(startIndex)
  return messageLines
    .map((line) => {
      line.items.sort((a, b) => {
        const centerX_a = getItemCenterX(a)
        const centerX_b = getItemCenterX(b)
        return centerX_a - centerX_b
      })
      const texts = line.items.map((item) => getItemText(item)).filter((text) => !isNoiseText(text))
      return texts.join('')
    })
    .join('\n')
}

const PlayIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M5 3L19 12L5 21V3Z" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

const LoaderIcon = () => (
  <svg className={styles.iconSpin} width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M12 18V22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M4.93 4.93L7.76 7.76" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M16.24 16.24L19.07 19.07" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M2 12H6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M18 12H22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M4.93 19.07L7.76 16.24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M16.24 7.76L19.07 4.93" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

function AssistantPage(props: Props): JSX.Element {
  const { backendBaseUrl, tenantId, userToken, onLogout } = props
  const { toast, showToast } = useToast()

  const [isRunning, setIsRunning] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [difyResponse, setDifyResponse] = useState<string>('')
  const [processItems, setProcessItems] = useState<ProcessItem[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isSending, setIsSending] = useState(false)
  const [activeRole, setActiveRole] = useState<Role | null>(null)
  const [lastReplied, setLastReplied] = useState<{ contact: string; text: string; at: number } | null>(null)
  const [managedMode, setManagedMode] = useState<'full' | 'semi'>('full')
  const [knowledgeBaseOptions, setKnowledgeBaseOptions] = useState<SelectableKnowledgeBase[]>([])
  const [storeDialogOpen, setStoreDialogOpen] = useState(false)
  const [storeSubmitting, setStoreSubmitting] = useState(false)
  const [selectedKnowledgeBaseId, setSelectedKnowledgeBaseId] = useState('')
  const [storeContext, setStoreContext] = useState<StoreContext | null>(null)
  const managedModeRef = useRef<'full' | 'semi'>('full')

  useEffect(() => {
    managedModeRef.current = managedMode
  }, [managedMode])

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const marketingLikeTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const marketingCommentTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isRunningRef = useRef(false)
  const activeRoleRef = useRef<Role | null>(null)
  const sessionConfigRef = useRef<SessionConfig | null>(null)
  const contactQueueRef = useRef<Map<string, Promise<void>>>(new Map())
  const lastProcessedByContactRef = useRef<Map<string, { text: string; at: number }>>(new Map())
  const outputStoreContextRef = useRef<Map<string, { contactKey: string; customerMessage: string }>>(new Map())
  const abortControllerRef = useRef<AbortController | null>(null)
  const pollFailureCountRef = useRef(0)

  const fetchRunningRole = async (): Promise<Role | null> => {
    try {
      const res = await http.get<Role[]>('/api/user/roles')
      // http.ts returns res.data directly if success, which is Role[]
      const roles = res as unknown as Role[]
      const running = roles.find((role) => role.status === 'RUNNING') || null
      setActiveRole(running)
      return running
    } catch (error) {
      setActiveRole(null)
      return null
    }
  }

  const fetchSessionConfig = async () => {
    try {
      const res = await http.get<SessionConfig>('/api/user/session-management/config?sceneType=SINGLE')
      sessionConfigRef.current = res as unknown as SessionConfig
    } catch (e) {
      console.error('Failed to fetch session config', e)
    }
  }

  const fetchLikeConfig = async (): Promise<MarketingLikeConfig | null> => {
    try {
      const res = await http.get<MarketingLikeConfig>('/api/user/marketing/like')
      return normalizeLikeConfig(res)
    } catch (e) {
      return null
    }
  }

  const fetchCommentConfig = async (): Promise<MarketingCommentConfig | null> => {
    try {
      const res = await http.get<MarketingCommentConfig>('/api/user/marketing/comment')
      return normalizeCommentConfig(res)
    } catch (e) {
      return null
    }
  }

  const fetchKnowledgeBaseOptions = async (): Promise<SelectableKnowledgeBase[]> => {
    const res = await http.get<SelectableKnowledgeBase[]>('/api/user/knowledge-bases')
    const list = Array.isArray(res) ? res : []
    setKnowledgeBaseOptions(list)
    return list
  }

  useEffect(() => {
    isRunningRef.current = isRunning
  }, [isRunning])

  useEffect(() => {
    activeRoleRef.current = activeRole
  }, [activeRole])

  useEffect(() => {
    if (backendBaseUrl && userToken) {
      fetchRunningRole()
      fetchSessionConfig()
    } else {
      setActiveRole(null)
    }
  }, [backendBaseUrl, userToken])

  const enqueueIncoming = (msg: any) => {
    const contact = String(msg?.contact || '').trim()
    const text = String(msg?.content || '').trim()
    const isSelf = !!msg?.is_self
    const triggerReply = !!msg?.trigger_reply
    if (!contact || !text) return
    const prev = contactQueueRef.current.get(contact) || Promise.resolve()
    const next = prev
      .then(() => handleIncoming(contact, text, isSelf, triggerReply))
      .catch(() => {
      })
      .finally(() => {
        if (contactQueueRef.current.get(contact) === next) {
          contactQueueRef.current.delete(contact)
        }
      })
    contactQueueRef.current.set(contact, next)
  }

  const handleIncoming = async (contact: string, text: string, isSelf: boolean, triggerReply: boolean) => {
    const normalizedText = normalizeMessage(text)
    if (!normalizedText) return

    const now = Date.now()
    
    // 更新消息列表
    const newMessage: ChatMessage = {
      id: `${contact}-${now}-${Math.random().toString(36).substr(2, 9)}`,
      contact,
      content: normalizedText,
      isSelf,
      timestamp: now
    }
    setMessages((prev) => [...prev, newMessage])
    setTimeout(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
      }
    }, 100)

    // 如果是自己发的消息，则停止处理
    if (isSelf) return

    // 只有当 triggerReply 为 true 时才回复
    if (!triggerReply) {
      console.log('Ignore reply (not latest or already replied):', normalizedText)
      return
    }

    const last = lastProcessedByContactRef.current.get(contact)
    if (last && last.text === normalizedText && now - last.at < 120000) {
      return
    }
    if (last && now - last.at < 8000) {
      return
    }
    lastProcessedByContactRef.current.set(contact, { text: normalizedText, at: now })

    setIsSending(true)
    setDifyResponse('')
    
    // 初始化可视化流程
    const initialItems: ProcessItem[] = [{
      id: `step-intent-${now}`,
      step: 'INTENT',
      status: 'running',
      content: '正在分析用户意图...',
      timestamp: new Date().toLocaleTimeString()
    }]
    setProcessItems(initialItems)

    try {
      const role = activeRoleRef.current
      if (!role?.id) {
        setDifyResponse('请先在角色配置中开启一个角色')
        setProcessItems([])
        return
      }

      // Abort previous request if any
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      const ac = new AbortController()
      abortControllerRef.current = ac

      const { token, tenantId } = readAuthSnapshot()
      const storedBaseUrl = localStorage.getItem('backendBaseUrl')
      const baseURL = (storedBaseUrl || AppConfig.apiBaseUrl).replace(/\/api\/?$/, '').replace(/\/$/, '')
      
      const response = await fetch(`${baseURL}/api/user/dify/monitor-chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : '',
          'X-Tenant-Id': tenantId || ''
        },
        body: JSON.stringify({
          roleId: role.id,
          message: normalizedText,
          role: role.content || '',
          wechatContact: contact
        }),
        signal: ac.signal
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const reader = response.body?.getReader()
      if (!reader) throw new Error('Response body is null')
      
      const decoder = new TextDecoder()
      let buffer = ''
      const localItems = [...initialItems]

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data:')) {
            const jsonStr = line.replace('data:', '').trim()
            if (!jsonStr) continue
            
            try {
              const data = JSON.parse(jsonStr)
              const { step, content } = data
              
              if (step === 'INTENT') {
                const item = localItems.find(i => i.step === 'INTENT')
                if (item) {
                  item.status = 'completed'
                  item.content = content
                }
                if (!localItems.find(i => i.step === 'KNOWLEDGE')) {
                  localItems.push({
                    id: `step-knowledge-${Date.now()}`,
                    step: 'KNOWLEDGE',
                    status: 'running',
                    content: '正在检索知识库...',
                    timestamp: new Date().toLocaleTimeString()
                  })
                }
              } else if (step === 'KNOWLEDGE') {
                const item = localItems.find(i => i.step === 'KNOWLEDGE')
                if (item) {
                  item.status = 'completed'
                  item.content = content
                }
                if (!localItems.find(i => i.step === 'LOGIC')) {
                  localItems.push({
                    id: `step-logic-${Date.now()}`,
                    step: 'LOGIC',
                    status: 'running',
                    content: '正在规划回复逻辑...',
                    timestamp: new Date().toLocaleTimeString()
                  })
                }
              } else if (step === 'LOGIC') {
                const item = localItems.find(i => i.step === 'LOGIC')
                if (item) {
                  item.status = 'completed'
                  item.content = content
                }
                if (!localItems.find(i => i.step === 'OUTPUT')) {
                  localItems.push({
                    id: `step-output-${Date.now()}`,
                    step: 'OUTPUT',
                    status: 'running',
                    content: '正在生成最终回复...',
                    timestamp: new Date().toLocaleTimeString()
                  })
                }
              } else if (step === 'OUTPUT') {
                const item = localItems.find(i => i.step === 'OUTPUT')
                if (item) {
                  item.status = 'completed'
                  item.content = content
                  outputStoreContextRef.current.set(item.id, {
                    contactKey: contact,
                    customerMessage: normalizedText
                  })
                }
                
                // Send WeChat Message
                const reply = content
                if (reply && managedModeRef.current === 'full') {
                   // Calculate delay based on session config
                   const config = sessionConfigRef.current?.sceneConfig
                   if (config) {
                     const min = (config.replyIntervalStartSec || 0) * 1000
                     const max = (config.replyIntervalEndSec || 0) * 1000
                     if (max >= min && min >= 0) {
                       const delayMs = Math.floor(min + Math.random() * (max - min))
                       const elapsed = Date.now() - now
                       if (delayMs > elapsed) {
                         const waitTime = delayMs - elapsed
                         await new Promise(resolve => setTimeout(resolve, waitTime))
                       }
                     }
                   }

                   const api = (window as any).api
                   const sendRes = await api.sendWeChatMessage({ target: contact, content: reply })
                   if (!sendRes?.ok || sendRes?.success === false) {
                     setDifyResponse(reply + '\n\n(自动发送失败)')
                   } else {
                     setLastReplied({ contact, text: reply, at: Date.now() })
                   }
                }
              }
              
              setProcessItems([...localItems])
            } catch (e) {
              console.error('Error parsing SSE data', e)
            }
          }
        }
      }

    } catch (err: any) {
      if (err.name === 'AbortError') return
      setDifyResponse('发送失败: ' + (err.message || 'Error'))
      // Mark running items as failed (or just leave them)
      setProcessItems(prev => prev.map(i => i.status === 'running' ? { ...i, status: 'completed', content: '发生错误: ' + err.message } : i))
    } finally {
      setIsSending(false)
      abortControllerRef.current = null
    }
  }

  useEffect(() => {
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current)
      pollTimeoutRef.current = null
    }
    if (!isRunning) {
      return
    }

    const loop = async () => {
      if (!isRunningRef.current) return
      try {
        const api = (window as any).api
        const res = await api.pollWeChatMessages()
        if (res?.ok && Array.isArray(res.messages)) {
          pollFailureCountRef.current = 0
          setDifyResponse((prev) => {
            if (prev.startsWith('轮询失败: ') || prev.startsWith('启动失败: ')) {
              return ''
            }
            return prev
          })
          for (const msg of res.messages) {
            if (msg?.type === 'text' && msg?.content) {
              enqueueIncoming(msg)
            }
          }
        } else if (res?.error) {
          pollFailureCountRef.current += 1
          const errText = String(res.message || res.error || '')
          if (errText !== 'bridge_starting' && pollFailureCountRef.current >= 3) {
            setDifyResponse('轮询失败: ' + errText)
          }
        }
      } catch (e: any) {
        pollFailureCountRef.current += 1
        if (pollFailureCountRef.current >= 3) {
          setDifyResponse('轮询失败: ' + (e?.message || String(e)))
        }
      } finally {
        if (isRunningRef.current) {
          const delay = 600 + Math.floor(Math.random() * 600)
          pollTimeoutRef.current = setTimeout(loop, delay)
        }
      }
    }

    pollTimeoutRef.current = setTimeout(loop, 200)
    return () => {
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current)
      }
    }
  }, [isRunning])

  useEffect(() => {
    if (marketingLikeTimeoutRef.current) {
      clearTimeout(marketingLikeTimeoutRef.current)
      marketingLikeTimeoutRef.current = null
    }
    if (!isRunning) {
      return
    }

    const loop = async () => {
      if (!isRunningRef.current) return
      let nextDelay = 90_000
      try {
        const likeConfig = await fetchLikeConfig()
        if (likeConfig && likeConfig.enabled) {
          const minMs = likeConfig.likeIntervalStart * 1000
          const maxMs = likeConfig.likeIntervalEnd * 1000
          nextDelay = minMs + Math.floor(Math.random() * Math.max(1, maxMs - minMs + 1))
          
          if (managedModeRef.current === 'full') {
            const api = (window as any).api
            if (api?.executeWeChatCommand) {
              await api.executeWeChatCommand({
                action: 'marketing_like',
                config: likeConfig
              })
            }
          }
        }
      } catch (e) {
      } finally {
        if (isRunningRef.current) {
          marketingLikeTimeoutRef.current = setTimeout(loop, nextDelay)
        }
      }
    }

    marketingLikeTimeoutRef.current = setTimeout(loop, 8_000)
    return () => {
      if (marketingLikeTimeoutRef.current) {
        clearTimeout(marketingLikeTimeoutRef.current)
      }
    }
  }, [isRunning])

  useEffect(() => {
    if (marketingCommentTimeoutRef.current) {
      clearTimeout(marketingCommentTimeoutRef.current)
      marketingCommentTimeoutRef.current = null
    }
    if (!isRunning) {
      return
    }

    const loop = async () => {
      if (!isRunningRef.current) return
      let nextDelay = 120_000
      try {
        const commentConfig = await fetchCommentConfig()
        if (commentConfig && commentConfig.enabled) {
          const minMs = commentConfig.commentIntervalStart * 1000
          const maxMs = commentConfig.commentIntervalEnd * 1000
          nextDelay = minMs + Math.floor(Math.random() * Math.max(1, maxMs - minMs + 1))
          
          if (managedModeRef.current === 'full') {
            const { token } = readAuthSnapshot()
            const storedBaseUrl = localStorage.getItem('backendBaseUrl')
            const baseURL = (storedBaseUrl || AppConfig.apiBaseUrl).replace(/\/api\/?$/, '').replace(/\/$/, '')

            const api = (window as any).api
            if (api?.executeWeChatCommand) {
              console.log('开始朋友圈自动评论任务', { enabled: commentConfig.enabled })
              await api.executeWeChatCommand({
                action: 'marketing_comment',
                config: {
                  ...commentConfig,
                  backendUrl: baseURL,
                  token: token,
                  tenantId: tenantId
                }
              })
            }
          }
        }
      } catch (e) {
      } finally {
        if (isRunningRef.current) {
          marketingCommentTimeoutRef.current = setTimeout(loop, nextDelay)
        }
      }
    }

    marketingCommentTimeoutRef.current = setTimeout(loop, 12_000)
    return () => {
      if (marketingCommentTimeoutRef.current) {
        clearTimeout(marketingCommentTimeoutRef.current)
      }
    }
  }, [isRunning])

  const handleUpdateProcessItem = (id: string, newContent: string) => {
    setProcessItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, content: newContent } : item))
    )
  }

  const closeStoreDialog = () => {
    setStoreDialogOpen(false)
    setStoreSubmitting(false)
    setSelectedKnowledgeBaseId('')
    setStoreContext(null)
  }

  const handleStoreProcessItem = async (id: string, aiReplyText: string) => {
    if (managedModeRef.current !== 'semi') {
      return
    }
    const source = outputStoreContextRef.current.get(id)
    if (!source || !source.contactKey || !source.customerMessage || !aiReplyText.trim()) {
      showToast('无法入库：缺少上下文消息', 'error')
      return
    }
    try {
      const options = await fetchKnowledgeBaseOptions()
      const enabled = options.filter((item) => item.status === 'ENABLED')
      if (enabled.length === 0) {
        showToast('暂无可用知识库，请先创建并启用知识库', 'error')
        return
      }
      setStoreContext({
        itemId: id,
        contactKey: source.contactKey,
        customerMessage: source.customerMessage,
        aiReplyMessage: aiReplyText.trim()
      })
      setSelectedKnowledgeBaseId(enabled[0].id)
      setStoreDialogOpen(true)
    } catch (error: any) {
      showToast(`获取知识库失败: ${error?.message || '未知错误'}`, 'error')
    }
  }

  const submitManualStore = async () => {
    if (!storeContext || !selectedKnowledgeBaseId) {
      showToast('请选择知识库后再提交', 'error')
      return
    }
    setStoreSubmitting(true)
    try {
      await http.post('/api/user/knowledge-bases/manual-store', {
        knowledgeBaseId: selectedKnowledgeBaseId,
        contactKey: storeContext.contactKey,
        customerMessage: storeContext.customerMessage,
        aiReplyMessage: storeContext.aiReplyMessage
      })
      showToast('已入库，等待同步到知识库文档', 'success')
      closeStoreDialog()
    } catch (error: any) {
      showToast(`入库失败: ${error?.message || '未知错误'}`, 'error')
      setStoreSubmitting(false)
    }
  }

  const toggleRunning = async () => {
    const api = (window as any).api
    if (!api?.startWeChatBridge) {
      alert('无法调用微信桥接：Electron API 未找到')
      return
    }
    if (isRunningRef.current) {
      setIsRunning(false)
      pollFailureCountRef.current = 0
      try {
        await api.stopWeChatBridge()
      } catch (e) {
      }
      return
    }
    
    setIsConnecting(true)
    setDifyResponse('')

    try {
      const runningRole = await fetchRunningRole()
      if (!runningRole?.id) {
        setDifyResponse('请先在角色配置中开启一个角色')
        return
      }
      const startRes = await api.startWeChatBridge()
      if (!startRes?.ok) {
        throw new Error(startRes?.message || startRes?.error || '启动失败')
      }
      pollFailureCountRef.current = 0
      setIsRunning(true)
    } catch (e: any) {
      console.error(e)
      setDifyResponse('启动失败: ' + (e?.message || String(e)))
      setIsRunning(false)
    } finally {
      setIsConnecting(false)
    }
  }

  let btnClass = styles.btnStartAction
  let btnContent: React.ReactNode = null
  
  if (isConnecting) {
    btnClass += ` ${styles.starting}`
    btnContent = (
      <>
        <LoaderIcon />
        <span>连接中...</span>
      </>
    )
  } else if (isRunning) {
    btnClass += ` ${styles.running}`
    btnContent = (
      <>
        <div className={styles.iconBreathing} />
        <span>停止运行</span>
      </>
    )
  } else {
    btnClass += ` ${styles.ready}`
    btnContent = (
      <>
        <PlayIcon />
        <span>启动运行</span>
      </>
    )
  }

  return (
    <div className={styles.assistantPage}>
      <header className={styles.pageHeader}>
        <div className={styles.pageHeaderTitleGroup}>
          <h4 className={styles.pageTitle}>AI 运营助手</h4>
          <div className={`${styles.statusBadge} ${isRunning ? styles.active : ''}`}>
            <div className={styles.statusIndicator}></div>
            {isRunning ? '运行中' : '就绪'}
          </div>
        </div>
        
        <div className={styles.pageHeaderActions}>
          <div className={styles.modeToggle}>
            <button
              onClick={() => setManagedMode('full')}
              className={`${styles.modeBtn} ${managedMode === 'full' ? styles.active : ''}`}
            >
              全托管
            </button>
            <button
              onClick={() => setManagedMode('semi')}
              className={`${styles.modeBtn} ${managedMode === 'semi' ? styles.active : ''}`}
            >
              半托管
            </button>
          </div>
          <button className={btnClass} onClick={toggleRunning} disabled={isSending || isConnecting}>
            {btnContent}
          </button>
        </div>
      </header>

      <div className={styles.pageBody}>
        <div className={styles.assistantContainer}>
          <div className={styles.mainCard}>
            
            {/* Top Section: AI Thinking Process */}
            <div className={styles.topSection}>
              <div className={styles.sectionHeader}>
                <h5 className={styles.sectionTitle}>
                  <span className={styles.aiThinkingDot}></span>
                  视界正在查看你的屏幕，正在阅读你的聊天内容
                </h5>
              </div>
              <div className={styles.sectionContent}>
                {(processItems.length > 0 || difyResponse) ? (
                  processItems.length > 0 ? (
                    <ProcessVisualizer
                      items={processItems}
                      managedMode={managedMode}
                      onUpdateItem={handleUpdateProcessItem}
                      onStoreItem={handleStoreProcessItem}
                    />
                  ) : (
                    <div className={styles.aiResponseBox}>
                      {difyResponse}
                    </div>
                  )
                ) : (
                   <div className={styles.emptyState}>
                     <div className={styles.emptyIcon}>🧠</div>
                     <div>等待触发任务...</div>
                   </div>
                )}
              </div>
            </div>

            {/* Bottom Section: WeChat Messages */}
            <div className={styles.bottomSection}>
               <div className={styles.sectionHeader}>
                 <h5 className={styles.sectionTitle}>
                   实时对话读取
                 </h5>
                 {lastReplied && (
                    <span className={styles.lastRepliedBadge}>
                      最近回复: {lastReplied.contact}
                    </span>
                 )}
               </div>
               
               <div className={styles.chatHistoryContainer}>
                  {messages.length === 0 && (
                    <div className={styles.emptyState} style={{ marginTop: '60px' }}>
                      启动后，收到的微信消息会出现在这里...
                    </div>
                  )}
                  {messages.map((msg, index) => {
                    const isLatest = index === messages.length - 1
                    return (
                      <div
                        key={msg.id}
                        className={styles.messageItem}
                        style={{
                          alignItems: msg.isSelf ? 'flex-end' : 'flex-start',
                        }}
                      >
                        <div className={styles.messageMeta}>
                          {!msg.isSelf && isLatest && (
                            <span className={styles.newBadge}>
                              NEW
                            </span>
                          )}
                          <span>{msg.isSelf ? '我' : msg.contact}</span>
                          <span style={{ marginLeft: '8px' }}>{new Date(msg.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <div
                          className={`${styles.messageBubble} ${msg.isSelf ? styles.messageBubbleSelf : styles.messageBubbleOther}`}
                        >
                          {msg.content}
                        </div>
                      </div>
                    )
                  })}
                  <div ref={messagesEndRef} />
               </div>
            </div>
            
          </div>
        </div>
      </div>
      <StoreToKnowledgeBaseDialog
        isOpen={storeDialogOpen}
        loading={storeSubmitting}
        options={knowledgeBaseOptions}
        selectedId={selectedKnowledgeBaseId}
        customerMessage={storeContext?.customerMessage || ''}
        aiReplyMessage={storeContext?.aiReplyMessage || ''}
        onSelect={setSelectedKnowledgeBaseId}
        onConfirm={submitManualStore}
        onClose={closeStoreDialog}
      />
      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  )
}

export default AssistantPage
