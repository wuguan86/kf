import { useEffect, useState } from 'react'
import { smartSalesApi, TagView } from '../../api/smartSales'
import styles from './TagManagementModal.module.css'

interface Props {
  open: boolean
  onClose: () => void
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void
  onChanged?: (tags: TagView[]) => void
}

const defaultTagColor = '#5B8FF9'

export default function TagManagementModal({
  open,
  onClose,
  showToast,
  onChanged
}: Props): JSX.Element | null {
  const [tags, setTags] = useState<TagView[]>([])
  const [loading, setLoading] = useState(false)
  const [savingTagId, setSavingTagId] = useState('')
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState(defaultTagColor)
  const [editing, setEditing] = useState<Record<string, { name: string; color: string }>>({})

  useEffect(() => {
    if (!open) return
    void loadTags()
  }, [open])

  if (!open) {
    return null
  }

  const loadTags = async () => {
    setLoading(true)
    try {
      const data = await smartSalesApi.listTags()
      const nextTags = data || []
      setTags(nextTags)
      setEditing(buildEditingState(nextTags))
      onChanged?.(nextTags)
    } catch (error) {
      console.error('加载客户标签库失败', error)
      showToast('加载客户标签库失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateTag = async () => {
    const name = newTagName.trim()
    if (!name) {
      showToast('请填写标签名称', 'info')
      return
    }
    setSavingTagId('new')
    try {
      await smartSalesApi.createTag(name, newTagColor)
      setNewTagName('')
      setNewTagColor(defaultTagColor)
      showToast('标签已创建', 'success')
      await loadTags()
    } catch (error: any) {
      console.error('创建客户标签失败', error)
      showToast(error?.message || '创建客户标签失败', 'error')
    } finally {
      setSavingTagId('')
    }
  }

  const handleUpdateTag = async (tag: TagView) => {
    const draft = editing[tag.id]
    const name = draft?.name.trim()
    if (!name) {
      showToast('标签名称不能为空', 'info')
      return
    }
    setSavingTagId(tag.id)
    try {
      await smartSalesApi.updateTag(tag.id, name, draft.color)
      showToast('标签已更新', 'success')
      await loadTags()
    } catch (error: any) {
      console.error('更新客户标签失败', error)
      showToast(error?.message || '更新客户标签失败', 'error')
    } finally {
      setSavingTagId('')
    }
  }

  const handleDeleteTag = async (tag: TagView) => {
    const confirmed = window.confirm(`确定删除标签“${tag.name}”吗？删除后会从已打标客户上同步移除。`)
    if (!confirmed) return
    setSavingTagId(tag.id)
    try {
      await smartSalesApi.deleteTag(tag.id)
      showToast('标签已删除', 'success')
      await loadTags()
    } catch (error: any) {
      console.error('删除客户标签失败', error)
      showToast(error?.message || '删除客户标签失败', 'error')
    } finally {
      setSavingTagId('')
    }
  }

  const customTags = tags.filter((tag) => tag.category === 'CUSTOM')
  const presetTags = tags.filter((tag) => tag.category === 'PRESET')

  return (
    <div className={styles.overlay} role="presentation" onMouseDown={onClose}>
      <div className={styles.modal} role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>客户标签管理</h2>
            <p className={styles.subtitle}>维护智能销售全局标签库，自定义标签改动会同步影响客户列表和客户详情。</p>
          </div>
          <button className={styles.iconBtn} onClick={onClose} title="关闭">
            ×
          </button>
        </div>

        <div className={styles.createRow}>
          <input
            className={styles.input}
            placeholder="新建标签名称"
            value={newTagName}
            onChange={(event) => setNewTagName(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && handleCreateTag()}
          />
          <input
            type="color"
            className={styles.colorPicker}
            value={newTagColor}
            onChange={(event) => setNewTagColor(event.target.value)}
            title="标签颜色"
          />
          <button className={styles.primaryBtn} onClick={handleCreateTag} disabled={savingTagId === 'new'}>
            {savingTagId === 'new' ? '创建中...' : '新建标签'}
          </button>
        </div>

        <div className={styles.body}>
          {loading ? (
            <div className={styles.empty}>正在加载标签库...</div>
          ) : (
            <>
              <section className={styles.group}>
                <div className={styles.groupTitle}>自定义标签</div>
                {customTags.length === 0 ? (
                  <div className={styles.empty}>暂无自定义标签</div>
                ) : (
                  <div className={styles.tagRows}>
                    {customTags.map((tag) => {
                      const draft = editing[tag.id] || { name: tag.name, color: tag.color || defaultTagColor }
                      const changed = draft.name.trim() !== tag.name || draft.color !== tag.color
                      return (
                        <div className={styles.tagRow} key={tag.id}>
                          <span className={styles.colorDot} style={{ backgroundColor: draft.color }} />
                          <input
                            className={styles.input}
                            value={draft.name}
                            onChange={(event) =>
                              setEditing((prev) => ({
                                ...prev,
                                [tag.id]: { ...draft, name: event.target.value }
                              }))
                            }
                          />
                          <input
                            type="color"
                            className={styles.colorPicker}
                            value={draft.color}
                            onChange={(event) =>
                              setEditing((prev) => ({
                                ...prev,
                                [tag.id]: { ...draft, color: event.target.value }
                              }))
                            }
                            title="标签颜色"
                          />
                          <button
                            className={styles.ghostBtn}
                            onClick={() => handleUpdateTag(tag)}
                            disabled={!changed || savingTagId === tag.id}
                          >
                            保存
                          </button>
                          <button
                            className={styles.dangerBtn}
                            onClick={() => handleDeleteTag(tag)}
                            disabled={savingTagId === tag.id}
                          >
                            删除
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>

              <section className={styles.group}>
                <div className={styles.groupTitle}>系统预设标签</div>
                <div className={styles.presetList}>
                  {presetTags.map((tag) => (
                    <span className={styles.tagChip} style={{ backgroundColor: tag.color }} key={tag.id}>
                      {tag.name}
                    </span>
                  ))}
                  {presetTags.length === 0 && <div className={styles.empty}>暂无系统预设标签</div>}
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function buildEditingState(tags: TagView[]): Record<string, { name: string; color: string }> {
  return tags.reduce<Record<string, { name: string; color: string }>>((result, tag) => {
    if (tag.category === 'CUSTOM') {
      result[tag.id] = { name: tag.name, color: tag.color || defaultTagColor }
    }
    return result
  }, {})
}
