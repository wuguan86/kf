import { clipboard } from 'electron'
import { spawn } from 'child_process'
import type { WindowBounds } from './types'

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

export const pasteAndSendText = async (bounds: WindowBounds, content: string): Promise<boolean> => {
  const originalClipboardText = clipboard.readText()
  clipboard.writeText(content)

  const inputX = Math.round(bounds.x + bounds.width * 0.66)
  const inputY = Math.round(bounds.y + bounds.height - 72)
  const sendX = Math.round(bounds.x + bounds.width - 54)
  const sendY = Math.round(bounds.y + bounds.height - 32)

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
$hwnd = [IntPtr]${Math.round(bounds.hwnd)}
[void][NativeInput]::SetForegroundWindow($hwnd)
Start-Sleep -Milliseconds 220
[void][NativeInput]::SetCursorPos(${inputX}, ${inputY})
[NativeInput]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 60
[NativeInput]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 180
[System.Windows.Forms.SendKeys]::SendWait("^v")
Start-Sleep -Milliseconds 450
[void][NativeInput]::SetCursorPos(${sendX}, ${sendY})
[NativeInput]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 60
[NativeInput]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
`

  try {
    await runPowerShell(script, 15000)
    console.info('新方式已完成剪贴板粘贴并点击发送', {
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
      console.warn('新方式恢复剪贴板失败', error)
    }
  }
}
