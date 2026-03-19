import React from 'react'
import styles from './RechargeDialog.module.css'

type Props = {
  isOpen: boolean
  onRecharge: () => void
  onCancel: () => void
}

export const RechargeDialog: React.FC<Props> = ({
  isOpen,
  onRecharge,
  onCancel
}) => {
  if (!isOpen) return null

  return (
    <div className={styles.overlay}>
      <div className={styles.dialog}>
        <p className={styles.content}>没有积分余额，请先充值。</p>
        <div className={styles.actions}>
          <button className={styles.rechargeBtn} onClick={onRecharge}>
            充值
          </button>
          <button className={styles.cancelBtn} onClick={onCancel}>
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
