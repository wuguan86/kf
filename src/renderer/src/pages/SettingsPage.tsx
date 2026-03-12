import React, { useState, useEffect } from 'react'
import http from '../utils/http'
import styles from './SettingsPage.module.css'
import { ConfirmDialog } from '../components/ConfirmDialog'

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
      fetchRoles()
    } catch (error) {
      console.error('Failed to delete role', error)
      alert('删除失败')
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
      fetchRoles()
    } catch (error) {
      console.error('Failed to toggle status', error)
    }
  }

  const saveRole = async (returnToList: boolean) => {
    if (!formData.name) {
      alert('请输入角色名称')
      return null
    }
    if (formData.name.length > 15) {
      alert('角色名称不能超过 15 个字符')
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
      if (returnToList) {
        setView('list')
      }
      fetchRoles()
      return savedRole
    } catch (error) {
      console.error('Failed to save role', error)
      alert('保存失败')
      return null
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

  const toggleKnowledgeBaseSelection = (knowledgeBaseId: string) => {
    setSelectedKnowledgeBaseIds(prev => {
      if (prev.includes(knowledgeBaseId)) {
        return prev.filter(item => item !== knowledgeBaseId)
      }
      return [...prev, knowledgeBaseId]
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
                  <button className={styles.pillBtn}>
                    <span className={styles.pillIcon}>⚡</span>
                    AI优化
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
                  <button className={styles.dangerLink} onClick={() => setSelectedKnowledgeBaseIds([])}>清空</button>
                </div>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.kbStatus}>
                    {selectedKnowledgeBaseIds.length > 0
                      ? `已绑定知识库 ${selectedKnowledgeBaseIds.length} 个`
                      : '未绑定知识库'}
                </div>
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
                        <button type="button" className={styles.ghostBtn} onClick={fetchKnowledgeBases}>
                          刷新
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
                  <span>选择后点击保存生效</span>
                  <div className={styles.modalActions}>
                    <button type="button" className={styles.ghostBtn} onClick={closeKnowledgeModal}>
                      取消
                    </button>
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
        <div className={`${styles.card} ${styles.tableCard}`}>
          <div className={styles.tableCardHeader}>
            <div>
              <h5 className={styles.cardTitle}>角色列表</h5>
              <p className={styles.cardSubtitle}>当前共 {roles.length} 个角色</p>
            </div>
            <button onClick={() => fetchRoles()} className={styles.ghostBtn}>刷新</button>
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
                {roles.length === 0 && !loading && (
                  <tr>
                    <td colSpan={5}>
                      <div className={styles.emptyState}>
                        <div className={styles.emptyIcon}>✨</div>
                        <div className={styles.emptyTitle}>暂无角色</div>
                        <div className={styles.emptySubtitle}>点击右上角按钮创建你的第一个角色</div>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
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
