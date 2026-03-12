import React from 'react'
import styles from './ConfirmDialog.module.css'

type Props = {
  isOpen: boolean
  title: string
  content: string
  onConfirm: () => void
  onCancel: () => void
  confirmText?: string
  cancelText?: string
}

export const ConfirmDialog: React.FC<Props> = ({
  isOpen,
  title,
  content,
  onConfirm,
  onCancel,
  confirmText = '删除',
  cancelText = '取消'
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
          <button className={styles.cancelBtn} onClick={onCancel}>
            {cancelText}
          </button>
        </div>
      </div>
    </div>
  )
}
