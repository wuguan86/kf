import { clipboard, nativeImage } from 'electron'
import { createRequire } from 'module'
import type { MarketingMomentPoint, UnreadConversationCandidate, WeChatOutboundAttachment, WindowBounds } from './types'
import type { WeChatInputBackend } from './inputBackendTypes'
import { getConversationListExitPoint, getNestedConversationBackPoint } from './conversationExitPoint'
import { getMomentsEntryPoint } from './momentsEntryPoint'
import { getMarketingCommentSendPoint } from './marketingCommentSendPoint'
import { getMessageInputClickPoint } from './messageInputPoint'
import { toPhysicalScreenPoint } from './screenPoint'

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
      const inputPoint = getMessageInputClickPoint(bounds)
      const physicalInputPoint = toPhysicalScreenPoint(bounds, inputPoint)
      const inputX = physicalInputPoint.x
      const inputY = physicalInputPoint.y
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
          logicalInputPoint: inputPoint,
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

    async pasteAndSendAttachments(bounds: WindowBounds, attachments: WeChatOutboundAttachment[]): Promise<boolean> {
      const imageAttachment = attachments.find((item) => String(item.fileType || '').toUpperCase() === 'IMAGE' && item.localPath)
      if (!imageAttachment?.localPath) {
        console.warn('原生输入后端暂不支持该外发素材类型', { attachmentCount: attachments.length })
        return false
      }
      const image = nativeImage.createFromPath(imageAttachment.localPath)
      if (image.isEmpty()) {
        console.warn('原生输入后端读取外发图片为空', { localPath: imageAttachment.localPath })
        return false
      }
      const api = loadWin32Api()
      const inputPoint = getMessageInputClickPoint(bounds)
      const physicalInputPoint = toPhysicalScreenPoint(bounds, inputPoint)
      const inputX = physicalInputPoint.x
      const inputY = physicalInputPoint.y
      clipboard.writeImage(image)
      await focusWindow(api, bounds.hwnd)
      await clickAt(api, inputX, inputY)
      await wait(80)
      await pressCtrlV(api)
      await wait(240)
      await pressKey(api, VK_ENTER)
      console.info('原生输入后端已完成外发图片粘贴发送', {
        materialId: imageAttachment.materialId,
        name: imageAttachment.name,
        logicalInputPoint: inputPoint,
        inputX,
        inputY
      })
      return true
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
      const exitPoint = getConversationListExitPoint(bounds, bounds.scaleFactor)
      await focusWindow(api, bounds.hwnd)
      await clickAt(api, exitPoint.x, exitPoint.y)
      console.info('原生输入后端已返回微信会话列表', {
        listX: exitPoint.x,
        listY: exitPoint.y,
        processName: bounds.processName
      })
      return true
    },

    async returnFromNestedConversation(bounds: WindowBounds): Promise<boolean> {
      const api = loadWin32Api()
      const backPoint = getNestedConversationBackPoint(bounds, bounds.scaleFactor)
      await focusWindow(api, bounds.hwnd)
      await clickAt(api, backPoint.x, backPoint.y)
      console.info('原生输入后端已点击微信内层会话返回按钮', {
        backX: backPoint.x,
        backY: backPoint.y,
        processName: bounds.processName
      })
      return true
    },

    async clickMomentsEntry(bounds: WindowBounds): Promise<boolean> {
      const api = loadWin32Api()
      const point = getMomentsEntryPoint(bounds, bounds.scaleFactor)
      const clickX = Math.round(bounds.x + point.x)
      const clickY = Math.round(bounds.y + point.y)
      await focusWindow(api, bounds.hwnd)
      await clickAt(api, clickX, clickY)
      console.info('原生输入后端已点击微信朋友圈入口', {
        clickX,
        clickY,
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

    async closeMomentsWindow(bounds: WindowBounds): Promise<boolean> {
      const api = loadWin32Api()
      const sf = bounds.scaleFactor || 1
      const closeX = Math.round(bounds.x + bounds.width - Math.round(30 * sf))
      const closeY = Math.round(bounds.y + Math.round(24 * sf))
      await focusWindow(api, bounds.hwnd)
      await clickAt(api, closeX, closeY)
      console.info('原生输入后端已点击微信朋友圈窗口关闭按钮', {
        closeX,
        closeY,
        processName: bounds.processName
      })
      return true
    },

    async pasteMarketingComment(bounds: WindowBounds, content: string): Promise<boolean> {
      const api = loadWin32Api()
      const originalClipboardText = clipboard.readText()
      const sendPoint = getMarketingCommentSendPoint(bounds, bounds.scaleFactor)
      try {
        clipboard.writeText(content)
        await focusWindow(api, bounds.hwnd)
        await pressCtrlV(api)
        await wait(80)
        await clickAt(api, sendPoint.x, sendPoint.y)
        await wait(120)
        console.info('原生输入后端已粘贴并点击朋友圈评论发送按钮', {
          contentLength: Array.from(content).length,
          sendX: sendPoint.x,
          sendY: sendPoint.y,
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
