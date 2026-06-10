import React, { useEffect, useState } from 'react'
import http from '../utils/http'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { TagInput } from '../components/TagInput'
import { buildMaterialDownloadPath, isImageMaterial, parseMaterialTags, serializeMaterialTags } from './outboundMaterialUtils'
import styles from './OutboundMaterialPage.module.css'

type Props = {
  backendBaseUrl: string
  tenantId: string
  userToken: string
}

type MaterialScope = 'PRIVATE' | 'COMPANY'
type MaterialStatus = 'ENABLED' | 'DISABLED'
type MaterialChannel = 'personal' | 'enterprise'

type OutboundMaterial = {
  id: string
  scope: MaterialScope
  name: string
  description: string
  tags: string
  fileType: string
  mimeType: string
  fileSize: string
  extension: string
  allowedChannels: string
  autoSendEnabled: boolean
  status: MaterialStatus
  createdAt?: string
}

type MaterialForm = {
  scope: MaterialScope
  name: string
  description: string
  tags: string
  channels: MaterialChannel[]
  autoSendEnabled: boolean
  status: MaterialStatus
  file: File | null
}

const emptyForm: MaterialForm = {
  scope: 'PRIVATE',
  name: '',
  description: '',
  tags: '',
  channels: ['personal', 'enterprise'],
  autoSendEnabled: false,
  status: 'ENABLED',
  file: null
}

export default function OutboundMaterialPage(props: Props): JSX.Element {
  const { backendBaseUrl, userToken } = props
  const [materials, setMaterials] = useState<OutboundMaterial[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingMaterial, setEditingMaterial] = useState<OutboundMaterial | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<OutboundMaterial | null>(null)
  const [form, setForm] = useState<MaterialForm>(emptyForm)
  const [materialPreviewUrls, setMaterialPreviewUrls] = useState<Record<string, string>>({})
  const [selectedFilePreviewUrl, setSelectedFilePreviewUrl] = useState('')

  const editingPreviewUrl = editingMaterial ? materialPreviewUrls[String(editingMaterial.id)] || '' : ''
  const formPreviewUrl = selectedFilePreviewUrl || editingPreviewUrl
  const formPreviewName = form.file?.name || editingMaterial?.name || ''

  const fetchMaterials = async () => {
    setLoading(true)
    try {
      const data = await http.get<OutboundMaterial[]>('/api/user/outbound-materials')
      setMaterials(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('获取外发素材列表失败', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (backendBaseUrl && userToken) {
      fetchMaterials()
    }
  }, [backendBaseUrl, userToken])

  useEffect(() => {
    if (!form.file || !isImageMaterial({ mimeType: form.file.type, extension: resolveFilenameExtension(form.file.name) })) {
      setSelectedFilePreviewUrl('')
      return
    }
    const previewUrl = URL.createObjectURL(form.file)
    setSelectedFilePreviewUrl(previewUrl)
    return () => URL.revokeObjectURL(previewUrl)
  }, [form.file])

  useEffect(() => {
    let cancelled = false
    const loadPreviewUrls = async () => {
      const imageMaterials = materials.filter((material) => material.id && isImageMaterial(material))
      const entries = await Promise.all(imageMaterials.map(async (material) => {
        const materialId = String(material.id)
        try {
          const response = await http.get<Blob, Blob | { data: Blob }>(buildMaterialDownloadPath(materialId), { responseType: 'blob' })
          const blob = response instanceof Blob ? response : response?.data
          if (!(blob instanceof Blob)) return null
          return [materialId, URL.createObjectURL(blob)] as const
        } catch (error) {
          console.error('加载外发素材图片预览失败', { materialId, error })
          return null
        }
      }))
      const nextPreviewUrls = Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => !!entry))
      if (cancelled) {
        Object.values(nextPreviewUrls).forEach((previewUrl) => URL.revokeObjectURL(previewUrl))
        return
      }
      setMaterialPreviewUrls(nextPreviewUrls)
    }
    loadPreviewUrls()
    return () => {
      cancelled = true
    }
  }, [materials])

  useEffect(() => {
    return () => {
      Object.values(materialPreviewUrls).forEach((previewUrl) => URL.revokeObjectURL(previewUrl))
    }
  }, [materialPreviewUrls])

  const openCreateModal = () => {
    setEditingMaterial(null)
    setForm(emptyForm)
    setModalOpen(true)
  }

  const openEditModal = (material: OutboundMaterial) => {
    setEditingMaterial(material)
    setForm({
      scope: material.scope === 'COMPANY' ? 'COMPANY' : 'PRIVATE',
      name: material.name || '',
      description: material.description || '',
      tags: material.tags || '',
      channels: parseChannels(material.allowedChannels),
      autoSendEnabled: !!material.autoSendEnabled,
      status: material.status === 'DISABLED' ? 'DISABLED' : 'ENABLED',
      file: null
    })
    setModalOpen(true)
  }

  const closeModal = () => {
    if (submitting) return
    setModalOpen(false)
    setEditingMaterial(null)
    setForm(emptyForm)
  }

  const updateForm = (patch: Partial<MaterialForm>) => {
    setForm((prev) => ({ ...prev, ...patch }))
  }

  const toggleChannel = (channel: MaterialChannel) => {
    setForm((prev) => {
      const exists = prev.channels.includes(channel)
      const nextChannels = exists ? prev.channels.filter((item) => item !== channel) : [...prev.channels, channel]
      return { ...prev, channels: nextChannels.length > 0 ? nextChannels : [channel] }
    })
  }

  const submitMaterial = async () => {
    const materialName = form.name.trim() || form.file?.name || ''
    if (!materialName) {
      alert('请输入素材名称')
      return
    }
    if (!editingMaterial && !form.file) {
      alert('请选择要上传的素材文件')
      return
    }
    setSubmitting(true)
    try {
      if (editingMaterial) {
        await http.put(`/api/user/outbound-materials/${editingMaterial.id}`, {
          scope: form.scope,
          name: materialName,
          description: form.description.trim(),
          tags: form.tags.trim(),
          allowedChannels: form.channels.join(','),
          autoSendEnabled: form.autoSendEnabled,
          status: form.status
        })
      } else {
        const payload = new FormData()
        payload.append('scope', form.scope)
        payload.append('name', materialName)
        payload.append('description', form.description.trim())
        payload.append('tags', form.tags.trim())
        payload.append('allowedChannels', form.channels.join(','))
        payload.append('autoSendEnabled', String(form.autoSendEnabled))
        payload.append('file', form.file as File)
        await http.postForm('/api/user/outbound-materials', payload)
      }
      closeModal()
      await fetchMaterials()
    } catch (error: any) {
      console.error('保存外发素材失败', error)
      alert(error?.message || '保存外发素材失败')
    } finally {
      setSubmitting(false)
    }
  }

  const toggleStatus = async (material: OutboundMaterial) => {
    const nextStatus: MaterialStatus = material.status === 'ENABLED' ? 'DISABLED' : 'ENABLED'
    try {
      await http.put(`/api/user/outbound-materials/${material.id}`, { status: nextStatus })
      await fetchMaterials()
    } catch (error: any) {
      alert(error?.message || '更新素材状态失败')
    }
  }

  const toggleAutoSend = async (material: OutboundMaterial) => {
    try {
      await http.put(`/api/user/outbound-materials/${material.id}`, { autoSendEnabled: !material.autoSendEnabled })
      await fetchMaterials()
    } catch (error: any) {
      alert(error?.message || '更新自动发送开关失败')
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    try {
      await http.delete(`/api/user/outbound-materials/${deleteTarget.id}`)
      setDeleteTarget(null)
      await fetchMaterials()
    } catch (error: any) {
      alert(error?.message || '删除外发素材失败')
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h4 className={styles.title}>外发资料</h4>
          <p className={styles.subtitle}>管理可由个人微信或企业微信发送给客户的图片和文件素材</p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.primaryBtn} onClick={openCreateModal}>
            <PlusIcon />
            上传素材
          </button>
        </div>
      </header>

      <div className={styles.body}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <h5 className={styles.cardTitle}>素材列表</h5>
              <p className={styles.cardSubtitle}>共 {materials.length} 份素材</p>
            </div>
            <button onClick={fetchMaterials} className={styles.iconBtn} title="刷新" disabled={loading}>
              <RefreshIcon />
            </button>
          </div>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.colName}>素材</th>
                  <th className={styles.colScope}>范围</th>
                  <th className={styles.colChannel}>渠道</th>
                  <th className={styles.colAuto}>自动发送</th>
                  <th className={styles.colStatus}>状态</th>
                  <th className={styles.colAction}>操作</th>
                </tr>
              </thead>
              <tbody>
                {materials.map((material) => (
                  <tr key={material.id}>
                    <td className={styles.colName} title={buildMaterialTooltip(material)}>
                      <div className={styles.materialCell}>
                        {isImageMaterial(material) && (
                          materialPreviewUrls[String(material.id)] ? (
                            <img className={styles.materialThumb} src={materialPreviewUrls[String(material.id)]} alt={material.name || '素材图片'} />
                          ) : (
                            <div className={styles.materialThumbPlaceholder}>图</div>
                          )
                        )}
                        <div className={styles.materialText}>
                          <div className={styles.materialName}>{material.name || '-'}</div>
                          <div className={styles.materialMeta}>{formatFileType(material)}</div>
                        </div>
                      </div>
                    </td>
                    <td className={styles.colScope}>
                      <span className={styles.badge}>{material.scope === 'COMPANY' ? '公司共享' : '私人'}</span>
                    </td>
                    <td className={styles.colChannel}>{formatChannels(material.allowedChannels)}</td>
                    <td className={styles.colAuto}>
                      <ToggleSwitch checked={!!material.autoSendEnabled} onChange={() => toggleAutoSend(material)} />
                    </td>
                    <td className={styles.colStatus}>
                      <ToggleSwitch checked={material.status === 'ENABLED'} onChange={() => toggleStatus(material)} />
                    </td>
                    <td className={styles.colAction}>
                      <div className={styles.tableActions}>
                        <button className={styles.iconBtn} onClick={() => openEditModal(material)} title="编辑">
                          <EditIcon />
                        </button>
                        <button className={`${styles.iconBtn} ${styles.deleteBtn}`} onClick={() => setDeleteTarget(material)} title="删除">
                          <TrashIcon />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {materials.length === 0 && !loading && (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>+</div>
                <div className={styles.emptyTitle}>暂无外发资料</div>
                <div className={styles.emptySubtitle}>上传客户常问资料后，AI 可推荐素材并由你确认发送</div>
                <button className={styles.primaryBtn} onClick={openCreateModal}>
                  <PlusIcon />
                  上传第一份素材
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {modalOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h5 className={styles.modalTitle}>{editingMaterial ? '编辑素材' : '上传素材'}</h5>
              <button className={styles.closeBtn} onClick={closeModal}>×</button>
            </div>
            <div className={styles.modalBody}>
              <label className={styles.label}>素材名称</label>
              <input className={styles.input} value={form.name} onChange={(event) => updateForm({ name: event.target.value })} />

              <label className={styles.label}>可见范围</label>
              <div className={styles.segmented}>
                <button className={form.scope === 'PRIVATE' ? styles.segmentedActive : ''} onClick={() => updateForm({ scope: 'PRIVATE' })}>私人</button>
                <button className={form.scope === 'COMPANY' ? styles.segmentedActive : ''} onClick={() => updateForm({ scope: 'COMPANY' })}>公司共享</button>
              </div>

              <label className={styles.label}>说明</label>
              <textarea className={styles.textarea} value={form.description} onChange={(event) => updateForm({ description: event.target.value })} />

              <label className={styles.label}>标签</label>
              <TagInput
                value={parseMaterialTags(form.tags)}
                onChange={(tags) => updateForm({ tags: serializeMaterialTags(tags) })}
                placeholder="输入标签，按回车生成标签"
              />

              {formPreviewUrl && (
                <>
                  <label className={styles.label}>图片预览</label>
                  <div className={styles.previewPanel}>
                    <img className={styles.previewImage} src={formPreviewUrl} alt={formPreviewName || '素材图片'} />
                    <div className={styles.previewInfo}>
                      <div className={styles.previewName}>{formPreviewName || '素材图片'}</div>
                      <div className={styles.previewMeta}>{selectedFilePreviewUrl ? '待上传图片' : '已上传图片'}</div>
                    </div>
                  </div>
                </>
              )}

              <label className={styles.label}>允许渠道</label>
              <div className={styles.checkboxRow}>
                <label><input type="checkbox" checked={form.channels.includes('personal')} onChange={() => toggleChannel('personal')} /> 个人微信</label>
                <label><input type="checkbox" checked={form.channels.includes('enterprise')} onChange={() => toggleChannel('enterprise')} /> 企业微信</label>
              </div>

              <div className={styles.switchRows}>
                <label><input type="checkbox" checked={form.autoSendEnabled} onChange={(event) => updateForm({ autoSendEnabled: event.target.checked })} /> 允许全托管自动发送</label>
                <label><input type="checkbox" checked={form.status === 'ENABLED'} onChange={(event) => updateForm({ status: event.target.checked ? 'ENABLED' : 'DISABLED' })} /> 启用素材</label>
              </div>

              {!editingMaterial && (
                <>
                  <label className={styles.label}>素材文件</label>
                  <input className={styles.fileInput} type="file" onChange={(event) => updateForm({ file: event.target.files?.[0] || null })} />
                </>
              )}
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.secondaryBtn} onClick={closeModal} disabled={submitting}>取消</button>
              <button className={styles.primaryBtn} onClick={submitMaterial} disabled={submitting}>{submitting ? '保存中...' : '保存'}</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="确认删除"
        content={deleteTarget ? `确定删除素材“${deleteTarget.name}”吗？` : ''}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}

const parseChannels = (value: string): MaterialChannel[] => {
  const normalized = String(value || '').toLowerCase()
  const channels: MaterialChannel[] = []
  if (normalized.includes('personal')) channels.push('personal')
  if (normalized.includes('enterprise')) channels.push('enterprise')
  return channels.length > 0 ? channels : ['personal', 'enterprise']
}

const formatChannels = (value: string) => {
  const channels = parseChannels(value)
  if (channels.length === 2) return '个人微信、企业微信'
  return channels[0] === 'enterprise' ? '企业微信' : '个人微信'
}

const formatFileType = (material: OutboundMaterial) => {
  const type = String(material.fileType || '').toUpperCase() === 'IMAGE' ? '图片' : '文件'
  return material.extension ? `${type} / ${material.extension}` : type
}

const formatFileSize = (value: string) => {
  const size = Number(value || 0)
  if (!Number.isFinite(size) || size <= 0) return '-'
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${size} B`
}

const resolveFilenameExtension = (fileName: string) => {
  const index = fileName.lastIndexOf('.')
  return index >= 0 ? fileName.slice(index + 1) : ''
}

const buildMaterialTooltip = (material: OutboundMaterial) => {
  const lines = [
    `名称：${material.name || '-'}`,
    `类型：${formatFileType(material)}`,
    `大小：${formatFileSize(material.fileSize)}`,
    `范围：${material.scope === 'COMPANY' ? '公司共享' : '私人'}`,
    `渠道：${formatChannels(material.allowedChannels)}`,
    `自动发送：${material.autoSendEnabled ? '允许' : '不允许'}`,
    `状态：${material.status === 'ENABLED' ? '启用' : '停用'}`
  ]
  if (material.description) lines.push(`说明：${material.description}`)
  if (material.tags) lines.push(`标签：${material.tags}`)
  return lines.join('\n')
}

const ToggleSwitch = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => (
  <button className={styles.switchWrapper} onClick={onChange} type="button">
    <span className={`${styles.switchComponent} ${checked ? styles.switchComponentActive : ''}`}>
      <span className={styles.switchKnob} />
    </span>
  </button>
)

const PlusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
)

const RefreshIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /></svg>
)

const EditIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></svg>
)

const TrashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
)
