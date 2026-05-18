import React, { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import http from '../utils/http'
import styles from './PaymentModal.module.css'

interface PaymentModalProps {
  isOpen: boolean
  onClose: () => void
  onPaid: () => void
  planId: number
  planName: string
  priceCents: number
  periodType?: string
  type: 'monthly' | 'points'
}

type PaymentMethod = 'wechat' | 'alipay'
type NativeOrderResult = {
  outTradeNo: string
  codeUrl: string
  totalAmountCents: number
}
type PaymentOrderStatusResult = {
  status: string
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  onPaid,
  planId,
  planName,
  priceCents,
  periodType,
  type
}) => {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('wechat')
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('')
  const [orderNo, setOrderNo] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [purchaseCount, setPurchaseCount] = useState(1)
  const [errorText, setErrorText] = useState('')

  useEffect(() => {
    if (isOpen) {
      setPaymentMethod('wechat')
      setPurchaseCount(1)
      setErrorText('')
    }
  }, [isOpen, planId])

  useEffect(() => {
    if (isOpen) {
      generateQrCode(paymentMethod)
    }
  }, [paymentMethod, purchaseCount, isOpen, planId])

  useEffect(() => {
    if (!orderNo) return
    const timer = window.setInterval(async () => {
      try {
        const status = await http.get<PaymentOrderStatusResult>(`/api/user/payment/orders/${orderNo}`)
        if (status.status === 'SUCCESS') {
          window.clearInterval(timer)
          onPaid()
          onClose()
          return
        }
        if (status.status === 'CLOSED' || status.status === 'FAILED') {
          window.clearInterval(timer)
          setErrorText('订单已关闭，请重新发起支付')
        }
      } catch (err) {
      }
    }, 3000)
    return () => window.clearInterval(timer)
  }, [orderNo, onClose, onPaid])

  const generateQrCode = async (method: PaymentMethod) => {
    if (!planId) return
    setLoading(true)
    setErrorText('')
    try {
      const endpoint = method === 'wechat' ? '/api/user/payment/wechat/native' : '/api/user/payment/alipay/native'
      const order = await http.post<NativeOrderResult>(endpoint, {
        planId,
        purchaseCount: type === 'monthly' ? purchaseCount : 1
      })
      setOrderNo(order.outTradeNo)
      const dataUrl = await QRCode.toDataURL(order.codeUrl, {
        width: 200,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      })
      setQrCodeUrl(dataUrl)
    } catch (err) {
      setQrCodeUrl('')
      setErrorText('下单失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  const unitLabel = periodType === 'YEARLY' ? '年' : '月'
  const showCounter = type === 'monthly'
  const safeCount = showCounter ? purchaseCount : 1
  const totalAmount = ((priceCents * safeCount) / 100).toFixed(2)

  if (!isOpen) return null

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>确认订单</h3>
          <button className={styles.closeButton} onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className={styles.modalBody}>
          {/* Top: Order Info */}
          <div className={styles.orderInfo}>
            <div className={styles.planInfo}>
              <span className={styles.planLabel}>当前选择套餐</span>
              <span className={styles.planName}>{planName}</span>
            </div>
            <div className={styles.priceInfo}>
              <div className={styles.priceAmount}>¥{totalAmount}</div>
            </div>
          </div>
          {showCounter && (
            <div className={styles.counterRow}>
              <span className={styles.counterLabel}>购买{unitLabel}数</span>
              <div className={styles.counterControl}>
                <button
                  className={styles.counterBtn}
                  disabled={purchaseCount <= 1}
                  onClick={() => setPurchaseCount((prev) => Math.max(1, prev - 1))}
                >
                  -
                </button>
                <span className={styles.counterValue}>{purchaseCount}</span>
                <button
                  className={styles.counterBtn}
                  disabled={purchaseCount >= 120}
                  onClick={() => setPurchaseCount((prev) => Math.min(120, prev + 1))}
                >
                  +
                </button>
              </div>
            </div>
          )}

          <div className={styles.paymentSelector}>
            <button 
              className={`${styles.paymentMethodBtn} ${styles.wechat} ${paymentMethod === 'wechat' ? styles.active : ''}`}
              onClick={() => setPaymentMethod('wechat')}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8.5 16C8.5 16 9.5 17 11.5 17C13.5 17 17 15 17 11C17 7 13.5 5 9.5 5C5.5 5 2 7 2 11C2 13.5 3.5 15.5 6 16.5L5.5 19L8.5 17.5L8.5 16Z" fill="#09BB07"/>
                <path d="M16 14C16 14 16.5 14.5 18 14.5C19.5 14.5 22 13 22 10C22 7 19.5 5.5 16.5 5.5C13.5 5.5 11 7 11 10C11 11.5 12 13 14 13.5L13.5 15L16 14Z" fill="white" stroke="#09BB07" strokeWidth="1.5"/>
              </svg>
              微信支付
            </button>
            <button 
              className={`${styles.paymentMethodBtn} ${styles.alipay} ${paymentMethod === 'alipay' ? styles.active : ''}`}
              onClick={() => setPaymentMethod('alipay')}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 7H21" stroke="#1677FF" strokeWidth="2" strokeLinecap="round"/>
                <path d="M12 3V7" stroke="#1677FF" strokeWidth="2" strokeLinecap="round"/>
                <path d="M16 20.5C16 20.5 15 16 12 12C9 16 5 19 5 19" stroke="#1677FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M13.5 10.5H6.5C6.5 10.5 7.5 17 12 17C16.5 17 17.5 14 17.5 14" stroke="#1677FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              支付宝
            </button>
          </div>

          <div className={styles.qrCodeSection}>
            <div className={styles.qrCodeWrapper}>
              {loading ? (
                <div className={styles.qrLoading}>
                  生成中...
                </div>
              ) : qrCodeUrl ? (
                <img src={qrCodeUrl} alt="Payment QR Code" className={styles.qrCodeImage} />
              ) : (
                <div className={styles.qrLoading}>
                  获取失败
                </div>
              )}
            </div>
            {errorText && <div className={styles.errorText}>{errorText}</div>}
            <div className={styles.qrInstruction}>
              请使用 <strong>{paymentMethod === 'wechat' ? '微信' : '支付宝'}</strong> 扫一扫完成支付
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
