import { clipboard } from 'electron'
import { spawn } from 'child_process'
import type { MarketingMomentPoint, UnreadConversationCandidate, WindowBounds } from './types'
import type { WeChatInputBackend } from './inputBackendTypes'
import { getConversationListExitPoint, getNestedConversationBackPoint } from './conversationExitPoint'
import { getMomentsEntryPoint } from './momentsEntryPoint'
import { getMarketingCommentSendPoint } from './marketingCommentSendPoint'

const runPowerShell = async (script: string, timeoutMs = 10000): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('powershell', ['-Sta', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      windowsHide: true
    })
    let stderr = ''
    const timer = setTimeout(() => {
      try {
        child.kill()
      } catch {
      }
      reject(new Error('输入模拟执行超时'))
    }, timeoutMs)
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(stderr.trim() || `输入模拟退出码异常：${code}`))
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

export const createPowerShellInputBackend = (): WeChatInputBackend => {
  return {
    async pasteAndSendText(bounds: WindowBounds, content: string): Promise<boolean> {
      const originalClipboardText = clipboard.readText()
      clipboard.writeText(content)

      const inputX = Math.round(bounds.x + bounds.width * 0.66 + Math.random() * 12 - 6)
      const inputY = Math.round(bounds.y + bounds.height - 72 + Math.random() * 8 - 4)
      const sendX = Math.round(bounds.x + bounds.width - 54 + Math.random() * 10 - 5)
      const sendY = Math.round(bounds.y + bounds.height - 32 + Math.random() * 8 - 4)

      const script = `
$OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class NativeInput {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@
function Move-HumanLike([int]$targetX, [int]$targetY) {
  $current = [System.Windows.Forms.Cursor]::Position
  $steps = Get-Random -Minimum 4 -Maximum 9
  for ($i = 1; $i -le $steps; $i++) {
    $ratio = [double]$i / [double]$steps
    $nextX = [int]($current.X + (($targetX - $current.X) * $ratio) + (Get-Random -Minimum -2 -Maximum 3))
    $nextY = [int]($current.Y + (($targetY - $current.Y) * $ratio) + (Get-Random -Minimum -2 -Maximum 3))
    [void][NativeInput]::SetCursorPos($nextX, $nextY)
    Start-Sleep -Milliseconds (Get-Random -Minimum 18 -Maximum 52)
  }
  [void][NativeInput]::SetCursorPos($targetX, $targetY)
}
function Click-HumanLike([int]$targetX, [int]$targetY) {
  Move-HumanLike $targetX $targetY
  Start-Sleep -Milliseconds (Get-Random -Minimum 80 -Maximum 180)
  [NativeInput]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds (Get-Random -Minimum 45 -Maximum 105)
  [NativeInput]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
}
$hwnd = [IntPtr]${Math.round(bounds.hwnd)}
[void][NativeInput]::SetForegroundWindow($hwnd)
Start-Sleep -Milliseconds (Get-Random -Minimum 220 -Maximum 420)
Click-HumanLike ${inputX} ${inputY}
Start-Sleep -Milliseconds (Get-Random -Minimum 160 -Maximum 320)
[System.Windows.Forms.SendKeys]::SendWait("^v")
Start-Sleep -Milliseconds (Get-Random -Minimum 420 -Maximum 760)
Click-HumanLike ${sendX} ${sendY}
Start-Sleep -Milliseconds (Get-Random -Minimum 180 -Maximum 320)
[System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
Start-Sleep -Milliseconds (Get-Random -Minimum 180 -Maximum 320)
`

      try {
        await runPowerShell(script, 15000)
        console.info('PowerShell 输入后端已完成剪贴板粘贴并点击发送', {
          window: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, processName: bounds.processName },
          inputX,
          inputY,
          sendX,
          sendY
        })
        return true
      } finally {
        try {
          clipboard.writeText(originalClipboardText)
        } catch (error) {
          console.warn('PowerShell 输入后端恢复剪贴板失败', error)
        }
      }
    },

    async clickConversationCandidate(bounds: WindowBounds, candidate: UnreadConversationCandidate): Promise<boolean> {
      const clickX = Math.round(candidate.centerX + Math.random() * 10 - 5)
      const clickY = Math.round(candidate.centerY + Math.random() * 10 - 5)
      const script = `
$OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class NativeConversationClick {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@
function Move-HumanLike([int]$targetX, [int]$targetY) {
  $current = [System.Windows.Forms.Cursor]::Position
  $steps = Get-Random -Minimum 4 -Maximum 9
  for ($i = 1; $i -le $steps; $i++) {
    $ratio = [double]$i / [double]$steps
    $nextX = [int]($current.X + (($targetX - $current.X) * $ratio) + (Get-Random -Minimum -2 -Maximum 3))
    $nextY = [int]($current.Y + (($targetY - $current.Y) * $ratio) + (Get-Random -Minimum -2 -Maximum 3))
    [void][NativeConversationClick]::SetCursorPos($nextX, $nextY)
    Start-Sleep -Milliseconds (Get-Random -Minimum 18 -Maximum 52)
  }
  [void][NativeConversationClick]::SetCursorPos($targetX, $targetY)
}
$hwnd = [IntPtr]${Math.round(bounds.hwnd)}
[void][NativeConversationClick]::SetForegroundWindow($hwnd)
Start-Sleep -Milliseconds (Get-Random -Minimum 180 -Maximum 360)
Move-HumanLike ${clickX} ${clickY}
Start-Sleep -Milliseconds (Get-Random -Minimum 90 -Maximum 190)
[NativeConversationClick]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds (Get-Random -Minimum 45 -Maximum 105)
[NativeConversationClick]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
`

      await runPowerShell(script, 8000)
      console.info('PowerShell 输入后端已点击未读会话', {
        candidateId: candidate.id,
        clickX,
        clickY,
        score: candidate.score
      })
      return true
    },

    async exitConversationToList(bounds: WindowBounds): Promise<boolean> {
      const exitPoint = getConversationListExitPoint(bounds)
      const listX = Math.round(exitPoint.x + Math.random() * 8 - 4)
      const listY = Math.round(exitPoint.y + Math.random() * 10 - 5)
      const script = `
$OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class NativeExitConversation {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@
function Move-HumanLike([int]$targetX, [int]$targetY) {
  $current = [System.Windows.Forms.Cursor]::Position
  $steps = Get-Random -Minimum 4 -Maximum 8
  for ($i = 1; $i -le $steps; $i++) {
    $ratio = [double]$i / [double]$steps
    $nextX = [int]($current.X + (($targetX - $current.X) * $ratio) + (Get-Random -Minimum -2 -Maximum 3))
    $nextY = [int]($current.Y + (($targetY - $current.Y) * $ratio) + (Get-Random -Minimum -2 -Maximum 3))
    [void][NativeExitConversation]::SetCursorPos($nextX, $nextY)
    Start-Sleep -Milliseconds (Get-Random -Minimum 16 -Maximum 46)
  }
  [void][NativeExitConversation]::SetCursorPos($targetX, $targetY)
}
function Click-HumanLike([int]$targetX, [int]$targetY) {
  Move-HumanLike $targetX $targetY
  Start-Sleep -Milliseconds (Get-Random -Minimum 70 -Maximum 140)
  [NativeExitConversation]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds (Get-Random -Minimum 40 -Maximum 90)
  [NativeExitConversation]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
}
$hwnd = [IntPtr]${Math.round(bounds.hwnd)}
[void][NativeExitConversation]::SetForegroundWindow($hwnd)
Start-Sleep -Milliseconds (Get-Random -Minimum 180 -Maximum 320)
Click-HumanLike ${listX} ${listY}
Start-Sleep -Milliseconds (Get-Random -Minimum 180 -Maximum 320)
`

      await runPowerShell(script, 8000)
      console.info('PowerShell 输入后端已返回微信会话列表', {
        listX,
        listY,
        processName: bounds.processName
      })
      return true
    },

    async returnFromNestedConversation(bounds: WindowBounds): Promise<boolean> {
      const backPoint = getNestedConversationBackPoint(bounds)
      const backX = Math.round(backPoint.x + Math.random() * 6 - 3)
      const backY = Math.round(backPoint.y + Math.random() * 6 - 3)
      const script = `
$OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class NativeNestedConversationBack {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@
function Move-HumanLike([int]$targetX, [int]$targetY) {
  $current = [System.Windows.Forms.Cursor]::Position
  $steps = Get-Random -Minimum 4 -Maximum 8
  for ($i = 1; $i -le $steps; $i++) {
    $ratio = [double]$i / [double]$steps
    $nextX = [int]($current.X + (($targetX - $current.X) * $ratio) + (Get-Random -Minimum -2 -Maximum 3))
    $nextY = [int]($current.Y + (($targetY - $current.Y) * $ratio) + (Get-Random -Minimum -2 -Maximum 3))
    [void][NativeNestedConversationBack]::SetCursorPos($nextX, $nextY)
    Start-Sleep -Milliseconds (Get-Random -Minimum 16 -Maximum 46)
  }
  [void][NativeNestedConversationBack]::SetCursorPos($targetX, $targetY)
}
function Click-HumanLike([int]$targetX, [int]$targetY) {
  Move-HumanLike $targetX $targetY
  Start-Sleep -Milliseconds (Get-Random -Minimum 70 -Maximum 140)
  [NativeNestedConversationBack]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds (Get-Random -Minimum 40 -Maximum 90)
  [NativeNestedConversationBack]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
}
$hwnd = [IntPtr]${Math.round(bounds.hwnd)}
[void][NativeNestedConversationBack]::SetForegroundWindow($hwnd)
Start-Sleep -Milliseconds (Get-Random -Minimum 180 -Maximum 320)
Click-HumanLike ${backX} ${backY}
Start-Sleep -Milliseconds (Get-Random -Minimum 180 -Maximum 320)
`

      await runPowerShell(script, 8000)
      console.info('PowerShell 输入后端已点击微信内层会话返回按钮', {
        backX,
        backY,
        processName: bounds.processName
      })
      return true
    },

    async clickMomentsEntry(bounds: WindowBounds): Promise<boolean> {
      const point = getMomentsEntryPoint(bounds)
      const clickX = Math.round(bounds.x + point.x + Math.random() * 6 - 3)
      const clickY = Math.round(bounds.y + point.y + Math.random() * 6 - 3)
      const script = `
$OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class NativeMomentsEntryClick {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@
$hwnd = [IntPtr]${Math.round(bounds.hwnd)}
[void][NativeMomentsEntryClick]::SetForegroundWindow($hwnd)
Start-Sleep -Milliseconds (Get-Random -Minimum 180 -Maximum 320)
[void][NativeMomentsEntryClick]::SetCursorPos(${clickX}, ${clickY})
Start-Sleep -Milliseconds (Get-Random -Minimum 80 -Maximum 160)
[NativeMomentsEntryClick]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds (Get-Random -Minimum 45 -Maximum 105)
[NativeMomentsEntryClick]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
`

      await runPowerShell(script, 8000)
      console.info('PowerShell 输入后端已点击微信朋友圈入口', {
        clickX,
        clickY,
        processName: bounds.processName
      })
      return true
    },

    async clickMarketingPoint(bounds: WindowBounds, point: MarketingMomentPoint): Promise<boolean> {
      const clickX = Math.round(bounds.x + point.x + Math.random() * 8 - 4)
      const clickY = Math.round(bounds.y + point.y + Math.random() * 8 - 4)
      const script = `
$OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class NativeMarketingClick {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@
function Move-HumanLike([int]$targetX, [int]$targetY) {
  $current = [System.Windows.Forms.Cursor]::Position
  $steps = Get-Random -Minimum 4 -Maximum 9
  for ($i = 1; $i -le $steps; $i++) {
    $ratio = [double]$i / [double]$steps
    $nextX = [int]($current.X + (($targetX - $current.X) * $ratio) + (Get-Random -Minimum -2 -Maximum 3))
    $nextY = [int]($current.Y + (($targetY - $current.Y) * $ratio) + (Get-Random -Minimum -2 -Maximum 3))
    [void][NativeMarketingClick]::SetCursorPos($nextX, $nextY)
    Start-Sleep -Milliseconds (Get-Random -Minimum 18 -Maximum 52)
  }
  [void][NativeMarketingClick]::SetCursorPos($targetX, $targetY)
}
$hwnd = [IntPtr]${Math.round(bounds.hwnd)}
[void][NativeMarketingClick]::SetForegroundWindow($hwnd)
Start-Sleep -Milliseconds (Get-Random -Minimum 180 -Maximum 360)
Move-HumanLike ${clickX} ${clickY}
Start-Sleep -Milliseconds (Get-Random -Minimum 90 -Maximum 190)
[NativeMarketingClick]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds (Get-Random -Minimum 45 -Maximum 105)
[NativeMarketingClick]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
`

      await runPowerShell(script, 8000)
      console.info('PowerShell 输入后端已点击朋友圈营销候选点', {
        clickX,
        clickY,
        processName: bounds.processName
      })
      return true
    },

    async closeMomentsWindow(bounds: WindowBounds): Promise<boolean> {
      const closeX = Math.round(bounds.x + bounds.width - 30 + Math.random() * 6 - 3)
      const closeY = Math.round(bounds.y + 24 + Math.random() * 4 - 2)
      const script = `
$OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class NativeMomentsWindowClose {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@
$hwnd = [IntPtr]${Math.round(bounds.hwnd)}
[void][NativeMomentsWindowClose]::SetForegroundWindow($hwnd)
Start-Sleep -Milliseconds (Get-Random -Minimum 160 -Maximum 300)
[void][NativeMomentsWindowClose]::SetCursorPos(${closeX}, ${closeY})
Start-Sleep -Milliseconds (Get-Random -Minimum 70 -Maximum 140)
[NativeMomentsWindowClose]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds (Get-Random -Minimum 45 -Maximum 105)
[NativeMomentsWindowClose]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds (Get-Random -Minimum 180 -Maximum 320)
`

      await runPowerShell(script, 8000)
      console.info('PowerShell 输入后端已点击微信朋友圈窗口关闭按钮', {
        closeX,
        closeY,
        processName: bounds.processName
      })
      return true
    },

    async pasteMarketingComment(bounds: WindowBounds, content: string): Promise<boolean> {
      const originalClipboardText = clipboard.readText()
      clipboard.writeText(content)
      const sendPoint = getMarketingCommentSendPoint(bounds)
      const sendX = Math.round(sendPoint.x + Math.random() * 8 - 4)
      const sendY = Math.round(sendPoint.y + Math.random() * 6 - 3)
      const script = `
$OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class NativeMarketingComment {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
}
"@
function Move-HumanLike([int]$targetX, [int]$targetY) {
  $current = [System.Windows.Forms.Cursor]::Position
  $steps = Get-Random -Minimum 4 -Maximum 8
  for ($i = 1; $i -le $steps; $i++) {
    $ratio = [double]$i / [double]$steps
    $nextX = [int]($current.X + (($targetX - $current.X) * $ratio) + (Get-Random -Minimum -2 -Maximum 3))
    $nextY = [int]($current.Y + (($targetY - $current.Y) * $ratio) + (Get-Random -Minimum -2 -Maximum 3))
    [void][NativeMarketingComment]::SetCursorPos($nextX, $nextY)
    Start-Sleep -Milliseconds (Get-Random -Minimum 18 -Maximum 52)
  }
  [void][NativeMarketingComment]::SetCursorPos($targetX, $targetY)
}
function Click-HumanLike([int]$targetX, [int]$targetY) {
  Move-HumanLike $targetX $targetY
  Start-Sleep -Milliseconds (Get-Random -Minimum 80 -Maximum 160)
  [NativeMarketingComment]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds (Get-Random -Minimum 45 -Maximum 105)
  [NativeMarketingComment]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
}
$hwnd = [IntPtr]${Math.round(bounds.hwnd)}
[void][NativeMarketingComment]::SetForegroundWindow($hwnd)
Start-Sleep -Milliseconds (Get-Random -Minimum 180 -Maximum 320)
[System.Windows.Forms.SendKeys]::SendWait("^v")
Start-Sleep -Milliseconds (Get-Random -Minimum 360 -Maximum 680)
Click-HumanLike ${sendX} ${sendY}
Start-Sleep -Milliseconds (Get-Random -Minimum 180 -Maximum 320)
`

      try {
        await runPowerShell(script, 12000)
        console.info('PowerShell 输入后端已粘贴并点击朋友圈评论发送按钮', {
          contentLength: Array.from(content).length,
          sendX,
          sendY,
          processName: bounds.processName
        })
        return true
      } finally {
        try {
          clipboard.writeText(originalClipboardText)
        } catch (error) {
          console.warn('PowerShell 输入后端恢复剪贴板失败', error)
        }
      }
    }
  }
}
