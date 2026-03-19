import React from 'react'
import styles from './AlertDialog.module.css'

type Props = {
  isOpen: boolean
  title?: string
  content: string
  onConfirm: () => void
  confirmText?: string
}

export const AlertDialog: React.FC<Props> = ({
  isOpen,
  title = '提示',
  content,
  onConfirm,
  confirmText = '确定'
}) => {
  if (!isOpen) return null

  return (
    <div className={styles.overlay}>
      <div className={styles.dialog}>
        <h3 className={styles.title}>{title}</h3>
        <p className={styles.content}>{content}</p>
        <div className={styles.actions}>
          <button className={styles.confirmBtn} onClick={onConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
