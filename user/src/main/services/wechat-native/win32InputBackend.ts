import { clipboard } from 'electron'
import { createRequire } from 'module'
import type { MarketingMomentPoint, UnreadConversationCandidate, WindowBounds } from './types'
import type { WeChatInputBackend } from './inputBackendTypes'

type Win32Api = {
  setForegroundWindow: (hwnd: number) => boolean
  setCursorPos: (x: number, y: number) => boolean
  mouseEvent: (flags: number, dx: number, dy: number, data: number, extraInfo: number) => void
  keybdEvent: (virtualKey: number, scanCode: number, flags: number, extraInfo: number) => void
}

const require = createRequire(import.meta.url)

const MOUSEEVENTF_LEFTDOWN = 0x0002
const MOUSEEVENTF_LEFTUP = 0x0004
const KEYEVENTF_KEYUP = 0x0002
const VK_CONTROL = 0x11
const VK_V = 0x56
const VK_ENTER = 0x0d
const VK_ESCAPE = 0x1b

let cachedApi: Win32Api | null = null

const wait = (milliseconds: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

const loadWin32Api = (): Win32Api => {
  if (cachedApi) {
    return cachedApi
  }
  const koffi = require('koffi')
  const user32 = koffi.load('user32.dll')
  cachedApi = {
    setForegroundWindow: user32.func('bool __stdcall SetForegroundWindow(intptr hWnd)'),
    setCursorPos: user32.func('bool __stdcall SetCursorPos(int X, int Y)'),
    mouseEvent: user32.func('void __stdcall mouse_event(uint32 flags, uint32 dx, uint32 dy, uint32 data, uintptr extraInfo)'),
    keybdEvent: user32.func('void __stdcall keybd_event(uint8 virtualKey, uint8 scanCode, uint32 flags, uintptr extraInfo)')
  }
  return cachedApi
}

const focusWindow = async (api: Win32Api, hwnd: number): Promise<void> => {
  api.setForegroundWindow(Math.round(hwnd))
  await wait(80)
}

const clickAt = async (api: Win32Api, x: number, y: number): Promise<void> => {
  api.setCursorPos(Math.round(x), Math.round(y))
  await wait(20)
  api.mouseEvent(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
  await wait(25)
  api.mouseEvent(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
}

const keyDown = (api: Win32Api, virtualKey: number): void => {
  api.keybdEvent(virtualKey, 0, 0, 0)
}

const keyUp = (api: Win32Api, virtualKey: number): void => {
  api.keybdEvent(virtualKey, 0, KEYEVENTF_KEYUP, 0)
}

const pressKey = async (api: Win32Api, virtualKey: number): Promise<void> => {
  keyDown(api, virtualKey)
  await wait(20)
  keyUp(api, virtualKey)
}

const pressCtrlV = async (api: Win32Api): Promise<void> => {
  keyDown(api, VK_CONTROL)
  await wait(15)
  await pressKey(api, VK_V)
  await wait(15)
  keyUp(api, VK_CONTROL)
}

export const createWin32InputBackend = (): WeChatInputBackend => {
  return {
    async pasteAndSendText(bounds: WindowBounds, content: string): Promise<boolean> {
      const api = loadWin32Api()
      const originalClipboardText = clipboard.readText()
      const inputX = Math.round(bounds.x + bounds.width * 0.66)
      const inputY = Math.round(bounds.y + bounds.height - 72)
      try {
        clipboard.writeText(content)
        await focusWindow(api, bounds.hwnd)
        await clickAt(api, inputX, inputY)
        await wait(60)
        await pressCtrlV(api)
        await wait(80)
        await pressKey(api, VK_ENTER)
        console.info('原生输入后端已完成微信消息发送', {
          window: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, processName: bounds.processName },
          inputX,
          inputY
        })
        return true
      } finally {
        try {
          clipboard.writeText(originalClipboardText)
        } catch (error) {
          console.warn('原生输入后端恢复剪贴板失败', error)
        }
      }
    },

    async clickConversationCandidate(bounds: WindowBounds, candidate: UnreadConversationCandidate): Promise<boolean> {
      const api = loadWin32Api()
      await focusWindow(api, bounds.hwnd)
      await clickAt(api, candidate.centerX, candidate.centerY)
      console.info('原生输入后端已点击未读会话', {
        candidateId: candidate.id,
        clickX: candidate.centerX,
        clickY: candidate.centerY,
        score: candidate.score
      })
      return true
    },

    async exitConversationToList(bounds: WindowBounds): Promise<boolean> {
      const api = loadWin32Api()
      const listX = Math.round(bounds.x + bounds.width * 0.18)
      const listY = Math.round(bounds.y + bounds.height * 0.16)
      await focusWindow(api, bounds.hwnd)
      await clickAt(api, listX, listY)
      await wait(50)
      await pressKey(api, VK_ESCAPE)
      console.info('原生输入后端已返回微信会话列表', {
        listX,
        listY,
        processName: bounds.processName
      })
      return true
    },

    async clickMarketingPoint(bounds: WindowBounds, point: MarketingMomentPoint): Promise<boolean> {
      const api = loadWin32Api()
      const clickX = Math.round(bounds.x + point.x)
      const clickY = Math.round(bounds.y + point.y)
      await focusWindow(api, bounds.hwnd)
      await clickAt(api, clickX, clickY)
      console.info('原生输入后端已点击朋友圈营销候选点', {
        clickX,
        clickY,
        processName: bounds.processName
      })
      return true
    },

    async pasteMarketingComment(bounds: WindowBounds, content: string): Promise<boolean> {
      const api = loadWin32Api()
      const originalClipboardText = clipboard.readText()
      try {
        clipboard.writeText(content)
        await focusWindow(api, bounds.hwnd)
        await pressCtrlV(api)
        await wait(80)
        await pressKey(api, VK_ENTER)
        console.info('原生输入后端已粘贴并发送朋友圈评论', {
          contentLength: Array.from(content).length,
          processName: bounds.processName
        })
        return true
      } finally {
        try {
          clipboard.writeText(originalClipboardText)
        } catch (error) {
          console.warn('原生输入后端恢复剪贴板失败', error)
        }
      }
    }
  }
}
