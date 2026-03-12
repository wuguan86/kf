import React, { useEffect, useState } from 'react'
import styles from './Toast.module.css'

export type ToastType = 'success' | 'error' | 'info'

interface ToastProps {
  message: string
  type?: ToastType
  duration?: number
  onClose?: () => void
}

export const Toast: React.FC<ToastProps> = ({
  message,
  type = 'info',
  duration = 3000,
  onClose
}) => {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false)
      onClose && onClose()
    }, duration)

    return () => clearTimeout(timer)
  }, [duration, onClose])

  if (!visible) return null

  return (
    <div className={`${styles.toast} ${styles[type]}`}>
      <span className={styles.icon}>
        {type === 'success' && '✓'}
        {type === 'error' && '!'}
        {type === 'info' && 'i'}
      </span>
      <span className={styles.message}>{message}</span>
    </div>
  )
}

export const useToast = () => {
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type })
    setTimeout(() => {
      setToast(null)
    }, 3000)
  }

  return { toast, showToast }
}
