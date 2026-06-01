import React, { useEffect, useState } from 'react'
import http from '../utils/http'
import styles from './KnowledgeBasePage.module.css'
import { ConfirmDialog } from '../components/ConfirmDialog'
import KnowledgeBaseEditModal from '../components/knowledge/KnowledgeBaseEditModal'

type Props = {
  backendBaseUrl: string
  tenantId: string
  userToken: string
}

export interface KnowledgeBase {
  id: string
  name: string
  description: string
  difyDatasetId: string
  permission: string
  status: string
  isDefault: boolean
}

export interface KnowledgeBaseFile {
  id: string
  kbId: string
  name: string
  fileSize: string
  extension: string
  difyDocumentId: string
  indexingStatus: string
  errorMsg: string
  wordCount: number
}

export default function KnowledgeBasePage(props: Props): JSX.Element {
  const { backendBaseUrl, userToken } = props
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([])
  const [files, setFiles] = useState<KnowledgeBaseFile[]>([])
  const [loading, setLoading] = useState(false)
  const [editingKnowledgeBase, setEditingKnowledgeBase] = useState<KnowledgeBase | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'kb' | 'file', data: any } | null>(null)

  const fetchKnowledgeBases = async () => {
    setLoading(true)
    try {
      const data = await http.get<KnowledgeBase[]>('/api/user/knowledge-bases')
      setKnowledgeBases(data)
    } catch (error) {
      console.error('获取知识库列表失败', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchFiles = async (knowledgeBaseId: string) => {
    if (!knowledgeBaseId) {
      setFiles([])
      return
    }
    try {
      const data = await http.get<KnowledgeBaseFile[]>(`/api/user/knowledge-bases/${knowledgeBaseId}/files`)
      setFiles(data)
    } catch (error) {
      console.error('获取知识库文件失败', error)
    }
  }

  useEffect(() => {
    if (backendBaseUrl && userToken) {
      fetchKnowledgeBases()
    }
  }, [backendBaseUrl, userToken])

  const openCreateModal = () => {
    setEditingKnowledgeBase(null)
    setFiles([])
    setModalOpen(true)
  }

  const openEditModal = async (knowledgeBase: KnowledgeBase) => {
    setEditingKnowledgeBase(knowledgeBase)
    setModalOpen(true)
    await fetchFiles(knowledgeBase.id)
  }

  const closeModal = async (refresh = false) => {
    setModalOpen(false)
    setEditingKnowledgeBase(null)
    setFiles([])
    if (refresh) {
      await fetchKnowledgeBases()
    }
  }

  const deleteKnowledgeBase = (knowledgeBase: KnowledgeBase) => {
    setDeleteTarget({ type: 'kb', data: knowledgeBase })
  }

  const deleteFile = (file: KnowledgeBaseFile) => {
    setDeleteTarget({ type: 'file', data: file })
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    try {
      if (deleteTarget.type === 'kb') {
        const kb = deleteTarget.data as KnowledgeBase
        await http.delete(`/api/user/knowledge-bases/${kb.id}`)
        await fetchKnowledgeBases()
      } else {
        const file = deleteTarget.data as KnowledgeBaseFile
        const kbId = editingKnowledgeBase?.id
        if (!kbId) return
        await http.delete(`/api/user/knowledge-bases/${kbId}/files/${file.id}`)
        await fetchFiles(kbId)
      }
    } catch (error: any) {
      alert(error?.message || '删除失败')
    } finally {
      setDeleteTarget(null)
    }
  }

  const handleToggleStatus = async (kb: KnowledgeBase) => {
    const newStatus = kb.status === 'ENABLED' ? 'DISABLED' : 'ENABLED'
    try {
      await http.put(`/api/user/knowledge-bases/${kb.id}`, {
        ...kb,
        status: newStatus
      })
      fetchKnowledgeBases()
    } catch (error) {
      console.error('更新知识库状态失败', error)
      alert('更新状态失败')
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h4 className={styles.title}>知识库管理</h4>
          <p className={styles.subtitle}>管理知识库、数据集与 AI 清洗后的知识文件</p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.primaryBtn} onClick={openCreateModal}>
            <PlusIcon />
            添加知识库
          </button>
        </div>
      </header>

      <div className={styles.body}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <h5 className={styles.cardTitle}>知识库列表</h5>
              <p className={styles.cardSubtitle}>共 {knowledgeBases.length} 个知识库</p>
            </div>
            <button onClick={() => fetchKnowledgeBases()} className={styles.iconBtn} title="刷新">
              <RefreshIcon />
            </button>
          </div>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.colName}>名称</th>
                  <th className={styles.colDefault}>默认</th>
                  <th className={styles.colDesc}>描述</th>
                  <th className={styles.colStatus}>状态</th>
                  <th className={styles.colAction}>操作</th>
                </tr>
              </thead>
              <tbody>
                {knowledgeBases.map(item => (
                  <tr key={item.id}>
                    <td className={styles.colName}>
                      <span className={styles.kbLinkBtn}>{item.name}</span>
                    </td>
                    <td className={styles.colDefault}>
                      {item.isDefault ? (
                        <span className={`${styles.statusBadge} ${styles.statusEnabled}`}>是</span>
                      ) : (
                        <span className={`${styles.statusBadge} ${styles.statusDisabled}`}>否</span>
                      )}
                    </td>
                    <td className={styles.colDesc}>
                      <div className={styles.ellipsis}>{item.description || '-'}</div>
                    </td>
                    <td className={styles.colStatus}>
                      <ToggleSwitch
                        checked={item.status === 'ENABLED'}
                        onChange={() => handleToggleStatus(item)}
                      />
                    </td>
                    <td className={styles.colAction}>
                      <div className={styles.tableActions}>
                        <button onClick={() => openEditModal(item)} className={styles.iconBtn} title="编辑">
                          <EditIcon />
                        </button>
                        {!item.isDefault && (
                          <button onClick={() => deleteKnowledgeBase(item)} className={`${styles.iconBtn} ${styles.deleteBtn}`} title="删除">
                            <TrashIcon />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {knowledgeBases.length === 0 && !loading && (
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
                  <div className={styles.emptyTitle}>暂无知识库</div>
                  <div className={styles.emptySubtitle}>点击下方按钮添加你的第一个知识库</div>
                  <button className={styles.primaryBtn} onClick={openCreateModal}>
                    <PlusIcon />
                    立即创建知识库
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {modalOpen && (
        <KnowledgeBaseEditModal
          editingKnowledgeBase={editingKnowledgeBase}
          files={files}
          onClose={() => closeModal(false)}
          onSaved={() => closeModal(true)}
          onDeleteFile={deleteFile}
          onRefreshFiles={fetchFiles}
        />
      )}

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="确定删除？"
        content={deleteTarget
          ? (deleteTarget.type === 'kb'
              ? `确定要删除知识库“${deleteTarget.data.name}”吗？此操作无法撤销。`
              : `确定要删除文件“${deleteTarget.data.name}”吗？`)
          : ''
        }
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}

const ToggleSwitch = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => (
  <div className={styles.switchWrapper}>
    <div className={`${styles.switchComponent} ${checked ? styles.switchComponentActive : ''}`} onClick={onChange}>
      <div className={styles.switchKnob} />
    </div>
  </div>
)

const PlusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
)

const RefreshIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path></svg>
)

const EditIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
)

const TrashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
)
