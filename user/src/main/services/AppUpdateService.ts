import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import axios from 'axios'
import { existsSync } from 'fs'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'

type UpdateRelease = {
  version: string
  releaseNotes: string
  feedUrl: string
  installerUrl: string
  sha512: string
  fileSize: number | null
  mandatory: boolean
  minimumSupportedVersion: string | null
}

type CheckResponse = {
  available: boolean
  mandatory: boolean
  release: UpdateRelease | null
}

export type UpdateStatus = {
  stage: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'not-available' | 'error'
  message: string
  version?: string
  progress?: number
  mandatory?: boolean
  releaseNotes?: string
}

/**
 * 通过后端确定用户命中的版本，再由 electron-updater 下载具备签名校验的安装包。
 * 不使用账号、微信或租户信息参与灰度，保护用户隐私。
 */
export class AppUpdateService {
  private mainWindow: BrowserWindow | null = null
  private latestStatus: UpdateStatus = { stage: 'idle', message: '' }
  private isChecking = false
  private readonly apiBaseUrl: string

  constructor() {
    this.apiBaseUrl = (process.env.UPDATE_API_BASE_URL || 'https://bot.toutouapp.cn').replace(/\/$/, '')
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = false
    autoUpdater.on('checking-for-update', () => this.emit({ stage: 'checking', message: '正在检查更新...' }))
    autoUpdater.on('update-available', (info) => {
      this.emit({
        stage: 'available',
        message: '发现新版本 v' + info.version + '，正在下载...',
        version: info.version
      })
    })
    autoUpdater.on('download-progress', (progress) => {
      this.emit({
        stage: 'downloading',
        message: '正在下载更新 ' + Math.round(progress.percent) + '%',
        progress: Math.round(progress.percent)
      })
    })
    autoUpdater.on('update-downloaded', (info) => {
      this.emit({
        stage: 'downloaded',
        message: '新版本 v' + info.version + ' 已下载完成',
        version: info.version
      })
    })
    autoUpdater.on('update-not-available', () => this.emit({ stage: 'not-available', message: '当前已是最新版本' }))
    autoUpdater.on('error', (error) => {
      console.error('客户端自动更新失败', error)
      this.emit({ stage: 'error', message: '检查或下载更新失败，请稍后重试' })
    })
  }

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow
    ipcMain.handle('app-update:get-version', () => app.getVersion())
    ipcMain.handle('app-update:get-status', () => this.latestStatus)
    ipcMain.handle('app-update:check', () => this.checkForUpdates())
    ipcMain.handle('app-update:install', () => this.installUpdate())

    if (!app.isPackaged) {
      console.info('开发环境已跳过自动更新检查')
      return
    }
    setTimeout(() => void this.checkForUpdates(), 10_000)
  }

  async checkForUpdates(): Promise<UpdateStatus> {
    if (!app.isPackaged) {
      return this.emit({ stage: 'idle', message: '开发环境不检查更新' })
    }
    if (this.isChecking) {
      return this.latestStatus
    }
    this.isChecking = true
    this.emit({ stage: 'checking', message: '正在检查更新...' })
    try {
      const installationId = await this.getInstallationId()
      const response = await axios.get<{ code: number; msg: string; data: CheckResponse }>(
        this.apiBaseUrl + '/api/public/desktop-releases/check',
        {
          params: {
            version: app.getVersion(),
            platform: process.platform,
            architecture: process.arch,
            channel: 'stable',
            installationId
          },
          timeout: 12_000
        }
      )
      if (response.data.code !== 0) {
        throw new Error(response.data.msg || '更新服务响应异常')
      }
      const update = response.data.data
      if (!update.available || !update.release?.feedUrl) {
        return this.emit({ stage: 'not-available', message: '当前已是最新版本' })
      }
      autoUpdater.setFeedURL({ provider: 'generic', url: update.release.feedUrl })
      const status = this.emit({
        stage: 'available',
        message: '发现新版本 v' + update.release.version + '，正在下载...',
        version: update.release.version,
        mandatory: update.mandatory,
        releaseNotes: update.release.releaseNotes
      })
      await autoUpdater.checkForUpdates()
      return status
    } catch (error) {
      console.error('请求客户端更新服务失败', error)
      return this.emit({ stage: 'error', message: '检查更新失败，请检查网络后重试' })
    } finally {
      this.isChecking = false
    }
  }

  installUpdate(): boolean {
    if (this.latestStatus.stage !== 'downloaded') {
      return false
    }
    console.info('用户确认安装客户端更新', { version: this.latestStatus.version })
    autoUpdater.quitAndInstall()
    return true
  }

  private async getInstallationId(): Promise<string> {
    const updateDirectory = join(app.getPath('userData'), 'update')
    const identityFile = join(updateDirectory, 'installation-id.json')
    try {
      if (existsSync(identityFile)) {
        const saved = JSON.parse(await readFile(identityFile, 'utf8')) as { installationId?: string }
        if (saved.installationId) {
          return saved.installationId
        }
      }
      await mkdir(updateDirectory, { recursive: true })
      const installationId = randomUUID()
      await writeFile(identityFile, JSON.stringify({ installationId }), 'utf8')
      return installationId
    } catch (error) {
      console.warn('读取客户端更新安装标识失败，将使用临时标识', error)
      return randomUUID()
    }
  }

  private emit(status: UpdateStatus): UpdateStatus {
    this.latestStatus = { ...this.latestStatus, ...status }
    this.mainWindow?.webContents.send('app-update:status', this.latestStatus)
    return this.latestStatus
  }
}
