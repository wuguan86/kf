import React, { useEffect, useState } from 'react'
import TitleBar from '../components/TitleBar'
import styles from './AppShell.module.css'
import http from '../utils/http'
import { eventBus } from '../utils/eventBus'

export type AppRoute = 'assistant' | 'settings' | 'knowledge' | 'session-management' | 'marketing' | 'data-statistics' | 'me' | 'system-settings'

type Props = {
  activeRoute: AppRoute
  onNavigate: (route: AppRoute) => void
  children: React.ReactNode
  backendBaseUrl?: string
  tenantId?: string
  userToken?: string
}

type MembershipMeResponse = {
  membership: {
    status: string
    startAt: string
    endAt: string
    pointsBalance: number
    subscriptionPoints: number
    packagePoints: number
  } | null
  plan: {
    name: string
  } | null
}

function AppShell(props: Props): JSX.Element {
  const { activeRoute, onNavigate, children, tenantId, userToken } = props

  const [membership, setMembership] = useState<MembershipMeResponse | null>(null)

  const [isConnecting, setIsConnecting] = useState(false)
  const [isRunning, setIsRunning] = useState(false)

  useEffect(() => {
    const fetchMembership = async () => {
      if (!userToken) return
      try {
        const safeTenantId = tenantId?.trim() || '1'
        const headers: Record<string, string> = { 'X-Tenant-Id': safeTenantId, 'Authorization': `Bearer ${userToken}` }
        const data = await http.get<MembershipMeResponse>('/api/user/membership/me', { headers })
        setMembership(data)
      } catch (error) {
        console.error('Failed to fetch membership info in AppShell', error)
      }
    }
    fetchMembership()
    // Optional: Refresh periodically or listen to events
    const interval = setInterval(fetchMembership, 60000)
    
    const unsubscribePoints = eventBus.on('points-updated', () => {
      fetchMembership()
    })

    return () => {
      clearInterval(interval)
      unsubscribePoints()
    }
  }, [userToken, tenantId])

  useEffect(() => {
    const unsubscribeState = eventBus.on('assistant-state-change', ({ isConnecting, isRunning }) => {
      setIsConnecting(isConnecting)
      setIsRunning(isRunning)
    })
    return () => {
      unsubscribeState()
    }
  }, [])

  const handleToggle = () => {
    if (isConnecting) return
    eventBus.emit('assistant-toggle')
  }

  const handleNavClick = (route: AppRoute) => {
    if (isRunning && route !== 'assistant') {
      return // Disable navigation when running
    }
    onNavigate(route)
  }

  const totalPoints = Math.max(0, membership?.membership?.pointsBalance || 0)
  const currentPlanName = membership?.plan?.name || '免费版'
  
  const formatDateTime = (isoString: string) => {
    const d = new Date(isoString)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  const expireAtText = membership?.membership?.endAt ? `到期时间: ${formatDateTime(membership.membership.endAt)}` : '未开通或长期有效'

  return (
    <div className={styles.appShell}>
      <TitleBar />
      <div className={styles.appSidebar}>
        <div className={styles.sidebarDashboard}>
          <div className={styles.dashboardHeader}>
            <div className={styles.appBrandAvatar}>视</div>
            <div className={styles.dashboardStats}>
              <div className={styles.statValueVersion} title={expireAtText}>
                {currentPlanName}
              </div>
              <div className={styles.statPointsWrapper} title="当前积分">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#faad14" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/>
                  <path d="M12 18V6"/>
                </svg>
                <span className={styles.statValueHighlight}>{totalPoints}</span>
              </div>
            </div>
          </div>
        </div>

        <nav className={styles.appNav}>
          <div
            className={`${styles.navItem} ${activeRoute === 'assistant' ? styles.active : ''}`}
            onClick={() => handleNavClick('assistant')}
          >
            <span className={styles.navIcon}>
              <svg className={styles.navIconSvg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
            </span>
            <span className={styles.navLabel}>运营助手</span>
          </div>
          <div
            className={`${styles.navItem} ${activeRoute === 'settings' ? styles.active : ''} ${isRunning ? styles.disabled : ''}`}
            onClick={() => handleNavClick('settings')}
          >
            <span className={styles.navIcon}>
              <svg className={styles.navIconSvg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg>
            </span>
            <span className={styles.navLabel}>角色配置</span>
          </div>
          <div
            className={`${styles.navItem} ${activeRoute === 'knowledge' ? styles.active : ''} ${isRunning ? styles.disabled : ''}`}
            onClick={() => handleNavClick('knowledge')}
          >
            <span className={styles.navIcon}>
              <svg className={styles.navIconSvg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 4h18v16H3z"/><path d="M8 8h8"/><path d="M8 12h8"/><path d="M8 16h5"/></svg>
            </span>
            <span className={styles.navLabel}>知识库管理</span>
          </div>
          <div
            className={`${styles.navItem} ${activeRoute === 'session-management' ? styles.active : ''} ${isRunning ? styles.disabled : ''}`}
            onClick={() => handleNavClick('session-management')}
          >
            <span className={styles.navIcon}>
              <svg className={styles.navIconSvg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5h18"/><path d="M3 12h18"/><path d="M3 19h18"/><circle cx="7" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="17" cy="19" r="1.5"/></svg>
            </span>
            <span className={styles.navLabel}>会话管理</span>
          </div>
          <div
            className={`${styles.navItem} ${activeRoute === 'marketing' ? styles.active : ''} ${isRunning ? styles.disabled : ''}`}
            onClick={() => handleNavClick('marketing')}
          >
            <span className={styles.navIcon}>
              <svg className={styles.navIconSvg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
            </span>
            <span className={styles.navLabel}>营销管理</span>
          </div>
          <div
            className={`${styles.navItem} ${activeRoute === 'data-statistics' ? styles.active : ''} ${isRunning ? styles.disabled : ''}`}
            onClick={() => handleNavClick('data-statistics')}
          >
            <span className={styles.navIcon}>
              <svg className={styles.navIconSvg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6"/><rect x="12" y="8" width="3" height="10"/><rect x="17" y="5" width="3" height="13"/></svg>
            </span>
            <span className={styles.navLabel}>数据统计</span>
          </div>
        </nav>
        
        <div className={styles.appNavFooter}>
          <div
            className={`${styles.navItem} ${activeRoute === 'system-settings' ? styles.active : ''} ${isRunning ? styles.disabled : ''}`}
            onClick={() => handleNavClick('system-settings')}
            style={{ marginBottom: '6px' }}
          >
            <span className={styles.navIcon}>
              <svg className={styles.navIconSvg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </span>
            <span className={styles.navLabel}>系统设置</span>
          </div>

          <div
            className={`${styles.navItem} ${activeRoute === 'me' ? styles.active : ''} ${isRunning ? styles.disabled : ''}`}
            onClick={() => handleNavClick('me')}
          >
            <div className={styles.navAvatar}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </div>
            <span className={styles.navLabel}>我的</span>
          </div>
        </div>
      </div>

      <div className={styles.appMain}>
        <main className={styles.appContent}>{children}</main>
      </div>
    </div>
  )
}

export default AppShell
