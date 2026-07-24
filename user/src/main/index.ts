import { app, shell, BrowserWindow, ipcMain, desktopCapturer, screen, session } from 'electron'
import { join } from 'path'
import { spawn } from 'child_process'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { WeChatNativeDriver } from './services/wechat-native/WeChatNativeDriver'
import { AppUpdateService } from './services/AppUpdateService'

let mainWindow: BrowserWindow | null = null
let captureWindow: BrowserWindow | null = null
const wechatNativeDriver = new WeChatNativeDriver()
const appUpdateService = new AppUpdateService()
const APP_NAME = '视界AI助手'
const APP_USER_MODEL_ID = 'com.shijie.ai-assistant'
const APP_ICON_PATH = is.dev
  ? join(__dirname, '../../resources/icon.ico')
  : join(process.resourcesPath, 'icon.ico')

const buildDevRendererUrl = (hash?: string): string => {
  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (!rendererUrl) {
    return ''
  }
  const url = new URL(rendererUrl)
  url.searchParams.set('devCacheBust', String(Date.now()))
  if (hash) {
    url.hash = hash.startsWith('#') ? hash : `#${hash}`
  }
  return url.toString()
}

const clearDevRendererCache = async (): Promise<void> => {
  if (!is.dev) {
    return
  }
  try {
    await session.defaultSession.clearCache()
    console.info('开发模式已清理 Electron 渲染缓存，避免加载旧的 Vite 模块')
  } catch (error) {
    console.warn('开发模式清理 Electron 渲染缓存失败，将继续启动', error)
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    title: APP_NAME,
    width: 900,
    height: 670,
    show: false,
    frame: false, // Disable native title bar
    autoHideMenuBar: true,
    icon: APP_ICON_PATH,
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
    mainWindow.loadURL(buildDevRendererUrl())
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createCaptureWindow(): void {
  const { width, height } = screen.getPrimaryDisplay().bounds

  captureWindow = new BrowserWindow({
    title: APP_NAME,
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
    icon: APP_ICON_PATH,
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
    captureWindow.loadURL(buildDevRendererUrl('/capture'))
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
    
    // 手动截图保留 2 倍放大，便于用户查看细节。
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
  return wechatNativeDriver.start()
})

ipcMain.handle('wechat-bridge-stop', async () => {
  return wechatNativeDriver.stop()
})

ipcMain.handle('wechat-bridge-poll', async () => {
  return wechatNativeDriver.poll()
})

ipcMain.handle('wechat-bridge-send', async (_, payload: { target: string; content: string; attachments?: unknown[] }) => {
  return wechatNativeDriver.send(payload)
})

ipcMain.handle('wechat-bridge-command', async (_, payload: Record<string, any>) => {
  return wechatNativeDriver.command(payload || {})
})

ipcMain.handle('wechat-bridge-set-managed-mode', async (_, mode: 'full' | 'semi') => {
  const normalizedMode = mode === 'semi' ? 'semi' : 'full'
  return wechatNativeDriver.setManagedMode(normalizedMode)
})

ipcMain.handle('wechat-bridge-configure-vision', async (_, payload: { backendBaseUrl?: string; token?: string; tenantId?: string; channel?: 'personal' | 'enterprise' }) => {
  return wechatNativeDriver.configure({
    backendBaseUrl: payload?.backendBaseUrl,
    token: payload?.token,
    tenantId: payload?.tenantId,
    channel: payload?.channel
  })
})

ipcMain.handle(
  'wechat-wait-image',
  async (_, payload: { senderId?: string; messageUiId?: unknown; timestamp?: number | string; timeout?: number }) => {
    try {
      return await wechatNativeDriver.copyImageMessage(payload)
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
  console.info('微信交互方式已固定为新方式')
  app.setName(APP_NAME)
  electronApp.setAppUserModelId(APP_USER_MODEL_ID)
  await clearDevRendererCache()

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()
  if (mainWindow) {
    appUpdateService.initialize(mainWindow)
  }

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
  // 客户端退出时释放当前原生微信驱动状态，避免下次启动沿用过期会话。
  void wechatNativeDriver.stop().catch((error) => {
    console.error('客户端关闭时停止微信驱动失败', error)
  })
})

