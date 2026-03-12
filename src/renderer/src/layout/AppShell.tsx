import React from 'react'
import TitleBar from '../components/TitleBar'
import styles from './AppShell.module.css'

export type AppRoute = 'assistant' | 'settings' | 'knowledge' | 'session-management' | 'marketing' | 'me'

type Props = {
  activeRoute: AppRoute
  onNavigate: (route: AppRoute) => void
  children: React.ReactNode
}

function AppShell(props: Props): JSX.Element {
  const { activeRoute, onNavigate, children } = props

  return (
    <div className={styles.appShell}>
      <TitleBar />
      <div className={styles.appSidebar}>
        <div className={styles.appBrand}>
          <div className={styles.appBrandAvatar}>视</div>
          <h3 className={styles.appBrandTitle}>视界AI助手</h3>
        </div>

        <nav className={styles.appNav}>
          <div
            className={`${styles.navItem} ${activeRoute === 'assistant' ? styles.active : ''}`}
            onClick={() => onNavigate('assistant')}
          >
            <span className={styles.navIcon}>
              <svg className={styles.navIconSvg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
            </span>
            <span className={styles.navLabel}>视界AI运营助手</span>
          </div>
          <div
            className={`${styles.navItem} ${activeRoute === 'settings' ? styles.active : ''}`}
            onClick={() => onNavigate('settings')}
          >
            <span className={styles.navIcon}>
              <svg className={styles.navIconSvg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg>
            </span>
            <span className={styles.navLabel}>角色配置</span>
          </div>
          <div
            className={`${styles.navItem} ${activeRoute === 'knowledge' ? styles.active : ''}`}
            onClick={() => onNavigate('knowledge')}
          >
            <span className={styles.navIcon}>
              <svg className={styles.navIconSvg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 4h18v16H3z"/><path d="M8 8h8"/><path d="M8 12h8"/><path d="M8 16h5"/></svg>
            </span>
            <span className={styles.navLabel}>知识库管理</span>
          </div>
          <div
            className={`${styles.navItem} ${activeRoute === 'session-management' ? styles.active : ''}`}
            onClick={() => onNavigate('session-management')}
          >
            <span className={styles.navIcon}>
              <svg className={styles.navIconSvg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5h18"/><path d="M3 12h18"/><path d="M3 19h18"/><circle cx="7" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="17" cy="19" r="1.5"/></svg>
            </span>
            <span className={styles.navLabel}>会话管理</span>
          </div>
          <div
            className={`${styles.navItem} ${activeRoute === 'marketing' ? styles.active : ''}`}
            onClick={() => onNavigate('marketing')}
          >
            <span className={styles.navIcon}>
              <svg className={styles.navIconSvg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
            </span>
            <span className={styles.navLabel}>营销管理</span>
          </div>
        </nav>
        
        <div className={styles.appNavFooter}>
          <div
            className={`${styles.navItem} ${activeRoute === 'me' ? styles.active : ''}`}
            onClick={() => onNavigate('me')}
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
