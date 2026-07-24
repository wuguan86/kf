/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface UpdateStatus {
  stage: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'not-available' | 'error'
  message: string
  version?: string
  progress?: number
  mandatory?: boolean
  releaseNotes?: string
}

interface Window {
  api?: {
    minimizeWindow: () => void
    maximizeWindow: () => void
    closeWindow: () => void
    getAppVersion: () => Promise<string>
    getUpdateStatus: () => Promise<UpdateStatus>
    checkForUpdates: () => Promise<UpdateStatus>
    installUpdate: () => Promise<boolean>
    onUpdateStatus: (callback: (status: UpdateStatus) => void) => () => void
  }
}
