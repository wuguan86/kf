import { useEffect, useState } from 'react'
import styles from './SmartSalesPage.module.css'
import { useToast, Toast } from '../../components/Toast'
import {
  smartSalesApi,
  DashboardView,
  CustomerListItem,
  CustomerListResponse,
  STAGE_OPTIONS
} from '../../api/smartSales'
import CustomerProfileDetail from './CustomerProfileDetail'

type TabKey = 'dashboard' | 'list'

export default function SmartSalesPage(): JSX.Element {
  const [tab, setTab] = useState<TabKey>('dashboard')
  const [selectedContactKey, setSelectedContactKey] = useState<string | null>(null)
  const { toast, showToast } = useToast()

  const handleOpenProfile = (contactKey: string) => {
    setSelectedContactKey(contactKey)
  }

  const handleBack = () => {
    setSelectedContactKey(null)
  }

  // 选中客户后进入画像详情视图
  if (selectedContactKey) {
    return (
      <CustomerProfileDetail
        contactKey={selectedContactKey}
        onBack={handleBack}
        showToast={showToast}
      />
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.titleBlock}>
          <h1 className={styles.title}>智能销售</h1>
          <div className={styles.subtitle}>客户来自微信消息和意向分析，销售阶段与跟进记录由人工确认维护。</div>
        </div>
      </div>
      <div className={styles.tabs}>
        <div
          className={`${styles.tab} ${tab === 'dashboard' ? styles.tabActive : ''}`}
          onClick={() => setTab('dashboard')}
        >
          客户工作台
        </div>
        <div
          className={`${styles.tab} ${tab === 'list' ? styles.tabActive : ''}`}
          onClick={() => setTab('list')}
        >
          客户列表
        </div>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} />}

      {tab === 'dashboard' && (
        <DashboardTab
          onOpenProfile={handleOpenProfile}
          onGoList={() => setTab('list')}
          showToast={showToast}
        />
      )}
      {tab === 'list' && (
        <CustomerListTab onOpenProfile={handleOpenProfile} showToast={showToast} />
      )}
    </div>
  )
}

// ===================== 工作台 =====================
function DashboardTab({
  onOpenProfile,
  onGoList,
  showToast
}: {
  onOpenProfile: (contactKey: string) => void
  onGoList: () => void
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void
}) {
  const [dashboard, setDashboard] = useState<DashboardView | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDashboard()
  }, [])

  const loadDashboard = async () => {
    setLoading(true)
    try {
      const data = await smartSalesApi.getDashboard()
      setDashboard(data)
    } catch (error) {
      console.error('加载工作台失败', error)
      showToast('加载工作台失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className={styles.loading}>正在加载工作台...</div>
  }
  if (!dashboard) {
    return <div className={styles.emptyCell}>暂无数据</div>
  }

  const maxFunnelCount = Math.max(1, ...dashboard.stageFunnel.map((s) => s.count))

  return (
    <>
      <div className={styles.dashboardGrid}>
        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>星标客户</div>
          <div className={styles.metricValue}>{dashboard.starredCount}</div>
        </div>
        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>高意向未建档</div>
          <div className={`${styles.metricValue} ${styles.metricValueHigh}`}>
            {dashboard.highIntentWithoutStageCount}
          </div>
        </div>
        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>今日待跟进</div>
          <div className={styles.metricValue}>{dashboard.todayPendingTotal}</div>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>商机漏斗</h2>
        </div>
        <div className={styles.funnel}>
          {dashboard.stageFunnel.map((stage) => (
            <div className={styles.funnelRow} key={stage.stage}>
              <div className={styles.funnelLabel}>{stage.stageLabel}</div>
              <div className={styles.funnelBarWrap}>
                <div
                  className={styles.funnelBar}
                  style={{ width: `${(stage.count / maxFunnelCount) * 100}%` }}
                />
              </div>
              <div className={styles.funnelCount}>{stage.count}</div>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>待跟进客户</h2>
          <button className={styles.ghostBtn} onClick={onGoList}>
            查看全部
          </button>
        </div>
        {dashboard.todayPendingFollowUps.length === 0 ? (
          <div className={styles.emptyCell}>暂无待跟进客户</div>
        ) : (
          <div className={styles.pendingList}>
            {dashboard.todayPendingFollowUps.map((item) => (
              <div
                key={item.contactKey}
                className={styles.pendingItem}
                onClick={() => onOpenProfile(item.contactKey)}
              >
                <div className={styles.pendingInfo}>
                  <span className={styles.pendingName}>{item.customerName}</span>
                  <span className={styles.pendingTime}>
                    意向：{item.intentLabel} · 计划跟进：{formatTime(item.nextFollowUpAt)}
                  </span>
                </div>
                <span className={`${styles.intentTag} ${intentClass(item.intentLevel)}`}>
                  {item.intentLabel}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

// ===================== 客户列表 =====================
function CustomerListTab({
  onOpenProfile,
  showToast
}: {
  onOpenProfile: (contactKey: string) => void
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void
}) {
  const [list, setList] = useState<CustomerListItem[]>([])
  const [total, setTotal] = useState(0)
  const [pageNo, setPageNo] = useState(1)
  const [pageSize] = useState(20)
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [intentLevel, setIntentLevel] = useState('')
  const [stage, setStage] = useState('')
  const [starred, setStarred] = useState('')
  // 用于触发实际查询的已应用条件
  const [applied, setApplied] = useState({ keyword: '', intentLevel: '', stage: '', starred: '' })

  useEffect(() => {
    loadList(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadList = async (page: number) => {
    setLoading(true)
    try {
      const params: any = { pageNo: page, pageSize }
      if (applied.intentLevel) params.intentLevel = Number(applied.intentLevel)
      if (applied.stage) params.stage = applied.stage
      if (applied.starred === 'true') params.starred = true
      if (applied.keyword.trim()) params.keyword = applied.keyword.trim()
      const data: CustomerListResponse = await smartSalesApi.listCustomers(params)
      setList(data.list || [])
      setTotal(data.total || 0)
      setPageNo(page)
    } catch (error) {
      console.error('加载客户列表失败', error)
      showToast('加载客户列表失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleQuery = () => {
    setApplied({ keyword, intentLevel, stage, starred })
    loadList(1)
  }

  const handleReset = () => {
    setKeyword('')
    setIntentLevel('')
    setStage('')
    setStarred('')
    setApplied({ keyword: '', intentLevel: '', stage: '', starred: '' })
    setTimeout(() => loadList(1), 0)
  }

  const handleToggleStar = async (item: CustomerListItem, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const nextStarred = item.starred === 1 ? 0 : 1
      await smartSalesApi.updateStarred(item.contactKey, nextStarred)
      setList((prev) =>
        prev.map((c) => (c.contactKey === item.contactKey ? { ...c, starred: nextStarred } : c))
      )
      showToast(nextStarred === 1 ? '已星标' : '已取消星标', 'success')
    } catch (error) {
      console.error('切换星标失败', error)
      showToast('操作失败', 'error')
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <>
      <div className={styles.filterBar}>
        <div className={styles.filterItem}>
          <span className={styles.filterLabel}>关键字</span>
          <input
            className={styles.filterInput}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="备注名/联系人"
            onKeyDown={(e) => e.key === 'Enter' && handleQuery()}
          />
        </div>
        <div className={styles.filterItem}>
          <span className={styles.filterLabel}>意向</span>
          <select
            className={styles.filterSelect}
            value={intentLevel}
            onChange={(e) => setIntentLevel(e.target.value)}
          >
            <option value="">全部</option>
            <option value="3">高意向</option>
            <option value="2">中意向</option>
            <option value="1">低意向</option>
          </select>
        </div>
        <div className={styles.filterItem}>
          <span className={styles.filterLabel}>阶段</span>
          <select
            className={styles.filterSelect}
            value={stage}
            onChange={(e) => setStage(e.target.value)}
          >
            <option value="">全部</option>
            {STAGE_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.filterItem}>
          <span className={styles.filterLabel}>星标</span>
          <select
            className={styles.filterSelect}
            value={starred}
            onChange={(e) => setStarred(e.target.value)}
          >
            <option value="">全部</option>
            <option value="true">仅星标</option>
          </select>
        </div>
        <div className={styles.filterActions}>
          <button className={styles.queryBtn} onClick={handleQuery}>
            查询
          </button>
          <button className={styles.resetBtn} onClick={handleReset}>
            重置
          </button>
        </div>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>客户</th>
              <th>意向</th>
              <th>阶段</th>
              <th>标签</th>
              <th>最近事件</th>
              <th>最后沟通</th>
              <th>星标</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className={styles.loading}>
                  正在加载...
                </td>
              </tr>
            ) : list.length === 0 ? (
              <tr>
                <td colSpan={7} className={styles.emptyCell}>
                  暂无客户数据
                </td>
              </tr>
            ) : (
              list.map((item) => (
                <tr key={item.contactKey}>
                  <td
                    className={styles.nameCell}
                    onClick={() => onOpenProfile(item.contactKey)}
                  >
                    {item.customerName}
                  </td>
                  <td>
                    <span className={`${styles.intentTag} ${intentClass(item.intentLevel)}`}>
                      {item.intentLabel}
                    </span>
                  </td>
                  <td>
                    {item.stage ? (
                      <span className={styles.stageTag}>
                        {stageLabel(item.stage)}
                      </span>
                    ) : (
                      <span className={styles.unknownTag}>未建档</span>
                    )}
                  </td>
                  <td>
                    {item.tags && item.tags.length > 0 ? (
                      <div className={styles.tagList}>
                        {item.tags.map((t) => (
                          <span
                            key={t.id}
                            className={styles.tagChip}
                            style={{ backgroundColor: t.color }}
                          >
                            {t.name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className={styles.unknownTag}>无</span>
                    )}
                  </td>
                  <td className={styles.summaryCell}>{item.latestEvent || '—'}</td>
                  <td>{formatTime(item.lastChatTime)}</td>
                  <td
                    className={`${styles.starCell} ${
                      item.starred === 1 ? styles.starActive : ''
                    }`}
                    onClick={(e) => handleToggleStar(item, e)}
                  >
                    {item.starred === 1 ? '★' : '☆'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className={styles.pagination}>
        <button
          className={styles.pageBtn}
          disabled={pageNo <= 1}
          onClick={() => loadList(pageNo - 1)}
        >
          上一页
        </button>
        <span className={styles.pageInfo}>
          第 {pageNo} / {totalPages} 页 · 共 {total} 条
        </span>
        <button
          className={styles.pageBtn}
          disabled={pageNo >= totalPages}
          onClick={() => loadList(pageNo + 1)}
        >
          下一页
        </button>
      </div>
    </>
  )
}

// ===================== 工具函数 =====================
function intentClass(level: number | null): string {
  if (level === 3) return styles.highTag
  if (level === 2) return styles.midTag
  if (level === 1) return styles.lowTag
  return styles.unknownTag
}

function stageLabel(stage: string): string {
  const found = STAGE_OPTIONS.find((s) => s.value === stage)
  return found ? found.label : stage
}

function formatTime(value: string | null): string {
  if (!value) return '暂无'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const pad = (n: number) => `${n}`.padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`
}
