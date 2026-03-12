import React, { useEffect, useState } from 'react'
import http from '../utils/http'
import styles from './KnowledgeBasePage.module.css'
import { ConfirmDialog } from '../components/ConfirmDialog'

type Props = {
  backendBaseUrl: string
  tenantId: string
  userToken: string
}

interface KnowledgeBase {
  id: string
  name: string
  description: string
  difyDatasetId: string
  permission: string
  status: string
  isDefault: boolean
}

interface KnowledgeBaseFile {
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
  const [uploading, setUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState('')
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [dragActive, setDragActive] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    permission: 'only_me',
    status: 'ENABLED'
  })
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'kb' | 'file', data: any } | null>(null)

  const fetchKnowledgeBases = async () => {
    setLoading(true)
    try {
      const data = await http.get<KnowledgeBase[]>('/api/user/knowledge-bases')
      setKnowledgeBases(data)
    } catch (error) {
      console.error('Failed to fetch knowledge bases', error)
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
      console.error('Failed to fetch knowledge base files', error)
    }
  }

  useEffect(() => {
    if (backendBaseUrl && userToken) {
      fetchKnowledgeBases()
    }
  }, [backendBaseUrl, userToken])

  const openCreateModal = () => {
    setEditingKnowledgeBase(null)
    setFormData({
      name: '',
      description: '',
      permission: 'only_me',
      status: 'ENABLED'
    })
    setFiles([])
    setSelectedFiles([])
    setUploadStatus('')
    setModalOpen(true)
  }

  const openEditModal = async (knowledgeBase: KnowledgeBase) => {
    setEditingKnowledgeBase(knowledgeBase)
    setFormData({
      name: knowledgeBase.name,
      description: knowledgeBase.description || '',
      permission: knowledgeBase.permission || 'only_me',
      status: knowledgeBase.status || 'ENABLED'
    })
    setSelectedFiles([])
    setUploadStatus('')
    setModalOpen(true)
    // Fetch existing files for this KB
    await fetchFiles(knowledgeBase.id)
  }

  const performUploadFiles = async (kbId: string, filesToUpload: File[]) => {
    if (!filesToUpload.length) return

    setUploading(true)
    try {
      for (let i = 0; i < filesToUpload.length; i += 1) {
        const file = filesToUpload[i]
        setUploadStatus(`正在上传 ${i + 1}/${filesToUpload.length}：${file.name}`)
        const payload = new FormData()
        payload.append('data', JSON.stringify({
          indexing_technique: 'high_quality',
          process_rule: { mode: 'automatic' }
        }))
        payload.append('file', file)
        await http.postForm(`/api/user/knowledge-bases/${kbId}/files`, payload)
      }
    } catch (error: any) {
      console.error('Upload failed', error)
      throw error
    } finally {
      setUploading(false)
      setUploadStatus('')
    }
  }

  const saveKnowledgeBase = async () => {
    if (!formData.name.trim()) {
      alert('请输入知识库名称')
      return
    }
    try {
      let kbId = editingKnowledgeBase?.id
      if (editingKnowledgeBase) {
        await http.put(`/api/user/knowledge-bases/${editingKnowledgeBase.id}`, formData)
      } else {
        const res = await http.post<KnowledgeBase>('/api/user/knowledge-bases', formData)
        kbId = res.id
      }

      if (kbId && selectedFiles.length > 0) {
        await performUploadFiles(kbId, selectedFiles)
      }

      setModalOpen(false)
      await fetchKnowledgeBases()
      if (kbId) {
        // No selection needed
      }
    } catch (error: any) {
      alert(error?.message || '保存失败')
    }
  }

  const deleteKnowledgeBase = (knowledgeBase: KnowledgeBase) => {
    setDeleteTarget({ type: 'kb', data: knowledgeBase })
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

  const addFiles = (list: FileList | null) => {
    if (!list) return
    const incoming = Array.from(list)
    
    // Filter files larger than 10MB
    const validFiles = incoming.filter(file => {
      const isTooLarge = file.size > 10 * 1024 * 1024
      if (isTooLarge) {
        alert(`文件 "${file.name}" 超过 10MB 限制`)
      }
      return !isTooLarge
    })

    if (validFiles.length > 0) {
      setSelectedFiles(prev => {
        const map = new Map(prev.map(file => [`${file.name}-${file.size}-${file.lastModified}`, file]))
        validFiles.forEach(file => {
          const key = `${file.name}-${file.size}-${file.lastModified}`
          if (!map.has(key)) {
            map.set(key, file)
          }
        })
        return Array.from(map.values())
      })
    }

    // Reset input value to allow selecting the same file again
    const inputIds = ['kb-modal-upload-input', 'kb-upload-input']
    inputIds.forEach(id => {
      const el = document.getElementById(id) as HTMLInputElement
      if (el) el.value = ''
    })
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files)
    }
  }

  const deleteFile = (file: KnowledgeBaseFile) => {
    setDeleteTarget({ type: 'file', data: file })
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
      console.error('Failed to update status', error)
      alert('更新状态失败')
    }
  }

  const ToggleSwitch = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => (
    <div className={styles.switchWrapper}>
      <div className={`${styles.switchComponent} ${checked ? styles.switchComponentActive : ''}`} onClick={onChange}>
        <div className={styles.switchKnob} />
      </div>
    </div>
  )

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h4 className={styles.title}>知识库管理</h4>
          <p className={styles.subtitle}>管理知识库、Dify 数据集与知识文件</p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.primaryBtn} onClick={openCreateModal}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
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
            <button className={styles.ghostBtn} onClick={fetchKnowledgeBases}>刷新</button>
          </div>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.colName}>名称</th>
                  <th className={styles.colDefault}>是否默认</th>
                  <th className={styles.colDesc}>描述</th>
                  <th className={styles.colStatus}>状态</th>
                  <th className={styles.colAction}>操作</th>
                </tr>
              </thead>
              <tbody>
                {knowledgeBases.map(item => (
                  <tr key={item.id}>
                    <td className={styles.colName}>
                      <span className={styles.kbLinkBtn}>
                        {item.name}
                      </span>
                    </td>
                    <td className={styles.colDefault}>
                      {item.isDefault ? (
                        <span className={`${styles.statusBadge} ${styles.statusEnabled}`} style={{ color: '#3b82f6', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                          是
                        </span>
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
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                        </button>
                        {!item.isDefault && (
                          <button onClick={() => deleteKnowledgeBase(item)} className={`${styles.iconBtn} ${styles.deleteBtn}`} title="删除">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {knowledgeBases.length === 0 && !loading && (
                  <tr>
                    <td colSpan={5}>
                      <div className={styles.empty}>
                        <div className={styles.emptyTitle}>暂无知识库</div>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {modalOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>{editingKnowledgeBase ? '编辑知识库' : '添加知识库'}</h3>
              <button onClick={() => setModalOpen(false)} className={styles.closeBtn}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.formGroup}>
                <label className={styles.label}>
                  名称 <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  className={styles.input}
                  placeholder="请输入知识库名称"
                  value={formData.name}
                  maxLength={128}
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>描述</label>
                <textarea
                  className={styles.textarea}
                  placeholder="请输入知识库描述（可选）"
                  rows={3}
                  value={formData.description}
                  onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>
              
              <div className="form-divider" style={{ height: '1px', background: 'var(--border-subtle)', margin: '20px 0' }} />
              
              <div className={styles.formGroup}>
                <label className={styles.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>知识文件</span>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 'normal' }}>
                    支持 PDF、Word、TXT、MD (单个 &lt; 10MB)
                  </span>
                </label>
                
                <div className={styles.uploadContainer}>
                  {/* Dropzone Area */}
                  <input
                    type="file"
                    multiple
                    className={styles.fileInput}
                    id="kb-modal-upload-input"
                    onChange={e => addFiles(e.target.files)}
                  />
                  <label
                    htmlFor="kb-modal-upload-input"
                    className={`${styles.dropzone} ${dragActive ? styles.dragging : ''}`}
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                  >
                    <div className={styles.dropzoneIcon}>
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="17 8 12 3 7 8"></polyline>
                        <line x1="12" y1="3" x2="12" y2="15"></line>
                      </svg>
                    </div>
                    <div className={styles.dropzoneText}>
                      点击或拖拽文件到此处
                    </div>
                  </label>

                  {/* Combined File List (Existing + New) */}
                  {(files.length > 0 || selectedFiles.length > 0) && (
                    <div className={styles.filesWrapper}>
                      {/* Existing Files */}
                      {files.map(file => (
                        <div key={file.id} className={styles.fileItem}>
                           <div className={styles.fileIcon}>
                             <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                           </div>
                           <div className={styles.fileInfo}>
                             <div className={styles.fileName}>{file.name}</div>
                             <div className={styles.fileMeta}>
                               已上传 · {(Number(file.fileSize || 0) / 1024 / 1024).toFixed(2)} MB
                             </div>
                           </div>
                           <button
                             className={`${styles.iconBtn} ${styles.deleteBtn}`}
                             onClick={() => deleteFile(file)}
                             title="删除文件"
                           >
                             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                           </button>
                        </div>
                      ))}
                      
                      {/* New Selected Files */}
                      {selectedFiles.map(file => (
                        <div key={`${file.name}-${file.lastModified}`} className={`${styles.fileItem} ${styles.fileItemNew}`}>
                          <div className={`${styles.fileIcon} ${styles.fileIconNew}`}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>
                          </div>
                          <div className={styles.fileInfo}>
                            <div className={styles.fileName}>{file.name}</div>
                            <div className={styles.fileMeta}>
                              待上传 · {(file.size / 1024 / 1024).toFixed(2)} MB
                            </div>
                          </div>
                          <button 
                            className={`${styles.iconBtn} ${styles.deleteBtn}`}
                            onClick={() => setSelectedFiles(prev => prev.filter(f => f !== file))}
                            title="移除"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {uploadStatus && (
                    <div className={styles.uploadStatus}>
                      <div className={styles.spinner} />
                      {uploadStatus}
                    </div>
                  )}
                </div>
              </div>
              
            </div>
            <div className={styles.modalFooter}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {editingKnowledgeBase ? '修改现有知识库' : '创建一个新的知识库'}
              </div>
              <div className={styles.modalActions}>
                <button className={styles.ghostBtn} onClick={() => setModalOpen(false)}>取消</button>
                <button 
                  className={styles.primaryBtn}
                  onClick={saveKnowledgeBase}
                  disabled={uploading}
                  style={{ opacity: uploading ? 0.7 : 1 }}
                >
                  {uploading ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="确定删除?"
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
