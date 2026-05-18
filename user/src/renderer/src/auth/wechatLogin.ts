import http from '../utils/http'

export type WeChatQrCodeResult = {
  url: string
  state: string
}

export type WeChatLoginPollResult = {
  status: string
  token: string | null
  userId: number | null
  tenantId: number | null
  sessionId: string | null
}

export async function fetchWeChatQrCode(tenantId: string): Promise<WeChatQrCodeResult> {
  const res = await http.get<WeChatQrCodeResult>('/api/user/auth/wechat/qrcode', {
    params: { tenantId: tenantId || '1' }
  })
  return res as unknown as WeChatQrCodeResult
}

export async function fetchWeChatLoginStatus(state: string): Promise<WeChatLoginPollResult> {
  const res = await http.get<WeChatLoginPollResult>('/api/user/auth/wechat/status', {
    params: { state }
  })
  return res as unknown as WeChatLoginPollResult
}
