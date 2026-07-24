import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

type CaptureCoords = { x: number; y: number; w: number; h: number }
type CaptureResult = { dataUrl: string; bounds: CaptureCoords }
type CaptureCallback = (result: CaptureResult) => void
type UpdateStatus = {
  stage: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'not-available' | 'error'
  message: string
  version?: string
  progress?: number
  mandatory?: boolean
  releaseNotes?: string
}

const api = {
  startCapture: () => ipcRenderer.send('start-capture'),
  closeCapture: () => ipcRenderer.send('close-capture'),
  doCapture: (coords: CaptureCoords) => ipcRenderer.invoke('do-capture', coords),
  simulateReply: (data: { text: string; focusCoords?: {x:number,y:number}; sendCoords?: {x:number,y:number} }) => ipcRenderer.invoke('simulate-reply', data),
  onCaptureImage: (callback: CaptureCallback) => ipcRenderer.on('capture-image', (_, data: CaptureResult) => callback(data)),
  startWeChatBridge: () => ipcRenderer.invoke('wechat-bridge-start'),
  stopWeChatBridge: () => ipcRenderer.invoke('wechat-bridge-stop'),
  pollWeChatMessages: () => ipcRenderer.invoke('wechat-bridge-poll'),
  sendWeChatMessage: (data: { target: string; content: string; attachments?: unknown[] }) => ipcRenderer.invoke('wechat-bridge-send', data),
  executeWeChatCommand: (data: Record<string, any>) => ipcRenderer.invoke('wechat-bridge-command', data),
  setWeChatManagedMode: (mode: 'full' | 'semi') => ipcRenderer.invoke('wechat-bridge-set-managed-mode', mode),
  configureWeChatVision: (data: { backendBaseUrl: string; token: string; tenantId: string; channel?: 'personal' | 'enterprise' }) =>
    ipcRenderer.invoke('wechat-bridge-configure-vision', data),
  notifyReplySessionStarted: (data: { sessionKey: string }) => ipcRenderer.invoke('wechat-bridge-command', { action: 'reply_session_started', ...data }),
  notifyReplySessionFinished: (data: { sessionKey: string }) => ipcRenderer.invoke('wechat-bridge-command', { action: 'reply_session_finished', ...data }),
  waitForWeChatImage: (data: { senderId: string; messageUiId?: unknown; timestamp: number | string; timeout?: number }) =>
    ipcRenderer.invoke('wechat-wait-image', data),
  getUpdateStatus: () => ipcRenderer.invoke('app-update:get-status') as Promise<UpdateStatus>,
  getAppVersion: () => ipcRenderer.invoke('app-update:get-version') as Promise<string>,
  checkForUpdates: () => ipcRenderer.invoke('app-update:check') as Promise<UpdateStatus>,
  installUpdate: () => ipcRenderer.invoke('app-update:install') as Promise<boolean>,
  onUpdateStatus: (callback: (status: UpdateStatus) => void) => {
    const listener = (_: Electron.IpcRendererEvent, status: UpdateStatus) => callback(status)
    ipcRenderer.on('app-update:status', listener)
    return () => ipcRenderer.removeListener('app-update:status', listener)
  },
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close')
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
