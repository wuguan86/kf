export type AuthSnapshot = {
  token: string
  tenantId: string
  sessionId: string
}

const TOKEN_KEY = 'userToken'
const TENANT_KEY = 'tenantId'
const SESSION_KEY = 'sessionId'

export function readAuthSnapshot(): AuthSnapshot {
  return {
    token: localStorage.getItem(TOKEN_KEY) || '',
    tenantId: localStorage.getItem(TENANT_KEY) || '1',
    sessionId: localStorage.getItem(SESSION_KEY) || ''
  }
}

export function writeAuthSnapshot(snapshot: AuthSnapshot): void {
  localStorage.setItem(TOKEN_KEY, snapshot.token || '')
  localStorage.setItem(TENANT_KEY, snapshot.tenantId || '1')
  localStorage.setItem(SESSION_KEY, snapshot.sessionId || '')
}

export function clearAuthSnapshot(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(TENANT_KEY)
  localStorage.removeItem(SESSION_KEY)
}
