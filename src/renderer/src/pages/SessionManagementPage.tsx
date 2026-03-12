import React, { useEffect, useRef, useState } from 'react'
import http from '../utils/http'
import styles from './SessionManagementPage.module.css'
import { Toast } from '../components/Toast'
import { TagInput } from '../components/TagInput'

type Props = {
  backendBaseUrl: string
  tenantId: string
  userToken: string
}

type SceneType = 'SINGLE' | 'GROUP'

interface SessionConfigData {
  sceneConfig: {
    sceneType: SceneType
    enabled: number
    memoryRounds: number
    replyIntervalStartSec: number
    replyIntervalEndSec: number
    groupReplyStartTime: string
    groupReplyEndTime: string
    groupCooldownSec: number
    status: string
  }
  replyStrategy: {
    aiStopReplyEnabled: number
    manualHandoffEnabled: number
    manualHandoffMessage: string
    handoffPhone: string
    handoffPhoneEnabled: number
    groupKeywordTriggerEnabled: number
  }
  aiStopReplyKeywords: string[]
  manualHandoffKeywords: string[]
  groupTriggerKeywords: string[]
}

interface SavePayload {
  sceneType: SceneType
  enabled: boolean
  memoryRounds: number
  replyIntervalStartSec: number
  replyIntervalEndSec: number
  groupReplyStartTime: string
  groupReplyEndTime: string
  groupCooldownSec: number
  aiStopReplyEnabled: boolean
  aiStopReplyKeywords: string[]
  manualHandoffEnabled: boolean
  manualHandoffKeywords: string[]
  manualHandoffMessage: string
  handoffPhone: string
  handoffPhoneEnabled: boolean
  groupKeywordTriggerEnabled: boolean
  groupTriggerKeywords: string[]
}

const emptyPayload = (sceneType: SceneType): SavePayload => ({
  sceneType,
  enabled: sceneType === 'GROUP',
  memoryRounds: 5,
  replyIntervalStartSec: sceneType === 'GROUP' ? 60 : 3,
  replyIntervalEndSec: sceneType === 'GROUP' ? 60 : 8,
  groupReplyStartTime: sceneType === 'GROUP' ? '09:00' : '',
  groupReplyEndTime: sceneType === 'GROUP' ? '18:00' : '',
  groupCooldownSec: sceneType === 'GROUP' ? 60 : 0,
  aiStopReplyEnabled: false,
  aiStopReplyKeywords: [],
  manualHandoffEnabled: false,
  manualHandoffKeywords: sceneType === 'SINGLE' ? ['人工投诉'] : [],
  manualHandoffMessage: '正在为您转接人工客服，请稍候...',
  handoffPhone: '13800138000',
  handoffPhoneEnabled: sceneType === 'SINGLE',
  groupKeywordTriggerEnabled: sceneType === 'GROUP',
  groupTriggerKeywords: []
})

export default function SessionManagementPage(props: Props): JSX.Element {
  const { backendBaseUrl, tenantId, userToken } = props
  const [activeTab, setActiveTab] = useState<SceneType>('SINGLE')
  const [singleForm, setSingleForm] = useState<SavePayload>(emptyPayload('SINGLE'))
  const [groupForm, setGroupForm] = useState<SavePayload>(emptyPayload('GROUP'))
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const mapFromApi = (sceneType: SceneType, data?: SessionConfigData): SavePayload => ({
    sceneType,
    enabled: data?.sceneConfig?.enabled === 1,
    memoryRounds: data?.sceneConfig?.memoryRounds ?? (sceneType === 'GROUP' ? 5 : 5),
    replyIntervalStartSec: data?.sceneConfig?.replyIntervalStartSec ?? (sceneType === 'GROUP' ? 60 : 3),
    replyIntervalEndSec: data?.sceneConfig?.replyIntervalEndSec ?? (sceneType === 'GROUP' ? 60 : 8),
    groupReplyStartTime: data?.sceneConfig?.groupReplyStartTime || (sceneType === 'GROUP' ? '09:00' : ''),
    groupReplyEndTime: data?.sceneConfig?.groupReplyEndTime || (sceneType === 'GROUP' ? '18:00' : ''),
    groupCooldownSec: data?.sceneConfig?.groupCooldownSec ?? (sceneType === 'GROUP' ? 60 : 0),
    aiStopReplyEnabled: data?.replyStrategy?.aiStopReplyEnabled === 1,
    aiStopReplyKeywords: data?.aiStopReplyKeywords || [],
    manualHandoffEnabled: data?.replyStrategy?.manualHandoffEnabled === 1,
    manualHandoffKeywords: data?.manualHandoffKeywords || (sceneType === 'SINGLE' ? ['人工投诉'] : []),
    manualHandoffMessage: data?.replyStrategy?.manualHandoffMessage || '正在为您转接人工客服，请稍候...',
    handoffPhone: data?.replyStrategy?.handoffPhone || '13800138000',
    handoffPhoneEnabled: data?.replyStrategy?.handoffPhoneEnabled === 1,
    groupKeywordTriggerEnabled: data?.replyStrategy?.groupKeywordTriggerEnabled === 1,
    groupTriggerKeywords: data?.groupTriggerKeywords || []
  })

  const loadAll = async () => {
    setLoading(true)
    try {
      const [singleData, groupData] = await Promise.all([
        http.get<SessionConfigData>('/api/user/session-management/config?sceneType=SINGLE'),
        http.get<SessionConfigData>('/api/user/session-management/config?sceneType=GROUP')
      ])
      setSingleForm(mapFromApi('SINGLE', singleData))
      setGroupForm(mapFromApi('GROUP', groupData))
    } finally {
      setLoading(false)
    }
  }

  const doSave = async () => {
    if (saving) return
    setSaving(true)
    try {
      const apiPayload =
        activeTab === 'SINGLE'
          ? {
              sceneType: singleForm.sceneType,
              enabled: singleForm.enabled,
              memoryRounds: singleForm.memoryRounds,
              replyIntervalStartSec: singleForm.replyIntervalStartSec,
              replyIntervalEndSec: singleForm.replyIntervalEndSec,
              aiStopReplyEnabled: singleForm.aiStopReplyEnabled,
              aiStopReplyKeywords: singleForm.aiStopReplyKeywords,
              manualHandoffEnabled: singleForm.manualHandoffEnabled,
              manualHandoffKeywords: singleForm.manualHandoffKeywords,
              manualHandoffMessage: singleForm.manualHandoffMessage,
              handoffPhone: singleForm.handoffPhone,
              handoffPhoneEnabled: singleForm.handoffPhoneEnabled
            }
          : {
              sceneType: groupForm.sceneType,
              enabled: groupForm.enabled,
              memoryRounds: groupForm.memoryRounds,
              groupReplyStartTime: groupForm.groupReplyStartTime,
              groupReplyEndTime: groupForm.groupReplyEndTime,
              groupCooldownSec: groupForm.groupCooldownSec,
              groupKeywordTriggerEnabled: groupForm.groupKeywordTriggerEnabled,
              groupTriggerKeywords: groupForm.groupTriggerKeywords
            }
      await http.post('/api/user/session-management/config', apiPayload)
      setToast({ message: '保存成功', type: 'success' })
      setTimeout(() => setToast(null), 3000)
    } catch (e) {
      console.error('Save failed:', e)
      setToast({ message: '保存失败: ' + (e instanceof Error ? e.message : String(e)), type: 'error' })
      setTimeout(() => setToast(null), 3000)
    } finally {
      setSaving(false)
    }
  }

  const patchSingle = (updater: (prev: SavePayload) => SavePayload) => {
    setSingleForm((prev) => updater(prev))
  }

  const patchGroup = (updater: (prev: SavePayload) => SavePayload) => {
    setGroupForm((prev) => updater(prev))
  }

  useEffect(() => {
    if (backendBaseUrl && userToken) {
      loadAll().catch(() => {
        setSingleForm(emptyPayload('SINGLE'))
        setGroupForm(emptyPayload('GROUP'))
      })
    }
  }, [backendBaseUrl, tenantId, userToken])

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${activeTab === 'SINGLE' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('SINGLE')}
          >
            单人对话
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'GROUP' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('GROUP')}
          >
            群聊配置
          </button>
        </div>
        <button className={styles.saveBtn} onClick={doSave} disabled={loading || saving}>
          {saving ? '保存中...' : '保存配置'}
        </button>
      </div>
      
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <div className={styles.body}>
        {loading && <div className={styles.loading}>正在加载配置...</div>}

        {!loading && activeTab === 'SINGLE' && (
          <>
            <div className={styles.sectionTitle}>基础对话配置</div>
            <section className={styles.card}>
              <div className={styles.rowGrid}>
                <label className={styles.field}>
                  <span className={styles.label}>会话记忆轮数</span>
                  <span className={styles.helper}>AI 记忆本次多轮对话</span>
                  <input
                    className={styles.input}
                    type="number"
                    min={1}
                    value={singleForm.memoryRounds}
                    onChange={(e) => patchSingle((prev) => ({ ...prev, memoryRounds: Number(e.target.value) || 1 }))}
                  />
                </label>
                <div className={styles.field}>
                  <span className={styles.label}>回复间隔（秒）</span>
                  <span className={styles.helper}>设置 AI 回复时间范围</span>
                  <div className={styles.inline}>
                    <input
                      className={styles.input}
                      type="number"
                      min={0}
                      value={singleForm.replyIntervalStartSec}
                      onChange={(e) => patchSingle((prev) => ({ ...prev, replyIntervalStartSec: Number(e.target.value) || 0 }))}
                    />
                    <span className={styles.sep}>-</span>
                    <input
                      className={styles.input}
                      type="number"
                      min={0}
                      value={singleForm.replyIntervalEndSec}
                      onChange={(e) => patchSingle((prev) => ({ ...prev, replyIntervalEndSec: Number(e.target.value) || 0 }))}
                    />
                  </div>
                </div>
              </div>
            </section>

            <div className={styles.sectionTitle}>回复策略</div>
            <section className={styles.card}>
              <div className={styles.strategyRow}>
                <div className={styles.strategyLabel}>
                  <div className={styles.labelMain}>AI 停止回复</div>
                  <div className={styles.helper}>设置关键词触发停止</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, justifyContent: 'flex-end' }}>
                  <div style={{ flex: 1, maxWidth: '400px' }}>
                    <TagInput
                      value={singleForm.aiStopReplyKeywords}
                      onChange={(val) => patchSingle((prev) => ({ ...prev, aiStopReplyKeywords: val }))}
                      placeholder="输入关键词，按回车生成标签"
                      disabled={!singleForm.aiStopReplyEnabled}
                    />
                  </div>
                  <button
                    className={`${styles.switch} ${singleForm.aiStopReplyEnabled ? styles.switchChecked : ''}`}
                    onClick={() => patchSingle((prev) => ({ ...prev, aiStopReplyEnabled: !prev.aiStopReplyEnabled }))}
                  >
                    <span className={styles.switchHandle} />
                  </button>
                </div>
              </div>
            </section>

            <section className={styles.card}>
              <div className={styles.strategyRow}>
                <div className={styles.strategyLabel}>
                  <div className={styles.labelMain}>人工介入</div>
                  <div className={styles.helper}>当触发人工介入时发送提示</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, justifyContent: 'flex-end' }}>
                  <div style={{ flex: 1, maxWidth: '400px' }}>
                    <TagInput
                      value={singleForm.manualHandoffKeywords}
                      onChange={(val) => patchSingle((prev) => ({ ...prev, manualHandoffKeywords: val }))}
                      placeholder="输入关键词，按回车生成标签"
                      disabled={!singleForm.manualHandoffEnabled}
                    />
                  </div>
                  <button
                    className={`${styles.switch} ${singleForm.manualHandoffEnabled ? styles.switchChecked : ''}`}
                    onClick={() => patchSingle((prev) => ({ ...prev, manualHandoffEnabled: !prev.manualHandoffEnabled }))}
                  >
                    <span className={styles.switchHandle} />
                  </button>
                </div>
              </div>

              <textarea
                className={styles.textarea}
                value={singleForm.manualHandoffMessage}
                onChange={(e) => patchSingle((prev) => ({ ...prev, manualHandoffMessage: e.target.value }))}
              />

              <div className={styles.phoneRow}>
                <div className={styles.phoneLabel}>发送手机号</div>
                <input
                  className={styles.phoneInput}
                  value={singleForm.handoffPhone}
                  onChange={(e) => patchSingle((prev) => ({ ...prev, handoffPhone: e.target.value }))}
                />
                <button
                  className={`${styles.switch} ${singleForm.handoffPhoneEnabled ? styles.switchChecked : ''}`}
                  onClick={() => patchSingle((prev) => ({ ...prev, handoffPhoneEnabled: !prev.handoffPhoneEnabled }))}
                >
                  <span className={styles.switchHandle} />
                </button>
              </div>
            </section>
          </>
        )}

        {!loading && activeTab === 'GROUP' && (
          <>
            <div className={styles.sectionTitle}>群聊 AI 运营</div>
            <section className={styles.card}>
              <div className={styles.strategyRow}>
                <div className={styles.strategyLabel}>
                  <div className={styles.labelMain}>开启群聊 AI</div>
                  <div className={styles.helper}>是否允许 AI 在群聊中自动回复</div>
                </div>
                <button
                  className={`${styles.switch} ${groupForm.enabled ? styles.switchChecked : ''}`}
                  onClick={() => patchGroup((prev) => ({ ...prev, enabled: !prev.enabled }))}
                >
                  <span className={styles.switchHandle} />
                </button>
              </div>

              <div className={styles.divider} />

              <div className={styles.rowGrid}>
                <div className={styles.field}>
                  <span className={styles.label}>群回复时间段</span>
                  <span className={styles.helper}>设置 AI 在群聊中生效时间</span>
                  <div className={styles.inline}>
                    <input
                      className={styles.timeInput}
                      type="time"
                      value={groupForm.groupReplyStartTime}
                      onChange={(e) => patchGroup((prev) => ({ ...prev, groupReplyStartTime: e.target.value }))}
                    />
                    <span className={styles.sep}>-</span>
                    <input
                      className={styles.timeInput}
                      type="time"
                      value={groupForm.groupReplyEndTime}
                      onChange={(e) => patchGroup((prev) => ({ ...prev, groupReplyEndTime: e.target.value }))}
                    />
                  </div>
                </div>
                <label className={styles.field}>
                  <span className={styles.label}>回复频率控制（秒）</span>
                  <span className={styles.helper}>设置群回复最小间隔</span>
                  <input
                    className={styles.input}
                    type="number"
                    min={0}
                    value={groupForm.groupCooldownSec}
                    onChange={(e) => patchGroup((prev) => ({ ...prev, groupCooldownSec: Number(e.target.value) || 0 }))}
                  />
                </label>
              </div>

              <div className={styles.divider} />

              <div className={styles.strategyRow}>
                <div className={styles.strategyLabel}>
                  <div className={styles.labelMain}>群消息关键词触发</div>
                  <div className={styles.helper}>仅回复包含特定关键词的消息</div>
                </div>
                <button
                  className={`${styles.switch} ${groupForm.groupKeywordTriggerEnabled ? styles.switchChecked : ''}`}
                  onClick={() => patchGroup((prev) => ({ ...prev, groupKeywordTriggerEnabled: !prev.groupKeywordTriggerEnabled }))}
                >
                  <span className={styles.switchHandle} />
                </button>
              </div>
              
              <div style={{ marginTop: '12px' }}>
                <TagInput
                  value={groupForm.groupTriggerKeywords}
                  onChange={(val) => patchGroup((prev) => ({ ...prev, groupTriggerKeywords: val }))}
                  placeholder="输入关键词，按回车生成标签"
                  disabled={!groupForm.groupKeywordTriggerEnabled}
                />
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
