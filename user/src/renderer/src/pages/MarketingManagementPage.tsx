import React, { useEffect, useState } from 'react'
import styles from './MarketingManagementPage.module.css'
import http from '../utils/http'
import { Toast, useToast } from '../components/Toast'
import { TagInput } from '../components/TagInput'

// --- Types ---
interface LikeConfig {
  id?: string
  userId?: string
  enabled?: boolean
  likeIntervalStart: number
  likeIntervalEnd: number
  maxDailyLikesPerFriend: number
  maxDailyTotalLikes: number
  keywordFilter: string[]
}

interface CommentConfig {
  id?: string
  userId?: string
  enabled?: boolean
  commentIntervalStart: number
  commentIntervalEnd: number
  maxDailyCommentsPerFriend: number
  maxDailyTotalComments: number
  keywordFilter: string[]
}

interface ScheduledTask {
  id?: string
  userId?: string
  taskType: 'FRIEND' | 'GROUP'
  taskName: string
  executionFrequency: string
  startDate: string
  endDate: string
  startTime: string
  endTime: string
  content: string
  contentType: 'TEXT' | 'IMAGE' | 'VOICE'
  targetIds: string[]
}

// --- API ---
const api = {
  getLikeConfig: () => http.get<any, LikeConfig>('/api/user/marketing/like'),
  saveLikeConfig: (data: LikeConfig) => http.post('/api/user/marketing/like', data),
  getCommentConfig: () => http.get<any, CommentConfig>('/api/user/marketing/comment'),
  saveCommentConfig: (data: CommentConfig) => http.post('/api/user/marketing/comment', data),
  getTasks: (type: string) => http.get<any, ScheduledTask[]>(`/api/user/marketing/tasks?taskType=${type}`),
  saveTask: (data: ScheduledTask) => http.post('/api/user/marketing/tasks', data),
  deleteTask: (id: string) => http.delete(`/api/user/marketing/tasks/${id}`)
}

// --- Components ---

const ToggleSwitch = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => (
  <div className={`${styles.switchWrapper} ${checked ? styles.switchRunning : ''}`}>
    <div className={`${styles.switch} ${checked ? styles.switchActive : ''}`} onClick={onChange}>
      <div className={styles.switchKnob} />
    </div>
  </div>
)

const LikeConfigTab = () => {
  const [config, setConfig] = useState<LikeConfig>({
    enabled: false,
    likeIntervalStart: 60,
    likeIntervalEnd: 120,
    maxDailyLikesPerFriend: 5,
    maxDailyTotalLikes: 100,
    keywordFilter: []
  })
  const [loading, setLoading] = useState(false)
  const { toast, showToast } = useToast()

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    try {
      const res = await api.getLikeConfig()
      if (res) {
        setConfig(res)
      }
    } catch (error) {
      console.error('Failed to load like config', error)
    }
  }

  const handleSave = async () => {
    setLoading(true)
    try {
      await api.saveLikeConfig(config)
      showToast('保存成功', 'success')
    } catch (error) {
      showToast('保存失败', 'error')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.section}>
      {toast && <Toast message={toast.message} type={toast.type} />}
      <div className={styles.sectionHeader} style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className={styles.sectionTitle}>❤️ 点赞互动配置</span>
        </div>
        <ToggleSwitch 
          checked={config.enabled || false} 
          onChange={() => setConfig({ ...config, enabled: !config.enabled })} 
        />
      </div>
      <div className={styles.rowGrid}>
        <div className={styles.formGroup}>
          <label className={styles.label}>点赞间隔 (秒)</label>
          <span className={styles.subLabel}>设置互动之间的时间间隔范围</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="number"
              className={styles.input}
              value={config.likeIntervalStart}
              onChange={(e) => setConfig({ ...config, likeIntervalStart: parseInt(e.target.value) || 0 })}
            />
            <span style={{ color: '#8a95ac' }}>-</span>
            <input
              type="number"
              className={styles.input}
              value={config.likeIntervalEnd}
              onChange={(e) => setConfig({ ...config, likeIntervalEnd: parseInt(e.target.value) || 0 })}
            />
          </div>
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>单好友每日次数</label>
          <span className={styles.subLabel}>每天对单个好友的互动上限</span>
          <input
            type="number"
            className={styles.input}
            value={config.maxDailyLikesPerFriend}
            onChange={(e) => setConfig({ ...config, maxDailyLikesPerFriend: parseInt(e.target.value) || 0 })}
          />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>每日总次数</label>
          <span className={styles.subLabel}>每天所有互动的总上限</span>
          <input
            type="number"
            className={styles.input}
            value={config.maxDailyTotalLikes}
            onChange={(e) => setConfig({ ...config, maxDailyTotalLikes: parseInt(e.target.value) || 0 })}
          />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>关键词过滤</label>
          <span className={styles.subLabel}>包含关键词时不进行互动</span>
          <div style={{ marginTop: '8px' }}>
            <TagInput
              value={config.keywordFilter || []}
              onChange={(val) => setConfig({ ...config, keywordFilter: val })}
              placeholder="输入关键词，按回车生成标签"
            />
          </div>
        </div>
      </div>
      <div className={styles.actionRow}>
        <button className={styles.primaryBtn} onClick={handleSave} disabled={loading}>
          {loading ? '保存中...' : '保存配置'}
        </button>
      </div>
    </div>
  )
}

const CommentConfigTab = () => {
  const [config, setConfig] = useState<CommentConfig>({
    enabled: false,
    commentIntervalStart: 120,
    commentIntervalEnd: 180,
    maxDailyCommentsPerFriend: 3,
    maxDailyTotalComments: 50,
    keywordFilter: []
  })
  const [loading, setLoading] = useState(false)
  const { toast, showToast } = useToast()

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    try {
      const res = await api.getCommentConfig()
      if (res) {
        setConfig(res)
      }
    } catch (error) {
      console.error('Failed to load comment config', error)
    }
  }

  const handleSave = async () => {
    setLoading(true)
    try {
      await api.saveCommentConfig(config)
      showToast('保存成功', 'success')
    } catch (error) {
      showToast('保存失败', 'error')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.section}>
      {toast && <Toast message={toast.message} type={toast.type} />}
      <div className={styles.sectionHeader} style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className={styles.sectionTitle}>💬 评论互动配置</span>
        </div>
        <ToggleSwitch 
          checked={config.enabled || false} 
          onChange={() => setConfig({ ...config, enabled: !config.enabled })} 
        />
      </div>
      <div className={styles.rowGrid}>
        <div className={styles.formGroup}>
          <label className={styles.label}>评论间隔 (秒)</label>
          <span className={styles.subLabel}>设置互动之间的时间间隔范围</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="number"
              className={styles.input}
              value={config.commentIntervalStart}
              onChange={(e) => setConfig({ ...config, commentIntervalStart: parseInt(e.target.value) || 0 })}
            />
            <span style={{ color: '#8a95ac' }}>-</span>
            <input
              type="number"
              className={styles.input}
              value={config.commentIntervalEnd}
              onChange={(e) => setConfig({ ...config, commentIntervalEnd: parseInt(e.target.value) || 0 })}
            />
          </div>
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>单好友每日次数</label>
          <span className={styles.subLabel}>每天对单个好友的互动上限</span>
          <input
            type="number"
            className={styles.input}
            value={config.maxDailyCommentsPerFriend}
            onChange={(e) => setConfig({ ...config, maxDailyCommentsPerFriend: parseInt(e.target.value) || 0 })}
          />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>每日总次数</label>
          <span className={styles.subLabel}>每天所有互动的总上限</span>
          <input
            type="number"
            className={styles.input}
            value={config.maxDailyTotalComments}
            onChange={(e) => setConfig({ ...config, maxDailyTotalComments: parseInt(e.target.value) || 0 })}
          />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>关键词过滤</label>
          <span className={styles.subLabel}>包含关键词时不进行互动</span>
          <div style={{ marginTop: '8px' }}>
            <TagInput
              value={config.keywordFilter || []}
              onChange={(val) => setConfig({ ...config, keywordFilter: val })}
              placeholder="输入关键词，按回车生成标签"
            />
          </div>
        </div>
      </div>
      <div className={styles.actionRow}>
        <button className={styles.primaryBtn} onClick={handleSave} disabled={loading}>
          {loading ? '保存中...' : '保存配置'}
        </button>
      </div>
    </div>
  )
}

const ScheduledTasksTab = () => {
  const [activeSubTab, setActiveSubTab] = useState<'FRIEND' | 'GROUP'>('FRIEND')
  const [tasks, setTasks] = useState<ScheduledTask[]>([])
  const [showModal, setShowModal] = useState(false)
  const [currentTask, setCurrentTask] = useState<ScheduledTask | null>(null)
  const { toast, showToast } = useToast()
  
  // Default new task
  const newTask: ScheduledTask = {
    taskType: activeSubTab,
    taskName: '',
    executionFrequency: 'DAILY',
    startDate: '',
    endDate: '',
    startTime: '09:00',
    endTime: '18:00',
    content: '',
    contentType: 'TEXT',
    targetIds: []
  }

  useEffect(() => {
    loadTasks()
  }, [activeSubTab])

  const loadTasks = async () => {
    try {
      const res = await api.getTasks(activeSubTab)
      setTasks(res || [])
    } catch (error) {
      console.error('Failed to load tasks', error)
    }
  }

  const handleEdit = (task: ScheduledTask) => {
    setCurrentTask(task)
    setShowModal(true)
  }

  const handleAdd = () => {
    setCurrentTask({ ...newTask, taskType: activeSubTab })
    setShowModal(true)
  }

  const handleDelete = async (id: string) => {
    if (confirm('确定要删除该任务吗？')) {
      try {
        await api.deleteTask(id)
        showToast('删除成功', 'success')
        loadTasks()
      } catch (error) {
        showToast('删除失败', 'error')
      }
    }
  }

  const handleSave = async () => {
    if (!currentTask) return
    try {
      await api.saveTask(currentTask)
      showToast('保存成功', 'success')
      setShowModal(false)
      loadTasks()
    } catch (error) {
      showToast('保存失败', 'error')
    }
  }

  return (
    <div className={styles.section}>
      {toast && <Toast message={toast.message} type={toast.type} />}
      <div className={styles.subTabs}>
        <div 
          className={`${styles.subTab} ${activeSubTab === 'FRIEND' ? styles.subTabActive : ''}`}
          onClick={() => setActiveSubTab('FRIEND')}
        >
          好友定时任务
        </div>
        <div 
          className={`${styles.subTab} ${activeSubTab === 'GROUP' ? styles.subTabActive : ''}`}
          onClick={() => setActiveSubTab('GROUP')}
        >
          群聊定时任务
        </div>
      </div>

      <div className={styles.taskListHeader}>
        <span className={styles.sectionTitle}>⏱️ {activeSubTab === 'FRIEND' ? '好友' : '群聊'}定时任务列表</span>
        <button className={styles.addBtn} onClick={handleAdd}>
          <span>+</span> 新增任务
        </button>
      </div>

      <div className={styles.taskList}>
        {tasks.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#9ca3af', padding: '20px' }}>暂无任务</div>
        ) : (
          tasks.map(task => (
            <div key={task.id} className={styles.taskItem}>
              <div className={styles.taskInfo}>
                <span className={styles.taskName}>{task.taskName}</span>
                <span className={styles.taskDetail}>
                  {task.executionFrequency === 'DAILY' ? '每天' : task.executionFrequency} | {task.startTime}-{task.endTime}
                </span>
              </div>
              <div className={styles.taskActions}>
                <button className={styles.iconBtn} onClick={() => handleEdit(task)}>✏️</button>
                <button className={`${styles.iconBtn} ${styles.deleteBtn}`} onClick={() => handleDelete(task.id!)}>🗑️</button>
              </div>
            </div>
          ))
        )}
      </div>

      {showModal && currentTask && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <span className={styles.modalTitle}>
                {currentTask.id ? '编辑' : '新增'}{activeSubTab === 'FRIEND' ? '好友' : '群聊'}定时任务
              </span>
              <button className={styles.closeBtn} onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className={styles.modalContent}>
              <div className={styles.rowGrid}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>任务名称</label>
                  <span className={styles.subLabel}>设置任务的识别名称</span>
                  <input
                    type="text"
                    className={styles.input}
                    value={currentTask.taskName}
                    onChange={(e) => setCurrentTask({ ...currentTask, taskName: e.target.value })}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>执行频率</label>
                  <span className={styles.subLabel}>设置任务重复执行的周期</span>
                  <select
                    className={styles.select}
                    value={currentTask.executionFrequency}
                    onChange={(e) => setCurrentTask({ ...currentTask, executionFrequency: e.target.value })}
                  >
                    <option value="DAILY">每天</option>
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>定时日期段</label>
                  <span className={styles.subLabel}>设置任务执行的日期范围</span>
                  <div className={styles.dateRow}>
                    <input
                      type="date"
                      className={styles.input}
                      value={currentTask.startDate}
                      onChange={(e) => setCurrentTask({ ...currentTask, startDate: e.target.value })}
                    />
                    <span className={styles.separator}>-</span>
                    <input
                      type="date"
                      className={styles.input}
                      value={currentTask.endDate}
                      onChange={(e) => setCurrentTask({ ...currentTask, endDate: e.target.value })}
                    />
                  </div>
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>时间段选择</label>
                  <span className={styles.subLabel}>设置任务执行的时间范围</span>
                  <div className={styles.dateRow}>
                    <input
                      type="time"
                      className={styles.input}
                      value={currentTask.startTime}
                      onChange={(e) => setCurrentTask({ ...currentTask, startTime: e.target.value })}
                    />
                    <span className={styles.separator}>-</span>
                    <input
                      type="time"
                      className={styles.input}
                      value={currentTask.endTime}
                      onChange={(e) => setCurrentTask({ ...currentTask, endTime: e.target.value })}
                    />
                  </div>
                </div>
                <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                  <label className={styles.label}>任务内容</label>
                  <span className={styles.subLabel}>支持文本、图片和收藏夹内容</span>
                  <textarea
                    className={styles.textarea}
                    placeholder="输入任务文字内容..."
                    value={currentTask.content}
                    onChange={(e) => setCurrentTask({ ...currentTask, content: e.target.value })}
                  />
                </div>
                <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                   {/* Placeholder for buttons */}
                   <div style={{display: 'flex', gap: '8px'}}>
                     <button className={styles.secondaryBtn}>🖼️ 添加图片</button>
                     <button className={styles.secondaryBtn}>🎙️ 添加语音</button>
                   </div>
                </div>
                <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                  <label className={styles.label}>指定用户</label>
                  <span className={styles.subLabel}>选择任务执行的目标对象</span>
                  <div style={{ marginTop: '8px' }}>
                    <TagInput
                      value={currentTask.targetIds || []}
                      onChange={(val) => setCurrentTask({ ...currentTask, targetIds: val })}
                      placeholder="输入用户ID，按回车生成标签"
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.secondaryBtn} onClick={() => setShowModal(false)}>取消</button>
              <button className={styles.primaryBtn} onClick={handleSave}>保存任务</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// --- Main Page ---

const MarketingManagementPage = () => {
  const [activeTab, setActiveTab] = useState<'LIKE' | 'COMMENT' | 'TASK'>('LIKE')

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.tabs}>
          <div 
            className={`${styles.tab} ${activeTab === 'LIKE' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('LIKE')}
          >
            点赞配置
          </div>
          <div 
            className={`${styles.tab} ${activeTab === 'COMMENT' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('COMMENT')}
          >
            评论配置
          </div>
          <div 
            className={`${styles.tab} ${activeTab === 'TASK' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('TASK')}
          >
            定时任务
          </div>
        </div>
      </div>

      <div className={styles.content}>
        {activeTab === 'LIKE' && <LikeConfigTab />}
        {activeTab === 'COMMENT' && <CommentConfigTab />}
        {activeTab === 'TASK' && <ScheduledTasksTab />}
      </div>
    </div>
  )
}

export default MarketingManagementPage
