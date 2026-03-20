import React from 'react'
import styles from './NoRoleDialog.module.css'

type Props = {
  isOpen: boolean
  onNavigateSettings: () => void
  onCancel: () => void
}

export const NoRoleDialog: React.FC<Props> = ({
  isOpen,
  onNavigateSettings,
  onCancel
}) => {
  if (!isOpen) return null

  return (
    <div className={styles.overlay}>
      <div className={styles.dialog}>
        <h3 className={styles.title}>提示</h3>
        <p className={styles.content}>没有启用角色，请先启用角色后再启动运行</p>
        <div className={styles.actions}>
          <button className={styles.confirmBtn} onClick={onNavigateSettings}>
            去设置
          </button>
          <button className={styles.cancelBtn} onClick={onCancel}>
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
