import React, { useState } from 'react'
import styles from '../../pages/KnowledgeBasePage.module.css'

type Props = {
  disabled: boolean
  selectedFiles: File[]
  onSelect: (files: File[]) => void
  onRemove: (index: number) => void
  onClear: () => void
}

const MAX_FILE_SIZE = 10 * 1024 * 1024
const MAX_FILE_COUNT = 10
const ALLOWED_EXTENSIONS = ['pdf', 'doc', 'docx', 'txt', 'md', 'xls', 'xlsx']

export default function KnowledgeFileDropzone({ disabled, selectedFiles, onSelect, onRemove, onClear }: Props): JSX.Element {
  const [dragActive, setDragActive] = useState(false)

  const resetInput = () => {
    const el = document.getElementById('kb-cleaning-upload-input') as HTMLInputElement
    if (el) el.value = ''
  }

  const addFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return
    const incomingFiles = Array.from(list)
    if (selectedFiles.length + incomingFiles.length > MAX_FILE_COUNT) {
      alert(`一次最多选择 ${MAX_FILE_COUNT} 个知识文件`)
      resetInput()
      return
    }

    const acceptedFiles: File[] = []
    const rejectedMessages: string[] = []
    for (const file of incomingFiles) {
      const extension = file.name.split('.').pop()?.toLowerCase() || ''
      if (!ALLOWED_EXTENSIONS.includes(extension)) {
        rejectedMessages.push(`文件 "${file.name}" 格式不支持`)
        continue
      }
      if (file.size > MAX_FILE_SIZE) {
        rejectedMessages.push(`文件 "${file.name}" 超过 10MB 限制`)
        continue
      }
      acceptedFiles.push(file)
    }

    if (rejectedMessages.length > 0) {
      alert(rejectedMessages.join('\n'))
    }
    if (acceptedFiles.length > 0) {
      onSelect(acceptedFiles)
    }
    resetInput()
  }

  const handleDrag = (event: React.DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    if (disabled) return
    if (event.type === 'dragenter' || event.type === 'dragover') {
      setDragActive(true)
    } else if (event.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setDragActive(false)
    if (!disabled) {
      addFiles(event.dataTransfer.files)
    }
  }

  return (
    <div className={styles.uploadContainer}>
      <input
        type="file"
        className={styles.fileInput}
        id="kb-cleaning-upload-input"
        disabled={disabled}
        multiple
        onChange={(event) => addFiles(event.target.files)}
      />
      <label
        htmlFor="kb-cleaning-upload-input"
        className={`${styles.dropzone} ${dragActive ? styles.dragging : ''} ${disabled ? styles.dropzoneDisabled : ''}`}
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
          {disabled ? '文件处理中，请稍候' : '点击或拖拽文件到此处'}
        </div>
        <div className={styles.dropzoneMeta}>支持 PDF、Word、TXT、MD、Excel（单个 &lt; 10MB，一次最多 10 个）</div>
      </label>

      {selectedFiles.length > 0 && (
        <div className={styles.filesWrapper}>
          {selectedFiles.map((file, index) => (
            <div key={`${file.name}-${file.size}-${index}`} className={`${styles.fileItem} ${styles.fileItemNew}`}>
              <div className={`${styles.fileIcon} ${styles.fileIconNew}`}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
              </div>
              <div className={styles.fileInfo}>
                <div className={styles.fileName} title={file.name}>{file.name}</div>
                <div className={styles.fileMeta}>待上传 · {(file.size / 1024 / 1024).toFixed(2)} MB</div>
              </div>
              <button className={`${styles.iconBtn} ${styles.deleteBtn}`} onClick={() => onRemove(index)} title="移除" disabled={disabled}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
          ))}
          {selectedFiles.length > 1 && (
            <button type="button" className={styles.clearFilesBtn} onClick={onClear} disabled={disabled}>
              清空已选文件
            </button>
          )}
        </div>
      )}
    </div>
  )
}
