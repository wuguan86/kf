import React, { useState, useEffect } from 'react'
import http from '../utils/http'
import styles from './SettingsPage.module.css'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Toast, useToast } from '../components/Toast'

type Props = {
  backendBaseUrl: string
  tenantId: string
  userToken: string
  setUserToken: (token: string) => void
}

interface Role {
  id: string
  name: string
  content: string
  status: string
  userId: string
  promptTemplateId?: string
  knowledgeBaseId?: string
}

interface PromptTemplate {
  id: string
  name: string
  content: string
}

interface KnowledgeBase {
  id: string
  name: string
  description: string
  status: string
}

export default function SettingsPage(props: Props): JSX.Element {
  const { backendBaseUrl, tenantId, userToken } = props
  const { toast, showToast } = useToast()

  const [view, setView] = useState<'list' | 'form'>('list')
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(false)
  const [editingRole, setEditingRole] = useState<Role | null>(null)

  const [formData, setFormData] = useState<Partial<Role>>({
    name: '',
    content: '',
    status: 'PENDING',
    knowledgeBaseId: ''
  })

  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false)
  const [templates, setTemplates] = useState<PromptTemplate[]>([])
  const [isKnowledgeModalOpen, setIsKnowledgeModalOpen] = useState(false)
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([])
  const [selectedKnowledgeBaseIds, setSelectedKnowledgeBaseIds] = useState<string[]>([])
  const [roleToDelete, setRoleToDelete] = useState<string | null>(null)
  const [isOptimizing, setIsOptimizing] = useState(false)

  const fetchRoles = async () => {
    setLoading(true)
    try {
      const data = await http.get<Role[]>('/api/user/roles')
      setRoles(data)
    } catch (error) {
      console.error('Failed to fetch roles', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchTemplates = async () => {
    try {
      const data = await http.get<PromptTemplate[]>('/api/user/prompt-templates')
      setTemplates(data)
    } catch (error) {
      console.error('Failed to fetch templates', error)
    }
  }

  const fetchKnowledgeBases = async () => {
    try {
      const data = await http.get<KnowledgeBase[]>('/api/user/knowledge-bases')
      setKnowledgeBases(data)
    } catch (error) {
      console.error('Failed to fetch knowledge bases', error)
    }
  }

  const fetchRoleKnowledgeBases = async (roleId: string): Promise<string[]> => {
    try {
      const data = await http.get<KnowledgeBase[]>(`/api/user/roles/${roleId}/knowledge-bases`)
      return data.map(item => item.id)
    } catch (error) {
      console.error('Failed to fetch role knowledge bases', error)
      return []
    }
  }

  useEffect(() => {
    if (backendBaseUrl && userToken) {
      fetchRoles()
    }
  }, [backendBaseUrl, userToken])

  const handleEdit = (role: Role) => {
    setEditingRole(role)
    setFormData({
      name: role.name,
      content: role.content,
      status: role.status,
      knowledgeBaseId: role.knowledgeBaseId
    })
    fetchRoleKnowledgeBases(role.id).then(ids => setSelectedKnowledgeBaseIds(ids))
    fetchKnowledgeBases()
    setView('form')
  }

  const handleDelete = (id: string) => {
    setRoleToDelete(id)
  }

  const confirmDelete = async () => {
    if (!roleToDelete) return
    try {
      await http.delete(`/api/user/roles/${roleToDelete}`)
      showToast('删除成功', 'success')
      fetchRoles()
    } catch (error) {
      console.error('Failed to delete role', error)
      showToast('删除失败', 'error')
    } finally {
      setRoleToDelete(null)
    }
  }

  const handleToggleStatus = async (role: Role) => {
    const newStatus = role.status === 'RUNNING' ? 'PENDING' : 'RUNNING'
    try {
      if (newStatus === 'RUNNING') {
        const runningRoles = roles.filter(item => item.status === 'RUNNING' && item.id !== role.id)
        if (runningRoles.length > 0) {
          await Promise.all(
            runningRoles.map(item =>
              http.put(`/api/user/roles/${item.id}`, {
                ...item,
                status: 'PENDING'
              })
            )
          )
        }
      }
      await http.put(`/api/user/roles/${role.id}`, {
        ...role,
        status: newStatus
      })
      showToast(newStatus === 'RUNNING' ? '角色已开启' : '角色已关闭', 'success')
      fetchRoles()
    } catch (error) {
      console.error('Failed to toggle status', error)
      showToast('状态切换失败', 'error')
    }
  }

  const saveRole = async (returnToList: boolean) => {
    if (!formData.name) {
      showToast('请输入角色名称', 'error')
      return null
    }
    if (formData.name.length > 15) {
      showToast('角色名称不能超过 15 个字符', 'error')
      return null
    }
    try {
      const savedRole = editingRole
        ? await http.put<Role>(`/api/user/roles/${editingRole.id}`, formData)
        : await http.post<Role>('/api/user/roles', formData)
      setEditingRole(savedRole)
      setFormData({
        name: savedRole.name,
        content: savedRole.content,
        status: savedRole.status,
        knowledgeBaseId: savedRole.knowledgeBaseId
      })
      await http.put(`/api/user/roles/${savedRole.id}/knowledge-bases`, {
        knowledgeBaseIds: selectedKnowledgeBaseIds
      })
      showToast(editingRole ? '角色更新成功' : '角色创建成功', 'success')
      if (returnToList) {
        setView('list')
      }
      fetchRoles()
      return savedRole
    } catch (error) {
      console.error('Failed to save role', error)
      showToast('保存失败', 'error')
      return null
    }
  }

  const handleOptimizePrompt = async () => {
    if (!formData.content?.trim()) {
      showToast('请先输入角色设定内容', 'error')
      return
    }
    
    setIsOptimizing(true)
    try {
      // 增加超时时间到 60 秒，因为大模型优化提示词可能需要较长时间
      const response = await http.post<any>('/api/user/dify/prompt-optimize', {
        originalPrompt: formData.content
      }, { timeout: 60000 })
      console.log('【DEBUG】Dify response from http.post:', response)
      
      let optimizedText = ''
      if (response && typeof response === 'string') {
        optimizedText = response
      } else if (response && typeof response === 'object') {
        if (response.text) {
          optimizedText = response.text
        } else if (response.result) {
          optimizedText = response.result
        } else if (response.data) {
          if (typeof response.data === 'string') {
            optimizedText = response.data
          } else if (response.data.text) {
            optimizedText = response.data.text
          } else if (response.data.data && response.data.data.text) {
            optimizedText = response.data.data.text
          }
        }
      }

      console.log('【DEBUG】Extracted optimizedText:', optimizedText)

      if (optimizedText) {
        // 尝试解析可能嵌套的 JSON 或带引号的字符串
        try {
          if (typeof optimizedText === 'string' && (optimizedText.trim().startsWith('{') || optimizedText.trim().startsWith('"'))) {
            const parsed = JSON.parse(optimizedText)
            if (typeof parsed === 'string') {
              optimizedText = parsed
            } else if (typeof parsed === 'object' && parsed !== null) {
              if (parsed.text) optimizedText = parsed.text
              else if (parsed.result) optimizedText = parsed.result
              else if (parsed.output) optimizedText = parsed.output
              else if (parsed.output_text) optimizedText = parsed.output_text
              else if (parsed.data) optimizedText = typeof parsed.data === 'string' ? parsed.data : JSON.stringify(parsed.data)
              else {
                const firstKey = Object.keys(parsed)[0]
                if (firstKey && typeof parsed[firstKey] === 'string') {
                  optimizedText = parsed[firstKey]
                }
              }
            }
          }
        } catch (e) {
          console.warn('【DEBUG】JSON parse failed, keeping original string:', e)
        }
        
        // 处理可能遗留的转义换行符
        if (typeof optimizedText === 'string') {
          optimizedText = optimizedText.replace(/\\n/g, '\n')
        }
        
        console.log('【DEBUG】Final optimizedText to set:', optimizedText)
        
        // 直接更新表单数据
        setFormData(prev => ({
          ...prev,
          content: optimizedText
        }))
        showToast('提示词优化成功', 'success')
      } else {
        console.error('【DEBUG】No valid text extracted. Response structure:', response)
        showToast('优化失败，未返回内容或解析失败', 'error')
      }
    } catch (error) {
      console.error('【DEBUG】Failed to optimize prompt', error)
      showToast('提示词优化请求失败', 'error')
    } finally {
      setIsOptimizing(false)
    }
  }

  const handleSave = async () => {
    await saveRole(true)
  }

  const handleApplyTemplate = (template: PromptTemplate) => {
    setFormData(prev => ({
      ...prev,
      content: template.content
    }))
    setIsTemplateModalOpen(false)
  }

  const openTemplateModal = () => {
    fetchTemplates()
    setIsTemplateModalOpen(true)
  }

  const openKnowledgeModal = async () => {
    let role = editingRole
    if (!role?.id) {
      role = await saveRole(false)
      if (!role) {
        return
      }
    }
    fetchKnowledgeBases()
    const roleKnowledgeIds = await fetchRoleKnowledgeBases(role.id)
    setSelectedKnowledgeBaseIds(roleKnowledgeIds)
    setIsKnowledgeModalOpen(true)
  }

  const closeKnowledgeModal = () => {
    setIsKnowledgeModalOpen(false)
  }

  const updateKnowledgeBasesToDb = async (ids: string[]) => {
    if (editingRole?.id) {
      try {
        await http.put(`/api/user/roles/${editingRole.id}/knowledge-bases`, {
          knowledgeBaseIds: ids
        })
      } catch (error) {
        console.error('Failed to update knowledge bases', error)
      }
    }
  }

  const toggleKnowledgeBaseSelection = (knowledgeBaseId: string) => {
    setSelectedKnowledgeBaseIds(prev => {
      const newIds = prev.includes(knowledgeBaseId)
        ? prev.filter(item => item !== knowledgeBaseId)
        : [...prev, knowledgeBaseId]
      updateKnowledgeBasesToDb(newIds)
      return newIds
    })
  }

  const ToggleSwitch = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => (
    <div className={`${styles.switchWrapper} ${checked ? styles.switchRunning : ''}`}>
      <div className={`${styles.switch} ${checked ? styles.switchActive : ''}`} onClick={onChange}>
        <div className={styles.switchKnob} />
      </div>
    </div>
  )

  if (view === 'form') {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <button onClick={() => setView('list')} className={styles.iconBtn}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </button>
            <div>
              <h4 className={styles.title}>角色配置</h4>
              <p className={styles.subtitle}>{editingRole ? '编辑角色信息与提示词模板' : '创建新的角色'}</p>
            </div>
          </div>
          <div className={styles.headerActions}>
            <button onClick={() => setView('list')} className={styles.ghostBtn}>返回列表</button>
            <button onClick={handleSave} className={styles.primaryBtn}>保存角色</button>
          </div>
        </header>

        <div className={styles.body}>
          <div className={styles.cardBody}>
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h5 className={styles.cardTitle}>角色名称</h5>
                  <p className={styles.cardSubtitle}>用于识别该角色，建议 2-15 个字符</p>
                </div>
              </div>
              <div className={styles.cardBody}>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="请输入角色名称（最多15个字符）"
                  maxLength={15}
                  className={styles.input}
                />
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h5 className={styles.cardTitle}>角色设定</h5>
                  <p className={styles.cardSubtitle}>描述角色目标、语气与输出格式</p>
                </div>
                <button onClick={openTemplateModal} className={styles.linkBtn}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                  角色设定模版
                </button>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.textareaWrapper}>
                  <textarea
                    value={formData.content}
                    onChange={e => setFormData({ ...formData, content: e.target.value })}
                    placeholder="请输入角色的详细设定..."
                    className={styles.textarea}
                  />
                </div>
                <div className={styles.inlineActions}>
                  <button 
                    className={styles.aiOptimizeBtn} 
                    onClick={handleOptimizePrompt}
                    disabled={isOptimizing}
                  >
                    <span className={styles.pillIcon}>{isOptimizing ? '⏳' : '⚡'}</span>
                    {isOptimizing ? '优化中...' : 'AI优化'}
                  </button>
                </div>
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h5 className={styles.cardTitle}>知识库</h5>
                  <p className={styles.cardSubtitle}>为角色提供知识增强与上下文信息</p>
                </div>
                <div className={styles.headerActions}>
                  <button className={styles.ghostBtn} onClick={openKnowledgeModal}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    添加
                  </button>
                  <button className={styles.dangerLink} onClick={() => {
                    setSelectedKnowledgeBaseIds([])
                    updateKnowledgeBasesToDb([])
                  }}>清空</button>
                </div>
              </div>
              <div className={styles.cardBody}>
                {selectedKnowledgeBaseIds.length > 0 ? (
                  <div className={styles.kbTags}>
                    {selectedKnowledgeBaseIds.map(id => {
                      const kb = knowledgeBases.find(k => k.id === id)
                      return (
                        <span key={id} className={styles.kbTag}>
                          已绑定 {kb?.name || '未知知识库'}
                          <button 
                            className={styles.kbTagRemove}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleKnowledgeBaseSelection(id);
                            }}
                            title="解除绑定"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                          </button>
                        </span>
                      )
                    })}
                  </div>
                ) : (
                  <div className={styles.kbStatus}>未绑定知识库</div>
                )}
              </div>
            </div>
          </div>
        </div>

        {isTemplateModalOpen && (
          <div className={styles.modalOverlay}>
            <div className={styles.modal}>
              <div className={styles.modalHeader}>
                <div>
                  <h3 className={styles.modalTitle}>角色设定模板</h3>
                  <p className={styles.modalSubtitle}>选择合适的模板快速生成角色设定</p>
                </div>
                <button onClick={() => setIsTemplateModalOpen(false)} className={styles.iconBtn}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
              </div>
              <div className={styles.modalBody}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>模版名称</th>
                      <th>模版内容</th>
                      <th className={styles.tableRight}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {templates.map(tpl => (
                      <tr key={tpl.id}>
                        <td className={styles.kbItemName}>{tpl.name}</td>
                        <td className={styles.ellipsis}>
                          <div className={styles.ellipsis}>{tpl.content}</div>
                        </td>
                        <td className={styles.tableRight}>
                          <button onClick={() => handleApplyTemplate(tpl)} className={styles.primaryBtn}>应用</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className={styles.modalFooter}>
                  <span>共 {templates.length} 个模版</span>
                  <div className={styles.modalActions}>
                    <button onClick={() => fetchTemplates()} className={styles.ghostBtn}>刷新</button>
                    <button onClick={() => setIsTemplateModalOpen(false)} className={styles.ghostBtn}>关闭</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {isKnowledgeModalOpen && (
          <div className={styles.modalOverlay}>
            <div className={styles.modal}>
              <div className={styles.modalHeader}>
                <div>
                  <h3 className={styles.modalTitle}>添加知识库</h3>
                  <p className={styles.modalSubtitle}>为当前角色选择一个或多个知识库</p>
                </div>
                <button onClick={closeKnowledgeModal} className={styles.iconBtn}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
              </div>
              <div className={styles.modalBody}>
                <div>
                  <div className={styles.kbStatus}>
                    已选择 {selectedKnowledgeBaseIds.length} 个知识库
                  </div>
                  <div className={styles.kbListCard}>
                    <div className={styles.kbListHeader}>
                      <span>知识库列表</span>
                      <div>
                        <button type="button" className={styles.iconBtn} onClick={fetchKnowledgeBases} title="刷新">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path></svg>
                        </button>
                      </div>
                    </div>
                    <div className={styles.kbList}>
                      {knowledgeBases.length === 0 ? (
                        <div className={styles.kbEmpty}>暂无知识库，请先到“知识库管理”创建</div>
                      ) : (
                        knowledgeBases.map(item => (
                          <label key={item.id} className={styles.kbItem}>
                            <input
                              type="checkbox"
                              checked={selectedKnowledgeBaseIds.includes(item.id)}
                              onChange={() => toggleKnowledgeBaseSelection(item.id)}
                            />
                            <div className={styles.kbItemMain}>
                              <div className={styles.kbItemName}>{item.name}</div>
                              <div className={styles.kbItemDesc}>{item.description || '暂无描述'}</div>
                            </div>
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                </div>
                <div className={styles.modalFooter}>
                  <span>修改会立即保存</span>
                  <div className={styles.modalActions}>
                    <button
                      type="button"
                      className={styles.primaryBtn}
                      onClick={closeKnowledgeModal}
                    >
                      完成
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <ConfirmDialog
          isOpen={!!roleToDelete}
          title="确定删除?"
          content="删除角色后将无法恢复，确定删除么?"
          onConfirm={confirmDelete}
          onCancel={() => setRoleToDelete(null)}
        />
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h4 className={styles.title}>角色配置</h4>
          <p className={styles.subtitle}>集中管理角色、模板与运行状态</p>
        </div>
        <div className={styles.headerActions}>
          <button
            onClick={() => {
              setFormData({
                name: '',
                content: '',
                status: 'PENDING',
                knowledgeBaseId: ''
              })
              setSelectedKnowledgeBaseIds([])
              fetchKnowledgeBases()
              setEditingRole(null)
              setView('form')
            }}
            className={styles.primaryBtn}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            添加角色
          </button>
        </div>
      </header>

      <div className={styles.body}>
        {toast && <Toast message={toast.message} type={toast.type} />}
        <div className={`${styles.card} ${styles.tableCard}`}>
          <div className={styles.tableCardHeader}>
            <div>
              <h2 className={styles.cardTitle}>角色列表</h2>
              <p className={styles.cardSubtitle}>当前共 {roles.length} 个角色</p>
            </div>
            <button onClick={() => fetchRoles()} className={styles.iconBtn} title="刷新">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path></svg>
            </button>
          </div>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.colName}>角色名称</th>
                  <th className={styles.colDesc}>角色设定</th>
                  <th className={styles.colUser}>用户</th>
                  <th className={styles.colStatus}>开启状态</th>
                  <th className={styles.colAction}>操作</th>
                </tr>
              </thead>
              <tbody>
                {roles.map(role => (
                  <tr key={role.id}>
                    <td className={styles.colName}>{role.name}</td>
                    <td className={styles.colDesc}>
                      <div className={styles.cellContent}>{role.content}</div>
                    </td>
                    <td className={styles.colUser}>默认用户</td>
                    <td className={styles.colStatus}>
                      <ToggleSwitch
                        checked={role.status === 'RUNNING'}
                        onChange={() => handleToggleStatus(role)}
                      />
                    </td>
                    <td className={styles.colAction}>
                      <div className={styles.actions}>
                        <button onClick={() => handleEdit(role)} className={styles.iconBtn} title="编辑">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                        </button>
                        <button onClick={() => handleDelete(role.id)} className={`${styles.iconBtn} ${styles.deleteBtn}`} title="删除">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {roles.length === 0 && !loading && (
              <div className={styles.emptyStateContainer}>
                <div className={styles.emptyState}>
                  <div className={styles.emptyIconWrapper}>
                    <svg className={styles.emptyIconSvg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                      <circle cx="9" cy="7" r="4"></circle>
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                      <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                    </svg>
                  </div>
                  <div className={styles.emptyTitle}>暂无角色</div>
                  <div className={styles.emptySubtitle}>点击下方按钮创建你的第一个角色</div>
                  <button
                    onClick={() => {
                      setFormData({
                        name: '',
                        content: '',
                        status: 'PENDING',
                        knowledgeBaseId: ''
                      })
                      setSelectedKnowledgeBaseIds([])
                      fetchKnowledgeBases()
                      setEditingRole(null)
                      setView('form')
                    }}
                    className={styles.primaryBtn}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    立即创建角色
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        <ConfirmDialog
          isOpen={!!roleToDelete}
          title="确定删除?"
          content="删除角色后将无法恢复，确定删除么?"
          onConfirm={confirmDelete}
          onCancel={() => setRoleToDelete(null)}
        />
      </div>
    </div>
  )
}
