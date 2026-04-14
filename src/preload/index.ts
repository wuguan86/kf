import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

type CaptureCoords = { x: number; y: number; w: number; h: number }
type CaptureResult = { dataUrl: string; bounds: CaptureCoords }
type CaptureCallback = (result: CaptureResult) => void

const api = {
  startCapture: () => ipcRenderer.send('start-capture'),
  closeCapture: () => ipcRenderer.send('close-capture'),
  doCapture: (coords: CaptureCoords) => ipcRenderer.invoke('do-capture', coords),
  performOcr: (dataUrl: string) => ipcRenderer.invoke('perform-ocr', dataUrl),
  simulateReply: (data: { text: string; focusCoords?: {x:number,y:number}; sendCoords?: {x:number,y:number} }) => ipcRenderer.invoke('simulate-reply', data),
  onCaptureImage: (callback: CaptureCallback) => ipcRenderer.on('capture-image', (_, data: CaptureResult) => callback(data)),
  startWeChatBridge: () => ipcRenderer.invoke('wechat-bridge-start'),
  stopWeChatBridge: () => ipcRenderer.invoke('wechat-bridge-stop'),
  pollWeChatMessages: () => ipcRenderer.invoke('wechat-bridge-poll'),
  sendWeChatMessage: (data: { target: string; content: string }) => ipcRenderer.invoke('wechat-bridge-send', data),
  executeWeChatCommand: (data: Record<string, any>) => ipcRenderer.invoke('wechat-bridge-command', data),
  setWeChatManagedMode: (mode: 'full' | 'semi') => ipcRenderer.invoke('wechat-bridge-set-managed-mode', mode),
  waitForWeChatImage: (data: { senderId: string; timestamp: number | string; timeout?: number }) =>
    ipcRenderer.invoke('wechat-wait-image', data),
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
