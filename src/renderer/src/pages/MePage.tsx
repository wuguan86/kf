import React, { useEffect, useState, useRef } from 'react'
import http from '../utils/http'
import styles from './MePage.module.css'
import { Toast, useToast } from '../components/Toast'
import { PaymentModal } from '../components/PaymentModal'
import { eventBus } from '../utils/eventBus'

type Props = {
  backendBaseUrl: string
  tenantId: string
  userToken: string
  onLogout: () => void
}

type MeResponse = {
  id: number
  tenantId: number
  nickname: string
  avatarUrl: string
  phone?: string
  email?: string
}

type MembershipPlan = {
  id: number
  planCode: string
  type: 'SUBSCRIPTION' | 'POINTS'
  name: string
  priceCents: number
  sortWeight: number
  isRecommended: boolean
  periodType: string
  description: string
  featuresJson: string
}

type MembershipInfo = {
  status: string
  startAt: string
  endAt: string
  pointsBalance: number
  subscriptionPoints: number
  packagePoints: number
}

type MembershipMeResponse = {
  membership: MembershipInfo | null
  plan: MembershipPlan | null
}

type InvitationRedeemResult = {
  rewardType: 'MEMBERSHIP' | 'POINTS'
  membershipName: string
  durationCount: number
  points: number
  remainCount: number
}

type MonthlyPlanUI = {
  id: number
  title: string
  priceCents: number
  price: string
  period: string
  periodType: string
  features: string[]
  highlight: boolean
  isCustom?: boolean
  customTitle?: string
}

type PointPlanUI = {
  id: number
  title: string
  priceCents: number
  price: string
  description: string
  highlight: boolean
}

function MePage(props: Props): JSX.Element {
  const { backendBaseUrl, tenantId, userToken, onLogout } = props

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const [me, setMe] = useState<MeResponse | null>(null)
  const [activeTab, setActiveTab] = useState<'monthly' | 'points'>('monthly')
  const [billingCycle, setBillingCycle] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY')
  const [monthlyPlans, setMonthlyPlans] = useState<MonthlyPlanUI[]>([])
  const [pointPlans, setPointPlans] = useState<PointPlanUI[]>([])
  const [membership, setMembership] = useState<MembershipMeResponse | null>(null)
  
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isInviteOpen, setIsInviteOpen] = useState(false)
  const [inviteCode, setInviteCode] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [editForm, setEditForm] = useState({ nickname: '', phone: '', email: '' })
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<{
    id: number
    name: string
    priceCents: number
    periodType: string
    type: 'monthly' | 'points'
  } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast, showToast } = useToast()

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      setError('')
      try {
        // Handle headers: Authorization is optional if no userToken
        const safeTenantId = tenantId.trim() || '1'
        const headers: Record<string, string> = { 'X-Tenant-Id': safeTenantId }
        if (userToken) {
          headers['Authorization'] = `Bearer ${userToken}`
        }

        // Fetch User Me (only if logged in)
        if (userToken) {
          try {
            const meData = await http.get<MeResponse>('/api/user/me', { headers })
            setMe(meData)
            const membershipData = await http.get<MembershipMeResponse>('/api/user/membership/me', { headers })
            setMembership(membershipData)
          } catch (meError: any) {
            console.error('Failed to fetch user profile', meError)
            setError(meError.message || '获取用户信息失败')
            if (meError.response?.status === 401) {
              // Token expired or invalid
              setMe(null)
              setMembership(null)
              // We don't force logout here, just treat as guest
            }
          }
        } else {
          setMe(null)
          setMembership(null)
        }

        // Fetch Plans (Public endpoint)
        try {
            const plans = await http.get<MembershipPlan[]>('/api/user/membership/plans', { headers })
            
            // Process Monthly Plans
            const monthly = plans
            .filter(p => p.type === 'SUBSCRIPTION')
            .map(p => {
                const isCustom = p.priceCents === 0
                let features: string[] = []
                try {
                  const parsed = JSON.parse(p.featuresJson || '[]')
                  if (Array.isArray(parsed)) {
                    features = parsed
                  } else if (typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as any).highlights)) {
                    features = (parsed as any).highlights
                  } else {
                    console.warn('featuresJson is not an array:', parsed)
                    features = []
                  }
                } catch (e) {
                console.error('Failed to parse featuresJson', e)
                }

                return {
                id: p.id,
                title: p.name,
                priceCents: p.priceCents,
                price: isCustom ? '' : `${p.priceCents / 100}元`,
                period: p.periodType === 'YEARLY' ? '/年' : '/月',
                periodType: p.periodType,
                features: features,
                highlight: p.isRecommended,
                isCustom: isCustom,
                customTitle: isCustom ? p.description : undefined
                }
            })
            setMonthlyPlans(monthly)

            // Process Point Plans
            const points = plans
            .filter(p => p.type === 'POINTS')
            .map(p => ({
                id: p.id,
                title: p.name,
                priceCents: p.priceCents,
                price: `${p.priceCents / 100}元`,
                description: p.description,
                highlight: p.isRecommended
            }))
            setPointPlans(points)
        } catch (planError: any) {
            console.error('Failed to fetch plans', planError)
             // If plans fetch fails (e.g. network), we might want to show error
             // But if it's 401 (shouldn't be now), we handle it
        }

      } catch (e: any) {
        console.error('Fetch error:', e)
        setError(e.response?.data?.message || e.message || '加载失败')
      } finally {
        setLoading(false)
      }
    }
    if (backendBaseUrl && tenantId) {
      fetchData()
    }
  }, [backendBaseUrl, tenantId, userToken])

  const getAvatarSrc = (url: string) => {
    if (!url) return ''
    if (url.startsWith('http') || url.startsWith('blob:')) return url
    const baseUrl = backendBaseUrl.endsWith('/') ? backendBaseUrl.slice(0, -1) : backendBaseUrl
    const path = url.startsWith('/') ? url : `/${url}`
    return `${baseUrl}${path}`
  }

  const formatDateTime = (value?: string) => {
    if (!value) return '-'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '-'
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const handleEditClick = () => {
    if (me) {
      setEditForm({
        nickname: me.nickname || '',
        phone: me.phone || '',
        email: me.email || ''
      })
      setIsEditOpen(true)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setEditForm(prev => ({ ...prev, [name]: value }))
  }

  const handleSaveProfile = async () => {
    try {
      const safeTenantId = tenantId.trim() || '1'
      const headers: Record<string, string> = { 'X-Tenant-Id': safeTenantId }
      if (userToken) {
        headers['Authorization'] = `Bearer ${userToken}`
      }

      await http.post('/api/user/me/profile', editForm, { headers })
      
      // Refresh me data
      const meData = await http.get<MeResponse>('/api/user/me', { headers })
      setMe(meData)
      setIsEditOpen(false)
      showToast('更新成功', 'success')
    } catch (e: any) {
      console.error('Update failed', e)
      showToast('更新失败: ' + (e.response?.data?.message || e.message), 'error')
    }
  }

  const handleAvatarClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const safeTenantId = tenantId.trim() || '1'
    const headers: Record<string, string> = { 
        'X-Tenant-Id': safeTenantId,
        'Content-Type': 'multipart/form-data'
    }
    if (userToken) {
        headers['Authorization'] = `Bearer ${userToken}`
    }

    const formData = new FormData()
    formData.append('file', file)

    try {
      await http.post('/api/user/me/avatar', formData, { headers })
      // Refresh me data
      const meData = await http.get<MeResponse>('/api/user/me', { headers: { 'X-Tenant-Id': safeTenantId, 'Authorization': userToken ? `Bearer ${userToken}` : '' } })
      setMe(meData)
      showToast('头像上传成功', 'success')
    } catch (e: any) {
      console.error('Avatar upload failed', e)
      showToast('头像上传失败: ' + (e.response?.data?.message || e.message), 'error')
    }
    
    // Reset input
    if (fileInputRef.current) {
        fileInputRef.current.value = ''
    }
  }

  const handleOpenPayment = (
    id: number,
    name: string,
    priceCents: number,
    periodType: string,
    type: 'monthly' | 'points'
  ) => {
    setSelectedPlan({ id, name, priceCents, periodType, type })
    setPaymentModalOpen(true)
  }

  const handlePaymentSuccess = async () => {
    await refreshMembershipInfo('支付成功，会员权益已更新')
  }

  const refreshMembershipInfo = async (successText?: string) => {
    try {
      const safeTenantId = tenantId.trim() || '1'
      const headers: Record<string, string> = { 'X-Tenant-Id': safeTenantId }
      if (userToken) {
        headers['Authorization'] = `Bearer ${userToken}`
      }
      const membershipData = await http.get<MembershipMeResponse>('/api/user/membership/me', { headers })
      setMembership(membershipData)
      eventBus.emit('points-updated')
      if (successText) {
        showToast(successText, 'success')
      }
    } catch (error: any) {
      showToast('会员信息刷新失败', 'error')
    }
  }

  const handleRedeemInvitation = async () => {
    const code = inviteCode.trim()
    if (!code) {
      showToast('请输入邀请码', 'error')
      return
    }
    setInviteLoading(true)
    try {
      const result = await http.post<InvitationRedeemResult>('/api/user/invitation/redeem', { code })
      await refreshMembershipInfo()
      setInviteCode('')
      setIsInviteOpen(false)
      const successText = result.rewardType === 'MEMBERSHIP'
        ? `兑换成功：${result.membershipName} × ${result.durationCount}`
        : `兑换成功：积分 +${result.points}`
      showToast(successText, 'success')
    } catch (error: any) {
      showToast(error?.response?.data?.msg || error.message || '兑换失败', 'error')
    } finally {
      setInviteLoading(false)
    }
  }

  const totalPoints = Math.max(0, membership?.membership?.pointsBalance || 0)
  const subscriptionPoints = Math.max(0, membership?.membership?.subscriptionPoints || 0)
  const packagePoints = Math.max(0, membership?.membership?.packagePoints || 0)
  const currentPlanName = membership?.plan?.name || (me ? '免费版' : '访客')
  const expireAtText = membership?.membership?.endAt ? formatDateTime(membership.membership.endAt) : '未开通'

  return (
    <div className={styles.mePage}>
      {toast && <Toast message={toast.message} type={toast.type} />}
      <div className={styles.meContainer}>
        {/* Top Section: Dashboard Grid */}
        <div className={styles.dashboardGrid}>
          {/* User Profile Card */}
          <div className={`${styles.dashboardCard} ${styles.userCard}`}>
            <div className={styles.userContent}>
              <div className={styles.userMain}>
                <div className={styles.avatarWrapper} onClick={me ? handleAvatarClick : undefined} title={me ? "点击更换头像" : ""}>
                  {me?.avatarUrl ? (
                    <img src={getAvatarSrc(me.avatarUrl)} alt="avatar" />
                  ) : (
                    <div className={styles.avatarPlaceholder}>
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                    </div>
                  )}
                  {me && (
                    <div className={styles.avatarUploadOverlay}>
                      <svg className={styles.uploadIcon} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                    </div>
                  )}
                </div>
                <input 
                    type="file" 
                    ref={fileInputRef} 
                    style={{ display: 'none' }} 
                    accept="image/*" 
                    onChange={handleFileChange} 
                />

                <div className={styles.userDetails}>
                  <div className={styles.userNameRow}>
                    <h2 className={styles.userName}>{me?.nickname || (me ? '微信用户' : '未登录')}</h2>
                    <span className={styles.userBadge}>{currentPlanName}</span>
                    {me && (
                        <button className={styles.editButton} onClick={handleEditClick}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                            修改
                        </button>
                    )}
                  </div>
                  {me && (
                      <div className={styles.userContact}>
                          {me.phone && (
                              <span>
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                                  {me.phone}
                              </span>
                          )}
                          {me.email && (
                              <span>
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                                  {me.email}
                              </span>
                          )}
                      </div>
                  )}
                </div>
              </div>

              {me && (
                <div className={styles.userStatsCards}>
                  <div className={`${styles.statCard} ${styles.pointsCard}`}>
                    <span className={styles.statCardLabel}>当前积分</span>
                    <span className={styles.statCardValue}>{totalPoints}</span>
                  </div>
                  <div className={`${styles.statCard} ${styles.expireCard}`}>
                    <span className={styles.statCardLabel}>到期时间</span>
                    <span className={styles.statCardValue}>{expireAtText}</span>
                  </div>
                </div>
              )}
            </div>
            <div className={styles.cardDecoration}></div>
          </div>

          {/* Credits Card */}
          <div className={`${styles.dashboardCard} ${styles.creditsCard}`}>
            <div className={styles.creditsContent}>
              <div className={styles.creditsHeader}>
                <div className={styles.inviteTag}>会员/积分通用</div>
                <div className={styles.inviteHeadline}>使用邀请码，获取额外权益</div>
              </div>
              <button className={styles.redeemBtn} onClick={() => setIsInviteOpen(true)}>
                立即兑换权益
              </button>
            </div>
          </div>
        </div>

        {/* Pricing Section */}
        <div className={styles.pricingSection}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>订阅计划</h3>
            <div className={styles.pricingTabs}>
              <button 
                className={`${styles.tabBtn} ${activeTab === 'monthly' ? styles.active : ''}`}
                onClick={() => setActiveTab('monthly')}
              >
                会员计划
              </button>
              <button 
                className={`${styles.tabBtn} ${activeTab === 'points' ? styles.active : ''}`}
                onClick={() => setActiveTab('points')}
              >
                积分加油包
              </button>
            </div>
          </div>

          {activeTab === 'monthly' && (
            <div className={styles.billingToggleWrapper}>
              <div className={styles.billingToggle}>
                <button 
                  className={`${styles.toggleBtn} ${billingCycle === 'MONTHLY' ? styles.toggleActive : ''}`}
                  onClick={() => setBillingCycle('MONTHLY')}
                >
                  月付
                </button>
                <button 
                  className={`${styles.toggleBtn} ${billingCycle === 'YEARLY' ? styles.toggleActive : ''}`}
                  onClick={() => setBillingCycle('YEARLY')}
                >
                  年付
                </button>
              </div>
            </div>
          )}

          <div className={styles.pricingCards}>
            {loading && <div className={styles.loadingState}>加载中...</div>}
            {error && <div className={styles.errorMessage}>加载失败: {error}</div>}
            {!loading && !error && activeTab === 'monthly' && monthlyPlans.filter(p => p.periodType === billingCycle || p.isCustom).length === 0 && (
              <div className={styles.emptyState}>暂无订阅套餐</div>
            )}
            {!loading && !error && activeTab === 'points' && pointPlans.length === 0 && (
              <div className={styles.emptyState}>暂无积分套餐</div>
            )}

            {!loading && !error && (
              activeTab === 'monthly' ? (
                monthlyPlans
                  .filter(plan => plan.periodType === billingCycle || plan.isCustom)
                  .map((plan, index) => (
                  <div key={index} className={`${styles.pricingCard} ${plan.isCustom ? styles.customCard : ''}`}>
                    <div className={styles.cardGlow}></div>
                    <div className={styles.cardHeader}>
                      <h3>{plan.title}</h3>
                      {plan.isCustom ? (
                        <div className={styles.customPrice}>{plan.customTitle}</div>
                      ) : (
                        <div className={styles.priceRow}>
                          <div className={styles.price}>{plan.price}</div>
                          <div className={styles.period}>{plan.period}</div>
                        </div>
                      )}
                    </div>
                    <ul className={styles.featuresList}>
                      {plan.features.map((feature, i) => (
                        <li key={i}>
                          <svg className={styles.checkIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                          {feature}
                        </li>
                      ))}
                    </ul>
                    <button 
                      className={styles.buyBtn}
                      onClick={() => plan.isCustom ? undefined : handleOpenPayment(plan.id, plan.title, plan.priceCents, plan.periodType, 'monthly')}
                    >
                      {plan.isCustom ? '联系顾问' : '立即开通'}
                    </button>
                  </div>
                ))
              ) : (
                pointPlans.map((plan, index) => (
                  <div key={index} className={`${styles.pricingCard} ${styles.pointsCard}`}>
                    <div className={styles.cardGlow}></div>
                    <div className={styles.cardHeader}>
                      <h3>{plan.title}</h3>
                      <div className={styles.price}>{plan.price}</div>
                    </div>
                    <div className={styles.planDescription}>
                      <svg className={styles.checkIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                      {plan.description}
                    </div>
                    <div className="spacer" style={{ flex: 1 }}></div>
                    <button 
                      className={styles.buyBtn}
                      onClick={() => handleOpenPayment(plan.id, plan.title, plan.priceCents, 'POINTS', 'points')}
                    >
                      立即充值
                    </button>
                  </div>
                ))
              )
            )}
          </div>
        </div>
      </div>

      {isEditOpen && (
        <div className={styles.modalOverlay} onClick={() => setIsEditOpen(false)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>编辑个人信息</h3>
              <button className={styles.closeButton} onClick={() => setIsEditOpen(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>昵称</label>
              <input 
                className={styles.formInput} 
                name="nickname" 
                value={editForm.nickname} 
                onChange={handleInputChange}
                placeholder="请输入昵称"
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>手机号</label>
              <input 
                className={styles.formInput} 
                name="phone" 
                value={editForm.phone} 
                onChange={handleInputChange}
                placeholder="请输入手机号"
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>邮箱</label>
              <input 
                className={styles.formInput} 
                name="email" 
                value={editForm.email} 
                onChange={handleInputChange}
                placeholder="请输入邮箱"
              />
            </div>
            <div className={styles.modalActions}>
              <button className={styles.cancelButton} onClick={() => setIsEditOpen(false)}>取消</button>
              <button className={styles.saveButton} onClick={handleSaveProfile}>保存</button>
            </div>
          </div>
        </div>
      )}

      {selectedPlan && (
        <PaymentModal
          isOpen={paymentModalOpen}
          onClose={() => setPaymentModalOpen(false)}
          onPaid={handlePaymentSuccess}
          planId={selectedPlan.id}
          planName={selectedPlan.name}
          priceCents={selectedPlan.priceCents}
          periodType={selectedPlan.periodType}
          type={selectedPlan.type}
        />
      )}

      {isInviteOpen && (
        <div className={styles.modalOverlay} onClick={() => setIsInviteOpen(false)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>兑换权益</h3>
              <button className={styles.closeButton} onClick={() => setIsInviteOpen(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>请输入您的邀请码或兑换码：</label>
              <input
                className={styles.formInput}
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="请输入代码"
              />
            </div>
            <button className={styles.saveButton} onClick={handleRedeemInvitation} disabled={inviteLoading}>
              {inviteLoading ? '兑换中...' : '立即兑换'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default MePage
