import React from 'react'
import styles from './ForceLogoutModal.module.css'

type Props = {
  isOpen: boolean
  onRelogin: () => void
}

function ForceLogoutModal({ isOpen, onRelogin }: Props): JSX.Element | null {
  if (!isOpen) {
    return null
  }
  return (
    <div className={styles.mask} role="alertdialog" aria-modal="true" aria-live="assertive">
      <div className={styles.panel}>
        <div className={styles.title}>账号已在其他设备登录</div>
        <div className={styles.content}>您的账号已在其他地方登录，当前自动回复已停止</div>
        <button type="button" className={styles.confirmBtn} onClick={onRelogin}>
          重新登录
        </button>
      </div>
    </div>
  )
}

export default ForceLogoutModal
