export type SessionEventPayload = {
  eventType: 'FORCE_LOGOUT' | 'PING' | string
  sessionId: string
  message: string
  occurredAt: string
}

type SessionEventsOptions = {
  backendBaseUrl: string
  token: string
  tenantId: string
  onEvent: (event: SessionEventPayload) => void
  onError?: (error: unknown) => void
}

function normalizeBaseUrl(url: string): string {
  return (url || '').trim().replace(/\/$/, '')
}

function tryParseJson(line: string): SessionEventPayload | null {
  try {
    const parsed = JSON.parse(line)
    if (!parsed || typeof parsed !== 'object') {
      return null
    }
    return {
      eventType: String((parsed as any).eventType || ''),
      sessionId: String((parsed as any).sessionId || ''),
      message: String((parsed as any).message || ''),
      occurredAt: String((parsed as any).occurredAt || '')
    }
  } catch {
    return null
  }
}

export function createSessionEventsConnection(options: SessionEventsOptions): () => void {
  const safeBaseUrl = normalizeBaseUrl(options.backendBaseUrl)
  const safeTenantId = (options.tenantId || '').trim() || '1'
  let aborted = false
  let reconnectTimer: number | null = null
  let reconnectCount = 0
  let currentAbort: AbortController | null = null

  const cleanup = () => {
    if (reconnectTimer) {
      window.clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (currentAbort) {
      currentAbort.abort()
      currentAbort = null
    }
  }

  const scheduleReconnect = () => {
    if (aborted) {
      return
    }
    const delay = Math.min(10000, 1000 * Math.max(1, reconnectCount + 1))
    reconnectTimer = window.setTimeout(() => {
      reconnectCount += 1
      void connect()
    }, delay)
  }

  const connect = async () => {
    cleanup()
    if (!safeBaseUrl || !options.token) {
      return
    }
    currentAbort = new AbortController()
    try {
      const response = await fetch(`${safeBaseUrl}/api/user/session/events`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${options.token}`,
          'X-Tenant-Id': safeTenantId,
          Accept: 'text/event-stream'
        },
        signal: currentAbort.signal
      })
      if (!response.ok || !response.body) {
        throw new Error(`SSE连接失败: ${response.status}`)
      }

      reconnectCount = 0
      const reader = response.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let buffer = ''
      while (!aborted) {
        const chunk = await reader.read()
        if (chunk.done) {
          break
        }
        buffer += decoder.decode(chunk.value, { stream: true })
        buffer = buffer.replace(/\r\n/g, '\n')
        let separatorIndex = buffer.indexOf('\n\n')
        while (separatorIndex >= 0) {
          const block = buffer.slice(0, separatorIndex).trim()
          buffer = buffer.slice(separatorIndex + 2)
          const lines = block.split('\n')
          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed.startsWith('data:')) {
              continue
            }
            const payload = tryParseJson(trimmed.slice(5).trim())
            if (payload) {
              options.onEvent(payload)
            }
          }
          separatorIndex = buffer.indexOf('\n\n')
        }
      }
      scheduleReconnect()
    } catch (error) {
      if (!aborted) {
        options.onError?.(error)
        scheduleReconnect()
      }
    }
  }

  void connect()
  return () => {
    aborted = true
    cleanup()
  }
}
