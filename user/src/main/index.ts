import { app, shell, BrowserWindow, ipcMain, desktopCapturer, screen, clipboard } from 'electron'
import { join, dirname } from 'path'
import { writeFile, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import { spawn, execSync, type ChildProcessWithoutNullStreams } from 'child_process'
import os from 'os'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { WeChatClipboardImageExtractor } from './services/WeChatClipboardImageExtractor'

let mainWindow: BrowserWindow | null = null
let captureWindow: BrowserWindow | null = null
let wechatBridgeProcess: ReturnType<typeof spawn> | null = null
let wechatBridgeStartPromise: Promise<Record<string, any>> | null = null
let wechatBridgeDesiredRunning = false
let wechatBridgeRestartTimer: NodeJS.Timeout | null = null
const WECHAT_BRIDGE_REQUEST_TIMEOUT_MS = 5000
const WECHAT_BRIDGE_SEND_TIMEOUT_MS = 90000
const WECHAT_BRIDGE_STARTUP_TIMEOUT_MS = 20000

const scheduleWeChatBridgeRestart = (reason: string): void => {
  if (!wechatBridgeDesiredRunning || wechatBridgeRestartTimer) {
    return
  }
  console.warn('微信桥接服务异常退出，准备自动重启', { reason })
  wechatBridgeRestartTimer = setTimeout(() => {
    wechatBridgeRestartTimer = null
    if (!wechatBridgeDesiredRunning) {
      return
    }
    startWeChatBridgeProcess().catch((error) => {
      console.error('微信桥接服务自动重启失败', error)
      scheduleWeChatBridgeRestart('restart_failed')
    })
  }, 1000)
}

const killProcessTree = (pid: number): void => {
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /pid ${pid} /T /F`)
    } else {
      process.kill(-pid) // Kill process group for Unix
    }
  } catch (e) {
    // Ignore error if process already dead
    console.log(`Failed to kill process ${pid}:`, e)
  }
}

const getSidecarWeChatDir = (): string => {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'sidecar')
  }
  const appPath = app.getAppPath()
  return join(dirname(appPath), 'sidecar_wechat')
}

const getWeChatBridgeExecutable = (): string => {
  if (app.isPackaged) {
    return join(getSidecarWeChatDir(), 'wechat_bridge.exe')
  }
  return join(getSidecarWeChatDir(), 'wechat_bridge.py')
}

const getWeChatBridgeConfig = (): string => {
  return join(getSidecarWeChatDir(), 'config.yaml')
}

const getWeChatBridgeBaseUrl = (): string => {
  return 'http://127.0.0.1:51234'
}

const waitForWeChatBridgeReady = async (timeoutMs: number): Promise<void> => {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${getWeChatBridgeBaseUrl()}/health`, { method: 'GET' })
      if (res.ok) {
        return
      }
    } catch (e) {
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error('WeChat bridge not ready')
}

const requestWeChatBridge = async (
  endpoint: string,
  init: RequestInit,
  timeoutMs: number = WECHAT_BRIDGE_REQUEST_TIMEOUT_MS
): Promise<Record<string, any>> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${getWeChatBridgeBaseUrl()}${endpoint}`, {
      ...init,
      signal: controller.signal
    })
    const text = await res.text()
    let payload: Record<string, any> = {}
    try {
      payload = JSON.parse(text)
    } catch (e) {
      return { ok: false, error: 'invalid_json', raw: text, status: res.status }
    }
    if (!res.ok) {
      return {
        ok: false,
        error: payload.error || 'bridge_http_error',
        status: res.status,
        ...payload
      }
    }
    return payload
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      const isSendCommand = timeoutMs >= WECHAT_BRIDGE_SEND_TIMEOUT_MS
      const message = isSendCommand
        ? '微信自动发送等待超时，请确认微信窗口未卡住后重试'
        : '微信桥接服务请求超时，请稍后重试'
      console.warn('微信桥接请求超时', { endpoint, timeoutMs, message })
      return { ok: false, error: 'bridge_timeout', message }
    }
    return { ok: false, error: 'bridge_unreachable', message: e?.message || String(e) }
  } finally {
    clearTimeout(timeout)
  }
}

const startWeChatBridgeProcess = async (): Promise<Record<string, any>> => {
  wechatBridgeDesiredRunning = true
  if (wechatBridgeStartPromise) {
    return wechatBridgeStartPromise
  }

  wechatBridgeStartPromise = (async () => {
    if (wechatBridgeProcess && !wechatBridgeProcess.killed) {
      try {
        await waitForWeChatBridgeReady(3000)
        return { ok: true }
      } catch (e: any) {
        console.info('微信桥接服务仍在启动中', { message: e?.message || String(e) })
        return { ok: true, warmingUp: true, message: 'bridge_starting' }
      }
    }

    const execPath = getWeChatBridgeExecutable()
    const configPath = getWeChatBridgeConfig()

    if (!existsSync(execPath)) {
      return { ok: false, error: `WeChat bridge executable not found: ${execPath}` }
    }
    if (!existsSync(configPath)) {
      return { ok: false, error: `config.yaml not found: ${configPath}` }
    }

    console.info('正在启动微信桥接服务', { execPath, configPath, packaged: app.isPackaged })
    if (app.isPackaged) {
      wechatBridgeProcess = spawn(execPath, ['--config', configPath], {
        cwd: getSidecarWeChatDir(),
        windowsHide: true
      })
    } else {
      wechatBridgeProcess = spawn('python', [execPath, '--config', configPath], {
        cwd: getSidecarWeChatDir(),
        windowsHide: true
      })
    }

    wechatBridgeProcess.on('exit', (code, signal) => {
      console.warn('微信桥接进程已退出', { code, signal })
      wechatBridgeProcess = null
      scheduleWeChatBridgeRestart(`exit:${code ?? 'null'}:${signal ?? 'null'}`)
    })
    wechatBridgeProcess.on('error', (error) => {
      console.error('微信桥接进程异常', error)
      wechatBridgeProcess = null
      scheduleWeChatBridgeRestart('process_error')
    })
    // sidecar 会把大量中文扫描日志写到控制台；主进程必须消费管道，避免运行一段时间后阻塞。
    wechatBridgeProcess.stdout?.on('data', () => {})
    wechatBridgeProcess.stderr?.on('data', () => {})

    try {
      await waitForWeChatBridgeReady(WECHAT_BRIDGE_STARTUP_TIMEOUT_MS)
      return { ok: true }
    } catch (e: any) {
      if (wechatBridgeProcess && !wechatBridgeProcess.killed) {
        return { ok: true, warmingUp: true, message: 'bridge_starting' }
      }
      return { ok: false, error: 'bridge_not_ready', message: e?.message || String(e) }
    }
  })()

  try {
    return await wechatBridgeStartPromise
  } finally {
    wechatBridgeStartPromise = null
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    frame: false, // Disable native title bar
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: false
    }
  })

  // IPC handlers for custom title bar
  ipcMain.on('window-minimize', () => {
    mainWindow?.minimize()
  })

  ipcMain.on('window-maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow?.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })

  ipcMain.on('window-close', () => {
    mainWindow?.close()
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createCaptureWindow(): void {
  const { width, height } = screen.getPrimaryDisplay().bounds

  captureWindow = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    fullscreen: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  captureWindow.setIgnoreMouseEvents(false)
  captureWindow.setAlwaysOnTop(true, 'screen-saver')
  captureWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  captureWindow.once('ready-to-show', () => {
    captureWindow?.show()
    captureWindow?.focus()
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    captureWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/#/capture`)
  } else {
    captureWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'capture' })
  }
}

ipcMain.on('start-capture', () => {
  if (!captureWindow) {
    createCaptureWindow()
  }
})

ipcMain.on('close-capture', () => {
  if (captureWindow) {
    captureWindow.close()
    captureWindow = null
  }
})

ipcMain.handle('do-capture', async (_, coords) => {
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width, height } = primaryDisplay.size
  const scaleFactor = primaryDisplay.scaleFactor

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width, height }
  })

  const primarySource = sources[0]

  if (primarySource) {
    const cropRect = {
      x: Math.max(0, Math.round(coords.x * scaleFactor)),
      y: Math.max(0, Math.round(coords.y * scaleFactor)),
      width: Math.max(1, Math.round(coords.w * scaleFactor)),
      height: Math.max(1, Math.round(coords.h * scaleFactor))
    }
    const image = primarySource.thumbnail.crop(cropRect)
    
    // Upscale image 2x to improve OCR accuracy for small text
    const scaledImage = image.resize({
      width: image.getSize().width * 2,
      height: image.getSize().height * 2,
      quality: 'best'
    })
    
    const dataUrl = scaledImage.toDataURL()
    
    let isManual = false
    if (captureWindow) {
      captureWindow.close()
      captureWindow = null
      isManual = true
    }

    if (isManual) {
      mainWindow?.webContents.send('capture-image', { dataUrl, bounds: coords })
    }
    
    return { dataUrl, bounds: coords }
  }
  return null
})

ipcMain.handle('perform-ocr', async (_, dataUrl) => {
  const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '')
  const buffer = Buffer.from(base64Data, 'base64')
  const tempPath = join(os.tmpdir(), `ocr_temp_${Date.now()}.png`)

  try {
    await writeFile(tempPath, buffer)
    
    const binDir = app.isPackaged 
      ? join(process.resourcesPath, 'bin')
      : join(__dirname, '../../resources/bin')
    
    const ocrPath = join(binDir, 'PaddleOCR-json.exe')
    const modelsPath = join(binDir, 'models')

    return new Promise((resolve, reject) => {
      // PaddleOCR-json requires the image path passed via arguments
      // It outputs log info and JSON result to stdout
      // Fix: Pass models_path explicitly and run from temp dir to avoid crash when path contains Chinese characters
      const args = [
        `--image_path=${tempPath}`,
        `--models_path=${modelsPath}`
      ]
      console.log('Running OCR with:', ocrPath, args)
      
      let ocrProcess: ChildProcessWithoutNullStreams | null = null
      const timeoutTimer = setTimeout(() => {
        if (ocrProcess) {
           try { ocrProcess.kill() } catch (e) { /* ignore */ }
        }
        reject(new Error('OCR Timeout (10s) - Process took too long'))
      }, 10000)

      try {
        // IMPORTANT: Set cwd to a safe ASCII path (like temp dir) to avoid 0xC0000409 crash
        // when project path contains non-ASCII characters.
        ocrProcess = spawn(ocrPath, args, {
          cwd: os.tmpdir() 
        })
      } catch (spawnError: any) {
        clearTimeout(timeoutTimer)
        reject(new Error(`Failed to spawn OCR process: ${spawnError.message}`))
        return
      }
      
      let stdoutData = ''
      let stderrData = ''

      ocrProcess.stdout.on('data', (data) => {
        stdoutData += data.toString()
      })
      
      ocrProcess.stderr.on('data', (data) => {
        stderrData += data.toString()
      })

      ocrProcess.on('close', async (code) => {
        clearTimeout(timeoutTimer)
        try {
            if (existsSync(tempPath)) await unlink(tempPath)
        } catch (e) { /* ignore cleanup error */ }
        
        console.log('OCR Process exited with code:', code)
        // console.log('OCR Stdout:', stdoutData) 

        // Split output by lines to handle mixed log/json output
        const lines = stdoutData.split(/\r?\n/)
        let result = { text: '', items: [] as any[] }
        let hasJson = false

        for (const line of lines) {
          try {
            if (!line.trim()) continue
            
            // Try to parse each line as JSON
            const parsed = JSON.parse(line.trim())
            
            // Check if it's a valid OCR result (code 100 means success in PaddleOCR-json)
            if (parsed.code === 100 && parsed.data) {
              hasJson = true
              result.text = parsed.data.map((item: any) => item.text).join('\n')
              result.items = parsed.data
              break // Found the result, stop processing
            }
          } catch (e) {
            // Ignore non-JSON lines
          }
        }

        if (hasJson) {
          resolve(result)
        } else {
          // Return detailed error info for debugging
          const debugInfo = [
            '识别失败。调试信息：',
            `Exit Code: ${code}`,
            '--- Stdout ---',
            stdoutData.slice(0, 500) + (stdoutData.length > 500 ? '...' : ''),
            '--- Stderr ---',
            stderrData.slice(0, 500) + (stderrData.length > 500 ? '...' : '')
          ].join('\n')
          resolve({ text: debugInfo, items: [] })
        }
      })

      ocrProcess.on('error', async (err) => {
        clearTimeout(timeoutTimer)
        try {
            if (existsSync(tempPath)) await unlink(tempPath)
        } catch (e) { /* ignore cleanup error */ }
        console.error('OCR Process Error:', err)
        reject(new Error(`OCR Process Error: ${err.message}`))
      })
    })
  } catch (error) {
    console.error('OCR Error:', error)
    return { text: 'OCR 识别出错', items: [] }
  }
})

ipcMain.handle('simulate-reply', async (_, { text, focusCoords, sendCoords }) => {
  // Use PowerShell to simulate input
  // focusCoords: {x, y} to click first (to focus window)
  // text: string to type
  // sendCoords: {x, y} to click "Send"
  
  const escapePs = (s: string) => s.replace(/'/g, "''").replace(/"/g, '\\"')
  
  const psScript = `
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    
    $mouse_code = @'
      [DllImport("user32.dll",CharSet=CharSet.Auto, CallingConvention=CallingConvention.StdCall)]
      public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint cButtons, uint dwExtraInfo);
      
      [DllImport("user32.dll")]
      public static extern bool SetCursorPos(int X, int Y);
'@
    $win32 = Add-Type -MemberDefinition $mouse_code -Name "Win32" -Namespace Win32Functions -PassThru

    function Click-At($x, $y) {
       [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point($x, $y)
       $win32::mouse_event(0x0002, 0, 0, 0, 0) # LeftDown
       Start-Sleep -Milliseconds 50
       $win32::mouse_event(0x0004, 0, 0, 0, 0) # LeftUp
    }

    # 1. Click to focus (if coords provided)
    ${focusCoords ? `Click-At ${Math.round(focusCoords.x)} ${Math.round(focusCoords.y)}` : ''}
    
    Start-Sleep -Milliseconds 200

    # 2. Paste text (Clipboard method)
    $text = '${escapePs(text)}'
    try {
        [System.Windows.Forms.Clipboard]::SetText($text)
        Start-Sleep -Milliseconds 100
        [System.Windows.Forms.SendKeys]::SendWait("^v")
    } catch {
        Write-Host "Clipboard paste failed: $_"
    }

    Start-Sleep -Milliseconds 500

    # 3. Click Send (if coords provided)
    ${sendCoords ? `Click-At ${Math.round(sendCoords.x)} ${Math.round(sendCoords.y)}` : ''}
  `

  try {
    // IMPORTANT: Use -Sta for Clipboard access
    const child = spawn('powershell', ['-Sta', '-Command', psScript])
    
    child.stdout.on('data', (d) => console.log('PS stdout:', d.toString()))
    child.stderr.on('data', (d) => console.log('PS stderr:', d.toString()))
    
    return new Promise((resolve) => {
      child.on('close', (code) => {
        resolve({ success: code === 0 })
      })
    })
  } catch (e) {
    console.error('Simulation failed:', e)
    return { success: false, error: e }
  }
})

ipcMain.handle('wechat-bridge-start', async () => {
  return startWeChatBridgeProcess()
})

ipcMain.handle('wechat-bridge-stop', async () => {
  wechatBridgeDesiredRunning = false
  if (wechatBridgeRestartTimer) {
    clearTimeout(wechatBridgeRestartTimer)
    wechatBridgeRestartTimer = null
  }
  if (wechatBridgeProcess && wechatBridgeProcess.pid) {
    try {
      console.log('Stopping WeChat Bridge Process:', wechatBridgeProcess.pid)
      killProcessTree(wechatBridgeProcess.pid)
    } catch (e) {
      console.error('Failed to stop WeChat Bridge:', e)
    }
  }
  wechatBridgeProcess = null
  return { ok: true }
})

ipcMain.handle('wechat-bridge-poll', async () => {
  let result = await requestWeChatBridge('/poll', { method: 'GET' })
  if (!result.ok && result.error === 'bridge_unreachable' && wechatBridgeProcess && !wechatBridgeProcess.killed) {
    try {
      await waitForWeChatBridgeReady(1500)
      result = await requestWeChatBridge('/poll', { method: 'GET' })
    } catch (e: any) {
      result = { ok: false, error: 'bridge_unreachable', message: e?.message || String(e) }
    }
  }
  if (!result.ok && result.error === 'bridge_unreachable') {
    console.warn('微信桥接服务不可用，尝试自动恢复')
    const startResult = await startWeChatBridgeProcess()
    if (!startResult?.ok || startResult?.warmingUp) {
      return {
        ok: false,
        error: startResult?.error || 'bridge_starting',
        message: startResult?.message || 'bridge_starting'
      }
    }
    result = await requestWeChatBridge('/poll', { method: 'GET' })
  }
  return result
})

ipcMain.handle('wechat-bridge-send', async (_, payload: { target: string; content: string }) => {
  return requestWeChatBridge('/command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }, WECHAT_BRIDGE_SEND_TIMEOUT_MS)
})

ipcMain.handle('wechat-bridge-command', async (_, payload: Record<string, any>) => {
  return requestWeChatBridge('/command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {})
  })
})

ipcMain.handle('wechat-bridge-set-managed-mode', async (_, mode: 'full' | 'semi') => {
  const normalizedMode = mode === 'semi' ? 'semi' : 'full'
  return requestWeChatBridge('/command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'set_managed_mode',
      mode: normalizedMode
    })
  })
})

ipcMain.handle(
  'wechat-wait-image',
  async (_, payload: { senderId?: string; messageUiId?: unknown; timestamp?: number | string; timeout?: number }) => {
    try {
      const senderId = String(payload?.senderId || '').trim()
      const rawTimestamp = payload?.timestamp
      let timestamp = Date.now()
      if (typeof rawTimestamp === 'number' && Number.isFinite(rawTimestamp)) {
        timestamp = rawTimestamp
      } else if (typeof rawTimestamp === 'string' && rawTimestamp.trim()) {
        const parsed = Date.parse(rawTimestamp)
        if (!Number.isNaN(parsed)) {
          timestamp = parsed
        }
      }
      const timeout = Number.isFinite(payload?.timeout) ? Number(payload.timeout) : 5000
      console.log('[主进程] wechat-wait-image 开始复制微信图片', { senderId, timestamp, timeout })
      const extractor = new WeChatClipboardImageExtractor({
        clipboard,
        executeWeChatCommand: (commandPayload) => requestWeChatBridge('/command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(commandPayload)
        }, Math.max(timeout + 3000, WECHAT_BRIDGE_SEND_TIMEOUT_MS))
      })
      const dataUrl = await extractor.extractImage({
        senderId,
        messageUiId: payload?.messageUiId,
        timestamp,
        timeoutMs: timeout
      })
      console.log('[主进程] wechat-wait-image 剪贴板读取成功', {
        senderId,
        timestamp,
        dataUrlLength: dataUrl.length
      })
      return { ok: true, dataUrl }
    } catch (error: any) {
      const errorMessage = error?.message || String(error)
      console.error('[主进程] wechat-wait-image 失败', { payload, error: error?.message || String(error) })
      return {
        ok: false,
        error: 'wait_image_failed',
        message: errorMessage
      }
    }
  }
)

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  wechatBridgeDesiredRunning = false
  if (wechatBridgeRestartTimer) {
    clearTimeout(wechatBridgeRestartTimer)
    wechatBridgeRestartTimer = null
  }
  if (wechatBridgeProcess && wechatBridgeProcess.pid) {
    try {
      console.log('Killing WeChat Bridge before quit...')
      killProcessTree(wechatBridgeProcess.pid)
    } catch (e) {
      console.error('Failed to kill WeChat Bridge before quit:', e)
    }
  }
  wechatBridgeProcess = null
})
