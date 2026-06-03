import { spawn } from 'child_process'
import type { WindowBounds } from './types'

const runPowerShellJson = async (script: string, timeoutMs = 5000): Promise<any> => {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      windowsHide: true
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      try {
        child.kill()
      } catch {
      }
      reject(new Error('PowerShell 执行超时'))
    }, timeoutMs)

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) {
        reject(new Error(stderr.trim() || `PowerShell 退出码异常：${code}`))
        return
      }
      try {
        resolve(JSON.parse(stdout.trim() || 'null'))
      } catch (error) {
        reject(new Error(`PowerShell JSON 解析失败：${error instanceof Error ? error.message : String(error)}`))
      }
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

const normalizeWindowBounds = (result: any): WindowBounds | null => {
  if (!result) {
    return null
  }
  const window = {
    hwnd: Number(result.hwnd),
    title: String(result.title || ''),
    className: String(result.className || ''),
    processName: String(result.processName || ''),
    x: Number(result.x),
    y: Number(result.y),
    width: Number(result.width),
    height: Number(result.height)
  }
  if (!Number.isFinite(window.hwnd) || !Number.isFinite(window.width) || !Number.isFinite(window.height)) {
    return null
  }
  return window
}

export const isPlausibleWeChatWindow = (window: WindowBounds): boolean => {
  const title = window.title.trim()
  const className = window.className.trim()
  const processName = String(window.processName || '').trim().toLowerCase()
  const looksLikeProcess = processName === 'weixin' || processName === 'wechat' || processName === 'wechatappex'
  const looksLikeClass = className === 'mmui::MainWindow' || /^Qt.*QWindowIcon/i.test(className)
  const looksLikeTitle = title === '微信' || /微信|WeChat/i.test(title)
  const sizeLooksRight = window.width >= 500 && window.height >= 500 && window.width <= 1800 && window.height <= 1400
  return sizeLooksRight && (looksLikeProcess || looksLikeClass || looksLikeTitle)
}

export const findWeChatWindow = async (): Promise<WindowBounds | null> => {
  if (process.platform !== 'win32') {
    console.warn('新方式当前仅支持 Windows 微信窗口识别')
    return null
  }

  const script = `
$OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class Win32WindowSearch {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassNameW(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
}
"@
function Build-WindowInfo([IntPtr]$hwnd) {
  if ($hwnd -eq [IntPtr]::Zero) { return $null }
  $titleBuilder = New-Object System.Text.StringBuilder 512
  $classBuilder = New-Object System.Text.StringBuilder 256
  [void][Win32WindowSearch]::GetWindowTextW($hwnd, $titleBuilder, $titleBuilder.Capacity)
  [void][Win32WindowSearch]::GetClassNameW($hwnd, $classBuilder, $classBuilder.Capacity)
  [uint32]$windowProcessId = 0
  [void][Win32WindowSearch]::GetWindowThreadProcessId($hwnd, [ref]$windowProcessId)
  $processName = ""
  try { $processName = (Get-Process -Id $windowProcessId -ErrorAction Stop).ProcessName } catch {}
  $rect = New-Object Win32WindowSearch+RECT
  [void][Win32WindowSearch]::GetWindowRect($hwnd, [ref]$rect)
  $width = $rect.Right - $rect.Left
  $height = $rect.Bottom - $rect.Top
  if ($width -le 0 -or $height -le 0) { return $null }
  [PSCustomObject]@{
    hwnd = $hwnd.ToInt64()
    title = $titleBuilder.ToString()
    className = $classBuilder.ToString()
    processName = $processName
    x = $rect.Left
    y = $rect.Top
    width = $width
    height = $height
  }
}
$matches = New-Object System.Collections.Generic.List[object]
$mainProcess = Get-Process -Name Weixin -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if ($mainProcess) {
  $info = Build-WindowInfo([IntPtr]$mainProcess.MainWindowHandle)
  if ($info) { $matches.Add($info) }
}
[Win32WindowSearch]::EnumWindows({
  param([IntPtr]$hwnd, [IntPtr]$lparam)
  if (-not [Win32WindowSearch]::IsWindowVisible($hwnd)) { return $true }
  $info = Build-WindowInfo($hwnd)
  if (-not $info) { return $true }
  $looksLikeProcess = $info.processName -in @("Weixin", "WeChat", "WeChatAppEx")
  $looksLikeClass = $info.className -eq "mmui::MainWindow" -or $info.className -like "Qt*QWindowIcon*"
  $looksLikeTitle = $info.title -eq "微信" -or $info.title -like "*微信*" -or $info.title -like "*WeChat*"
  $looksLikeAssistant = $info.title -like "*AI运营助手*" -or $info.title -like "*AI 运营助手*" -or $info.title -like "*Codex*" -or $info.title -like "*Google Chrome*"
  $sizeLooksRight = $info.width -ge 500 -and $info.height -ge 500 -and $info.width -le 1800 -and $info.height -le 1400
  if ($sizeLooksRight -and -not $looksLikeAssistant -and ($looksLikeProcess -or $looksLikeClass -or $looksLikeTitle)) {
    $matches.Add($info)
  }
  return $true
}, [IntPtr]::Zero) | Out-Null
$matches |
  Sort-Object @{ Expression = { if ($_.processName -eq "Weixin") { 0 } elseif ($_.className -like "Qt*QWindowIcon*") { 1 } else { 2 } } }, @{ Expression = { -$_.width * $_.height } } |
  Select-Object -First 1 |
  ConvertTo-Json -Compress
`

  try {
    const window = normalizeWindowBounds(await runPowerShellJson(script))
    if (!window || !isPlausibleWeChatWindow(window)) {
      console.warn('新方式未找到可信的微信窗口', { window })
      return null
    }
    return window
  } catch (error) {
    console.error('新方式查找微信窗口失败', error)
    return null
  }
}

export const focusWindow = async (hwnd: number): Promise<boolean> => {
  if (process.platform !== 'win32' || !hwnd) {
    return false
  }
  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32FocusWindow {
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@
$hwnd = [IntPtr]${Math.round(hwnd)}
[void][Win32FocusWindow]::ShowWindow($hwnd, 9)
[Win32FocusWindow]::SetForegroundWindow($hwnd) | ConvertTo-Json -Compress
`
  try {
    return !!(await runPowerShellJson(script, 2500))
  } catch (error) {
    console.warn('新方式聚焦微信窗口失败', error)
    return false
  }
}
