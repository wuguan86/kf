import { useEffect, useMemo, useState } from 'react'
import http from '../utils/http'
import styles from './DataStatisticsPage.module.css'

type PeriodStats = {
  highIntentCount: number
  midIntentCount: number
  lowIntentCount: number
}

type OverviewStats = {
  today: PeriodStats
  yesterday: PeriodStats
  sevenDays: PeriodStats
  thirtyDays: PeriodStats
}

type CustomerItem = {
  customerName: string
  intentLevel: number
  intentLabel: string
  dailySummary: string
  lastChatTime: string | null
}

type CustomerListResponse = {
  total: number
  list: CustomerItem[]
}

const api = {
  getOverview: () => http.get<any, OverviewStats>('/api/user/marketing/statistics/overview'),
  getCustomers: (pageNo: number, pageSize: number) =>
    http.get<any, CustomerListResponse>(`/api/user/marketing/statistics/customers?pageNo=${pageNo}&pageSize=${pageSize}`)
}

const PERIODS: Array<{ key: keyof OverviewStats; label: string }> = [
  { key: 'today', label: '今日' },
  { key: 'yesterday', label: '昨日' },
  { key: 'sevenDays', label: '7天' },
  { key: 'thirtyDays', label: '30天' }
]

const intentClassMap: Record<number, string> = {
  1: styles.lowTag,
  2: styles.midTag,
  3: styles.highTag
}

const formatTime = (value: string | null) => {
  if (!value) return '暂无'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')} ${`${date.getHours()}`.padStart(2, '0')}:${`${date.getMinutes()}`.padStart(2, '0')}`
}

export default function DataStatisticsPage() {
  const [overview, setOverview] = useState<OverviewStats | null>(null)
  const [customers, setCustomers] = useState<CustomerItem[]>([])
  const [total, setTotal] = useState(0)
  const [pageNo, setPageNo] = useState(1)
  const [pageSize] = useState(20)
  const [loadingOverview, setLoadingOverview] = useState(false)
  const [loadingCustomers, setLoadingCustomers] = useState(false)

  useEffect(() => {
    const loadOverview = async () => {
      setLoadingOverview(true)
      try {
        const result = await api.getOverview()
        setOverview(result)
      } finally {
        setLoadingOverview(false)
      }
    }
    loadOverview()
  }, [])

  useEffect(() => {
    const loadCustomers = async () => {
      setLoadingCustomers(true)
      try {
        const result = await api.getCustomers(pageNo, pageSize)
        setCustomers(result?.list || [])
        setTotal(result?.total || 0)
      } finally {
        setLoadingCustomers(false)
      }
    }
    loadCustomers()
  }, [pageNo, pageSize])

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize])

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>数据统计</h1>
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>客户统计</h2>
        </div>
        {loadingOverview && <div className={styles.loading}>加载中...</div>}
        {!loadingOverview && overview && (
          <div className={styles.grid}>
            {PERIODS.map(({ key, label }) => {
              const row = overview[key]
              return (
                <div key={key} className={styles.periodCard}>
                  <div className={styles.periodTitle}>{label}</div>
                  <div className={styles.metricRow}>
                    <span className={styles.metricLabel}>高意向</span>
                    <span className={`${styles.metricValue} ${styles.highValue}`}>{row?.highIntentCount || 0}</span>
                  </div>
                  <div className={styles.metricRow}>
                    <span className={styles.metricLabel}>中意向</span>
                    <span className={`${styles.metricValue} ${styles.midValue}`}>{row?.midIntentCount || 0}</span>
                  </div>
                  <div className={styles.metricRow}>
                    <span className={styles.metricLabel}>低意向</span>
                    <span className={`${styles.metricValue} ${styles.lowValue}`}>{row?.lowIntentCount || 0}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>客户列表</h2>
          <span className={styles.total}>共 {total} 人</span>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>名字</th>
                <th>意向度</th>
                <th>今日对话总结</th>
                <th>最后聊天时间</th>
              </tr>
            </thead>
            <tbody>
              {loadingCustomers && (
                <tr>
                  <td colSpan={4} className={styles.emptyCell}>加载中...</td>
                </tr>
              )}
              {!loadingCustomers && customers.length === 0 && (
                <tr>
                  <td colSpan={4} className={styles.emptyCell}>暂无客户数据</td>
                </tr>
              )}
              {!loadingCustomers && customers.map((item) => (
                <tr key={`${item.customerName}-${item.lastChatTime || ''}`}>
                  <td className={styles.nameCell}>{item.customerName || '未知客户'}</td>
                  <td>
                    <span className={`${styles.intentTag} ${intentClassMap[item.intentLevel] || styles.unknownTag}`}>
                      {item.intentLabel || '未知'}
                    </span>
                  </td>
                  <td className={styles.summaryCell}>{item.dailySummary || '暂无总结'}</td>
                  <td>{formatTime(item.lastChatTime)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={styles.pagination}>
          <button
            className={styles.pageBtn}
            disabled={pageNo <= 1}
            onClick={() => setPageNo((prev) => Math.max(1, prev - 1))}
          >
            上一页
          </button>
          <span className={styles.pageInfo}>
            第 {pageNo} / {totalPages} 页
          </span>
          <button
            className={styles.pageBtn}
            disabled={pageNo >= totalPages}
            onClick={() => setPageNo((prev) => Math.min(totalPages, prev + 1))}
          >
            下一页
          </button>
        </div>
      </div>
    </div>
  )
}
