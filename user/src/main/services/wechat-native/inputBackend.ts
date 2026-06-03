import { clipboard } from 'electron'
import { spawn } from 'child_process'
import type { UnreadConversationCandidate, WindowBounds } from './types'

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

export const clickConversationCandidate = async (
  bounds: WindowBounds,
  candidate: UnreadConversationCandidate
): Promise<boolean> => {
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
  console.info('新方式已拟人化点击未读会话', {
    candidateId: candidate.id,
    clickX,
    clickY,
    score: candidate.score
  })
  return true
}
