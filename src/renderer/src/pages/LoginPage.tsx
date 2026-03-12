import React, { useEffect, useMemo, useRef, useState } from 'react'
import { fetchWeChatLoginStatus, fetchWeChatQrCode } from '../auth/wechatLogin'
import TitleBar from '../components/TitleBar'
import styles from './LoginPage.module.css'

type Props = {
  backendBaseUrl: string
  tenantId: string
  onLoginSuccess: (auth: { token: string; tenantId: string; userId: number }) => void
}

function LoginPage(props: Props): JSX.Element {
  const { backendBaseUrl, tenantId, onLoginSuccess } = props

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string>('')
  const [statusText, setStatusText] = useState<string>('')
  const [isLoadingQr, setIsLoadingQr] = useState(false)
  const [errorText, setErrorText] = useState('')
  const pollTimerRef = useRef<number | null>(null)

  const [isAgreed, setIsAgreed] = useState(false)

  const subtitle = useMemo(() => {
    return '让客户运营从辅助驾驶到自动驾驶'
  }, [])

  const stopPolling = () => {
    if (pollTimerRef.current) {
      window.clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }

  const closeModal = () => {
    stopPolling()
    setIsModalOpen(false)
  }

  const startPolling = (state: string) => {
    stopPolling()
    pollTimerRef.current = window.setInterval(async () => {
      try {
        const res = await fetchWeChatLoginStatus(state)
        const status = (res.status || '').toUpperCase()

        if (status === 'COMPLETED' && res.token) {
          const resolvedTenantId =
            String(res.tenantId ?? '').trim() || tenantId.trim() || '1'
          stopPolling()
          onLoginSuccess({
            token: res.token,
            tenantId: resolvedTenantId,
            userId: Number(res.userId ?? 0)
          })
          setStatusText('登录成功，正在进入...')
          setTimeout(() => closeModal(), 200)
          return
        }

        if (status === 'EXPIRED' || status === 'INVALID') {
          stopPolling()
          setStatusText('二维码已过期，请刷新二维码')
          return
        }

        if (status === 'FAILED') {
          stopPolling()
          setStatusText('登录失败，请刷新二维码重试')
          return
        }

        if (status === 'PROCESSING') {
          setStatusText('已扫码，正在登录...')
          return
        }

        setStatusText('请使用微信扫码登录')
      } catch (e: any) {
        stopPolling()
        setStatusText('轮询失败，请检查后端地址或网络')
      }
    }, 1500)
  }

  const refreshQrCode = async () => {
    setErrorText('')
    setStatusText('')
    setIsLoadingQr(true)
    stopPolling()
    try {
      const qr = await fetchWeChatQrCode(tenantId.trim() || '1')
      setQrDataUrl(qr.url)
      setStatusText('请使用微信扫码登录')
      startPolling(qr.state)
    } catch (e: any) {
      const errorMsg = e?.response?.data?.msg || e?.response?.data?.message || e?.message || '获取二维码失败'
      setErrorText(errorMsg)
      setStatusText(errorMsg)
    } finally {
      setIsLoadingQr(false)
    }
  }

  const handleWeChatLogin = async () => {
    setErrorText('')
    if (!isAgreed) {
      setErrorText('请先同意服务协议和隐私政策')
      return
    }
    const url = backendBaseUrl.trim()
    if (!url) {
      setErrorText('后端地址配置错误，请联系管理员')
      return
    }
    setIsModalOpen(true)
    await refreshQrCode()
  }

  useEffect(() => {
    return () => stopPolling()
  }, [])

  return (
    <div className={styles.loginPage}>
      <TitleBar />
      <div className={styles.loginSurface}>
        <div className={styles.loginBrand}>
          <div className={styles.loginLogo}>
            <div className={styles.loginLogoMark}>视界</div>
          </div>
          <div className={styles.loginSubtitle}>{subtitle}</div>
        </div>

        <div className={styles.loginActions}>
          <button className={styles.loginWechatBtn} type="button" onClick={handleWeChatLogin}>
            微信登录
          </button>
          
          <div className={styles.loginCompliance}>
            <input 
              type="checkbox" 
              id="compliance-check" 
              className={styles.complianceCheckbox}
              checked={isAgreed} 
              onChange={(e) => setIsAgreed(e.target.checked)}
            />
            <label htmlFor="compliance-check">
              登录即代表同意<span className={styles.protocolLink}>服务协议</span>和<span className={styles.protocolLink}>隐私政策</span>
            </label>
          </div>

          <div className={styles.loginHint}>扫码登录后自动进入主界面</div>
          {errorText && <div className={styles.loginHint} style={{ color: '#ff4d4f' }}>{errorText}</div>}
        </div>
      </div>

      {isModalOpen && (
        <div className={styles.wechatModalMask} role="dialog" aria-modal="true">
          <div className={styles.wechatModal}>
            <div className={styles.wechatModalHeader}>
              <div className={styles.wechatModalTitle}>微信扫码登录</div>
              <button className={styles.wechatModalClose} type="button" onClick={closeModal}>
                ×
              </button>
            </div>

            <div className={styles.wechatModalBody}>
              <div className={styles.wechatQr}>
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="wechat-qrcode" style={{ width: 260, height: 260, borderRadius: 12 }} />
                ) : (
                  <div className={styles.wechatQrPlaceholder}>{isLoadingQr ? '加载中...' : '暂无二维码'}</div>
                )}
              </div>
              <div className={styles.wechatStatus}>{statusText || '准备中...'}</div>

              <div className={styles.wechatActions}>
                <button className={styles.btnGhostBlue} type="button" onClick={refreshQrCode} disabled={isLoadingQr}>
                  {isLoadingQr ? '刷新中...' : '刷新二维码'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default LoginPage
