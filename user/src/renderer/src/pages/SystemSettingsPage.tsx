import React, { useEffect, useState } from 'react'
import { Toast, useToast } from '../components/Toast'
import { AppConfig } from '../config'
import http from '../utils/http'
import styles from './SystemSettingsPage.module.css'
import TagManagementModal from './smart-sales/TagManagementModal'

interface SystemSettingsPageProps {
  onLogout: () => void
}

interface ContactConfig {
  wechat: string
  wechat_qrcode: string
  email: string
}

const SystemSettingsPage: React.FC<SystemSettingsPageProps> = ({ onLogout }) => {
  const { toast, showToast } = useToast()
  const [tagManagerOpen, setTagManagerOpen] = useState(false)
  const [appVersion, setAppVersion] = useState('—')
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({
    stage: 'idle',
    message: '尚未检查更新'
  })
  const [contactConfig, setContactConfig] = useState<ContactConfig>({
    wechat: 'VisionTech_Support',
    wechat_qrcode: '',
    email: 'support@vision.ai'
  })

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await http.get<ContactConfig>('/api/user/system-config/customer-service')
        if (res) {
          setContactConfig({
            wechat: res.wechat || 'VisionTech_Support',
            wechat_qrcode: res.wechat_qrcode || '',
            email: res.email || 'support@vision.ai'
          })
        }
      } catch (error) {
        console.error('加载客服联系方式失败', error)
      }
    }
    fetchConfig()
  }, [])

  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    const loadUpdateState = async () => {
      if (!window.api) {
        setUpdateStatus({ stage: 'error', message: '当前环境不支持客户端更新' })
        return
      }
      try {
        const [version, status] = await Promise.all([
          window.api.getAppVersion(),
          window.api.getUpdateStatus()
        ])
        setAppVersion(version)
        setUpdateStatus(status)
        unsubscribe = window.api.onUpdateStatus(setUpdateStatus)
      } catch (error) {
        console.error('加载客户端更新状态失败', error)
        setUpdateStatus({ stage: 'error', message: '无法读取更新状态，请稍后重试' })
      }
    }
    void loadUpdateState()
    return () => unsubscribe?.()
  }, [])

  const handleUpdateAction = async () => {
    if (!window.api) {
      showToast('当前环境不支持客户端更新', 'error')
      return
    }
    try {
      if (updateStatus.stage === 'downloaded') {
        const accepted = await window.api.installUpdate()
        if (!accepted) {
          showToast('更新包尚未准备完成，请稍后重试', 'error')
        }
        return
      }
      const status = await window.api.checkForUpdates()
      setUpdateStatus(status)
    } catch (error) {
      console.error('手动检查客户端更新失败', error)
      showToast('检查更新失败，请稍后重试', 'error')
    }
  }

  const updateButtonText = updateStatus.stage === 'downloaded'
    ? '立即重启更新'
    : updateStatus.stage === 'checking' || updateStatus.stage === 'downloading'
      ? '更新处理中'
      : '检查更新'

  const getImageUrl = (path: string) => {
    if (!path) return ''
    if (path.startsWith('http')) return path
    const baseUrl = AppConfig.apiBaseUrl.replace(/\/$/, '')
    const cleanPath = path.startsWith('/') ? path : `/${path}`
    return `${baseUrl}${cleanPath}`
  }

  return (
    <div className={styles.container}>
      {toast && <Toast message={toast.message} type={toast.type} />}
      <header className={styles.header}>
        <h2 className={styles.title}>系统设置</h2>
      </header>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          软件版本
        </div>
        <div className={`${styles.card} ${styles.versionCard}`}>
          <div className={styles.versionInfo}>
            <div className={styles.versionIcon}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>
            </div>
            <div className={styles.versionText}>
              <h3>当前版本: v{appVersion}</h3>
              <p>{updateStatus.message}</p>
              {updateStatus.releaseNotes && <p className={styles.releaseNotes}>更新内容：{updateStatus.releaseNotes}</p>}
            </div>
          </div>
          <button
            className={styles.checkUpdateBtn}
            onClick={() => void handleUpdateAction()}
            disabled={updateStatus.stage === 'checking' || updateStatus.stage === 'downloading'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38"/></svg>
            {updateButtonText}
          </button>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z"/><path d="M7 7h.01"/></svg>
          智能销售
        </div>
        <div className={`${styles.card} ${styles.settingActionCard}`}>
          <div className={styles.settingActionInfo}>
            <div className={`${styles.contactIcon} ${styles.salesIcon}`}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/></svg>
            </div>
            <div className={styles.settingActionText}>
              <h3>客户标签管理</h3>
              <p>统一维护智能销售标签库，自定义标签会同步用于客户列表和客户详情。</p>
            </div>
          </div>
          <button className={styles.checkUpdateBtn} onClick={() => setTagManagerOpen(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/></svg>
            标签管理
          </button>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
          客服联系方式
        </div>
        <div className={`${styles.card} ${styles.contactGrid}`}>
          <div className={styles.contactItem}>
            <div className={`${styles.contactIcon} ${styles.wechatIcon}`}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            </div>
            <div className={styles.contactInfo}>
              <h4>官方微信</h4>
              <p>{contactConfig.wechat}</p>
            </div>
            {contactConfig.wechat_qrcode && (
              <div className={styles.qrcodeTooltip}>
                <img
                  src={getImageUrl(contactConfig.wechat_qrcode)}
                  alt="微信二维码"
                  className={styles.qrcodeImage}
                />
              </div>
            )}
          </div>
          <div className={styles.contactItem}>
            <div className={`${styles.contactIcon} ${styles.emailIcon}`}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            </div>
            <div className={styles.contactInfo}>
              <h4>售后邮箱</h4>
              <p>{contactConfig.email}</p>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.logoutSection}>
        <button onClick={onLogout} className={styles.logoutBtn}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          退出登录
        </button>
      </section>

      <TagManagementModal
        open={tagManagerOpen}
        onClose={() => setTagManagerOpen(false)}
        showToast={showToast}
      />
    </div>
  )
}

export default SystemSettingsPage
