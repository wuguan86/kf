import { app } from 'electron'
import chokidar, { type FSWatcher } from 'chokidar'
import { execSync } from 'child_process'
import { existsSync, readdirSync, statSync, type Stats } from 'fs'
import { readFile, unlink } from 'fs/promises'
import iconv from 'iconv-lite'
import os from 'os'
import { basename, join } from 'path'

type PendingTask = {
  id: string
  senderId: string
  timestamp: number
  timeoutId: NodeJS.Timeout
  resolve: (value: string) => void
  reject: (reason?: any) => void
}

type DecodedImage = {
  mimeType: string
  dataUrl: string
  createdAt: number
}

type XorDetectResult = {
  key: number
  mimeType: string
}

const MIN_DAT_SIZE_BYTES = 1024
const MATCH_TOLERANCE_MS = 6000
const RETRY_DELAY_MS = 200
const RETRY_MAX_TIMES = 5
const RECENT_IMAGE_TTL_MS = 10_000

export class WeChatImageExtractor {
  private watcher: FSWatcher | null = null

  private imageDir: string | null = null

  private startedAt: number | null = null

  private pendingTasksBySender = new Map<string, Map<string, PendingTask>>()

  private unmatchedRecentImages: DecodedImage[] = []

  private started = false

  private startPromise: Promise<void> | null = null

  /**
   * 启动监听器。
   * 该方法会自动完成微信目录寻址、活跃账号定位和目录监听初始化。
   */
  public async start(): Promise<void> {
    if (this.started) {
      console.log('[微信图片提取] start 跳过，已启动')
      return
    }
    if (this.startPromise) {
      await this.startPromise
      return
    }

    this.startPromise = this.doStart()
    try {
      await this.startPromise
    } finally {
      this.startPromise = null
    }
  }

  /**
   * 停止监听器并释放资源。
   * 为防止内存泄漏，停止时会拒绝所有未完成的等待任务。
   */
  public async stop(): Promise<void> {
    console.log('[微信图片提取] stop 开始，待匹配任务数=', this.getPendingTaskCount())
    this.started = false
    this.startedAt = null
    if (this.watcher) {
      try {
        await this.watcher.close()
      } catch (error) {
        console.warn('[微信图片提取] 关闭监听器失败:', error)
      } finally {
        this.watcher = null
      }
    }
    this.imageDir = null
    this.unmatchedRecentImages = []
    this.failAllPending(new Error('微信图片提取器已停止'))
  }

  /**
   * 等待一张匹配的图片。
   * 当前采用“时间近邻匹配”策略：在容差范围内优先匹配时间差最小的图片。
   */
  public waitForImage(senderId: string, timestamp: number, timeout = 5000): Promise<string> {
    if (!this.started) {
      return Promise.reject(new Error('微信图片提取器未启动'))
    }

    const normalizedSenderId = String(senderId || '').trim()
    const senderBucket = this.normalizeSenderBucket(normalizedSenderId)
    const normalizedTimestamp = Number.isFinite(timestamp) ? timestamp : Date.now()
    if (this.startedAt && normalizedTimestamp < this.startedAt - MATCH_TOLERANCE_MS) {
      const tooOldError = new Error('图片消息早于监听启动时间，无法获取真实图片')
      tooOldError.name = 'ImageMessageBeforeWatcherStartError'
      return Promise.reject(tooOldError)
    }
    const taskId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    console.log('[微信图片提取] waitForImage 入队请求', {
      taskId,
      senderId: normalizedSenderId,
      timestamp: normalizedTimestamp,
      timeout
    })

    return new Promise<string>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.removePendingTask(senderBucket, taskId)
        console.warn('[微信图片提取] waitForImage 超时', {
          taskId,
          senderId: normalizedSenderId,
          timestamp: normalizedTimestamp,
          pendingCount: this.getPendingTaskCount()
        })
        reject(new Error('等待微信图片超时'))
      }, Math.max(500, timeout))

      const task: PendingTask = {
        id: taskId,
        senderId: normalizedSenderId,
        timestamp: normalizedTimestamp,
        timeoutId,
        resolve,
        reject
      }

      const matchedRecent = this.takeBestRecentImage(senderBucket, task)
      if (matchedRecent) {
        clearTimeout(timeoutId)
        console.log('[微信图片提取] waitForImage 命中 recentImages', { taskId, senderId: normalizedSenderId })
        resolve(matchedRecent.dataUrl)
        return
      }

      this.addPendingTask(senderBucket, task)
      console.log('[微信图片提取] waitForImage 已入队', {
        taskId,
        senderId: normalizedSenderId,
        bucketPendingCount: this.getPendingTaskCount(senderBucket),
        totalPendingCount: this.getPendingTaskCount()
      })
    })
  }

  public getImageDir(): string | null {
    return this.imageDir
  }

  public isStarted(): boolean {
    return this.started
  }

  public getStartedAt(): number | null {
    return this.startedAt
  }

  private async doStart(): Promise<void> {
    let resolvedImageDir = this.resolveTargetImageDir()
    if (!resolvedImageDir || !existsSync(resolvedImageDir)) {
      throw new Error(`未找到微信图片目录: ${resolvedImageDir || '未知路径'}`)
    }

    // 强制将盘符转换为大写，避免 Windows 下 chokidar 监听因为盘符大小写导致不触发的问题
    resolvedImageDir = resolvedImageDir.replace(/^[a-z]:/i, (match) => match.toUpperCase())

    this.imageDir = resolvedImageDir
    console.log('[微信图片提取-DEBUG] doStart 解析目录成功，准备监听:', { imageDir: resolvedImageDir })

    const watchPaths = this.buildWatchDirectories(resolvedImageDir)
    console.log('[微信图片提取-DEBUG] Chokidar 监听目录配置:', watchPaths)

    this.watcher = chokidar.watch(watchPaths, {
      ignoreInitial: true,
      persistent: true,
      depth: 20, // MsgAttach 的层级比较深（比如 0954e21bac.../Thumb/2026-03/*.dat），放宽 depth
      ignored: (watchPath) => this.shouldIgnoreWatchPath(watchPath),
      usePolling: false // 保持默认，通常不需要 polling
    })

    this.watcher.on('add', (filePath) => {
      if (!this.isTargetDatFile(filePath)) {
        return
      }
      console.log('[微信图片提取-DEBUG] chokidar 检测到文件新增:', filePath)
      void this.handleDatFile(filePath)
    })
    this.watcher.on('ready', () => {
      console.log('[微信图片提取-DEBUG] 目录监听 ready:', { watchCount: watchPaths.length })
    })
    this.watcher.on('error', (error) => {
      console.error('[微信图片提取-DEBUG] 目录监听异常:', error)
    })

    this.started = true
    this.startedAt = Date.now()
    console.log('[微信图片提取-DEBUG] 监听已正式启动:', resolvedImageDir)
  }

  /**
   * 自动解析微信图片目录：
   * 1) 读取注册表获取根目录
   * 2) 扫描活跃账号目录
   * 3) 拼装 FileStorage\MsgAttach 监听目录
   */
  private resolveTargetImageDir(): string {
    const roots = this.resolveWeChatRootDirs()
    console.log('[微信图片提取-DEBUG] 候选微信根目录', roots)
    
    // 优先匹配包含 WeChat Files 的目录
    for (const root of roots) {
      if (existsSync(root) && root.toLowerCase().includes('wechat files')) {
        console.log(`[微信图片提取-DEBUG] 命中微信根目录: ${root}`)
        return root
      }
    }
    
    // 兜底：如果上面的没命中，再按顺序尝试存在的目录
    for (const root of roots) {
      if (existsSync(root)) {
        console.log(`[微信图片提取-DEBUG] 兜底命中微信根目录: ${root}`)
        return root
      }
    }
    
    console.error(`[微信图片提取-DEBUG] 未找到存在的微信根目录，已尝试: ${roots.join(' | ')}`)
    throw new Error(`未找到存在的微信根目录，已尝试: ${roots.join(' | ')}`)
  }

  private resolveWeChatRootDirs(): string[] {
    const candidates: string[] = []
    const fallbackCandidates = this.getFallbackRootDirs()
    try {
      const raw = execSync('reg query "HKEY_CURRENT_USER\\Software\\Tencent\\WeChat" /v FileSavePath', {
        encoding: 'buffer',
        stdio: ['ignore', 'pipe', 'ignore']
      })
      const decoded = this.decodeRegistryOutput(raw)
      console.log('[微信图片提取] 注册表原始输出解码片段', decoded.slice(0, 200))
      const lines = decoded.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
      const target = lines.find((line) => /FileSavePath/i.test(line))
      if (!target) {
        console.warn('[微信图片提取] 注册表未找到 FileSavePath，使用回退目录')
        return this.normalizeCandidateDirs(fallbackCandidates)
      }
      const match = target.match(/FileSavePath\s+REG_\w+\s+(.+)$/i)
      const value = (match?.[1] || '').trim()
      if (!value) {
        console.warn('[微信图片提取] FileSavePath 值为空，使用回退目录')
        return this.normalizeCandidateDirs(fallbackCandidates)
      }
      console.log('[微信图片提取] 注册表 FileSavePath 原始值', value)
      candidates.push(...this.buildWeChatRootCandidates(value))
    } catch (error) {
      console.warn('[微信图片提取] 读取注册表失败，将使用回退目录:', error)
    }
    candidates.push(...fallbackCandidates)
    return this.normalizeCandidateDirs(candidates)
  }

  private decodeRegistryOutput(buffer: Buffer): string {
    const decoders = ['utf16le', 'utf8', 'gb18030', 'gbk']
    for (const encoding of decoders) {
      try {
        const text = iconv.decode(buffer, encoding).replace(/\u0000/g, '')
        if (text.toLowerCase().includes('filesavepath')) {
          console.log('[微信图片提取] 注册表解码命中编码', encoding)
          return text
        }
      } catch (error) {
      }
    }
    console.warn('[微信图片提取] 注册表解码未命中关键字，回退 gb18030')
    return iconv.decode(buffer, 'gb18030').replace(/\u0000/g, '')
  }

  private buildWeChatRootCandidates(pathValue: string): string[] {
    const value = this.expandWindowsPathAlias(String(pathValue || '').trim())
    if (!value) {
      return []
    }
    if (basename(value).toLowerCase() === 'wechat files') {
      return [value]
    }
    return [value, join(value, 'WeChat Files')]
  }

  private getFallbackRootDirs(): string[] {
    const home = os.homedir()
    const profile = process.env.USERPROFILE || home
    return [
      join(home, 'Documents', 'WeChat Files'),
      join(profile, 'Documents', 'WeChat Files'),
      join(profile, 'My Documents', 'WeChat Files'),
      join(profile, 'OneDrive', 'Documents', 'WeChat Files'),
      join('C:\\Users', os.userInfo().username, 'Documents', 'WeChat Files')
    ]
  }

  private buildWatchDirectories(rootDir: string): string[] {
    const watchDirs: string[] = []
    let accountDirs: string[] = []
    try {
      accountDirs = readdirSync(rootDir)
        .map((name) => join(rootDir, name))
        .filter((dirPath) => basename(dirPath).toLowerCase().startsWith('wxid_'))
        .filter((dirPath) => {
          try {
            return statSync(dirPath).isDirectory()
          } catch (error) {
            return false
          }
        })
    } catch (error) {
      console.warn('[微信图片提取-DEBUG] 扫描微信账号目录失败，将退回监听微信根目录', { rootDir, error })
      return [rootDir]
    }

    for (const accountDir of accountDirs) {
      const msgAttachDir = join(accountDir, 'FileStorage', 'MsgAttach')
      if (existsSync(msgAttachDir)) {
        watchDirs.push(msgAttachDir)
      }
    }

    const normalizedWatchDirs = watchDirs
      .map((dirPath) => dirPath.replace(/^[a-z]:/i, (match) => match.toUpperCase()))
      .filter((dirPath, index, list) => list.indexOf(dirPath) === index)

    if (normalizedWatchDirs.length > 0) {
      return normalizedWatchDirs
    }

    console.warn('[微信图片提取-DEBUG] 未扫描到可监听的 MsgAttach 目录，退回监听微信根目录', { rootDir })
    return [rootDir]
  }

  private normalizeCandidateDirs(candidates: string[]): string[] {
    const expanded: string[] = []
    for (const item of candidates) {
      const normalized = this.expandWindowsPathAlias(String(item || '').trim())
      if (!normalized) {
        continue
      }
      expanded.push(normalized)
      if (basename(normalized).toLowerCase() !== 'wechat files') {
        expanded.push(join(normalized, 'WeChat Files'))
      }
    }
    return expanded.filter((item, index, list) => item.length > 0 && list.indexOf(item) === index)
  }

  private getRealMyDocumentsPath(): string {
    return app.getPath('documents')
  }

  private expandWindowsPathAlias(pathValue: string): string {
    let value = String(pathValue || '').trim().replace(/^"+|"+$/g, '')
    if (!value) {
      return ''
    }
    
    // 如果是 MyDocument: 则使用 Electron 原生 API 获取真实文档路径
    if (value === 'MyDocument:') {
      const docPath = app.getPath('documents')
      return join(docPath, 'WeChat Files') // 这里直接返回文档目录拼接 WeChat Files
    }

    value = value.replace(/%([^%]+)%/g, (_, key) => process.env[key] || `%${key}%`)
    
    if (/^my\s*documents?:/i.test(value) || /^personal:/i.test(value) || /^mydocuments?/i.test(value)) {
      const realDocs = app.getPath('documents')
      value = value.replace(/^my\s*documents?:?/i, realDocs + '\\')
      value = value.replace(/^personal:?/i, realDocs + '\\')
      value = value.replace(/^mydocuments?:?/i, realDocs + '\\')
    } else {
      const homeDocs = join(os.homedir(), 'Documents')
      value = value.replace(/^my\s*documents?:/i, homeDocs)
      value = value.replace(/^personal:/i, homeDocs)
      value = value.replace(/^mydocuments?/i, homeDocs)
    }
    value = value.replace(/\//g, '\\')
    value = value.replace(/\\\\/g, '\\')
    return value
  }

  private shouldIgnoreWatchPath(filePath: string): boolean {
    const normalizedPath = String(filePath || '').replace(/\\/g, '/').toLowerCase()
    return /\/filestorage\/msgattach\/.+\/image(?:\/|$)/.test(normalizedPath)
  }

  private isTargetDatFile(filePath: string): boolean {
    const normalizedPath = String(filePath || '').replace(/\\/g, '/').toLowerCase()
    if (!normalizedPath.endsWith('.dat')) {
      return false
    }
    return /\/wxid_[^/]+\/filestorage\/msgattach\/.+\/thumb\/.+\.dat$/.test(normalizedPath)
  }

  private async handleDatFile(filePath: string): Promise<void> {
    console.log('[微信图片提取-DEBUG] 捕获到 dat 文件，准备处理:', filePath)
    let fileStat: Stats
    try {
      fileStat = statSync(filePath)
      if (fileStat.size < MIN_DAT_SIZE_BYTES) {
        console.log('[微信图片提取-DEBUG] dat 文件过小，已忽略', { filePath, size: fileStat.size })
        return
      }
    } catch (error) {
      console.warn('[微信图片提取-DEBUG] 读取 dat 文件状态失败', filePath, error)
      return
    }

    let rawBuffer: Buffer
    try {
      rawBuffer = await this.readWithRetry(filePath, RETRY_MAX_TIMES, RETRY_DELAY_MS)
      console.log('[微信图片提取-DEBUG] 成功读取 dat 文件', { filePath, bufferLength: rawBuffer.length })
    } catch (error) {
      console.warn('[微信图片提取-DEBUG] 读取 dat 文件失败:', filePath, error)
      return
    }

    const decoded = this.decodeDatBuffer(rawBuffer)
    if (!decoded) {
      console.warn('[微信图片提取-DEBUG] dat 解密失败，无法识别文件头', { filePath, bufferLength: rawBuffer.length })
      return
    }
    console.log('[微信图片提取-DEBUG] dat 解密成功', { filePath, mimeType: decoded.mimeType, dataLength: decoded.dataUrl.length })

    this.dispatchDecodedImage({
      ...decoded,
      createdAt: this.resolveImageCreatedAt(fileStat)
    })

    try {
      await unlink(filePath)
    } catch (error) {
      console.warn('[微信图片提取] 删除 dat 缓存失败:', filePath)
    }
  }

  private async readWithRetry(filePath: string, maxRetry: number, delayMs: number): Promise<Buffer> {
    let lastError: unknown
    for (let attempt = 1; attempt <= maxRetry; attempt += 1) {
      try {
        return await readFile(filePath)
      } catch (error: any) {
        lastError = error
        const code = String(error?.code || '')
        const retriable = code === 'EBUSY' || code === 'EPERM' || code === 'EACCES'
        console.warn('[微信图片提取] 读取 dat 失败，准备重试', { filePath, attempt, code, retriable })
        if (!retriable || attempt >= maxRetry) {
          throw error
        }
        await this.sleep(delayMs)
      }
    }
    throw lastError instanceof Error ? lastError : new Error('读取文件失败')
  }

  /**
   * 微信 dat 解密：先根据文件头推导 XOR key，再对全量字节解密。
   * 全过程只在内存中处理，不落地解密后的明文文件。
   */
  private decodeDatBuffer(buffer: Buffer): { mimeType: string; dataUrl: string } | null {
    const detect = this.detectXorKey(buffer)
    if (!detect) {
      return null
    }
    const output = Buffer.allocUnsafe(buffer.length)
    for (let i = 0; i < buffer.length; i += 1) {
      output[i] = buffer[i] ^ detect.key
    }
    const base64 = output.toString('base64')
    return {
      mimeType: detect.mimeType,
      dataUrl: `data:${detect.mimeType};base64,${base64}`
    }
  }

  private detectXorKey(buffer: Buffer): XorDetectResult | null {
    if (buffer.length < 2) {
      return null
    }
    const candidates = [
      { mimeType: 'image/jpeg', head: [0xff, 0xd8] },
      { mimeType: 'image/png', head: [0x89, 0x50] },
      { mimeType: 'image/gif', head: [0x47, 0x49] }
    ]
    for (const item of candidates) {
      const k0 = buffer[0] ^ item.head[0]
      const k1 = buffer[1] ^ item.head[1]
      if (k0 === k1) {
        return { key: k0, mimeType: item.mimeType }
      }
    }
    return null
  }

  private dispatchDecodedImage(image: DecodedImage): void {
    console.log('[微信图片提取] 分发解密图片', {
      mimeType: image.mimeType,
      createdAt: image.createdAt,
      pendingCount: this.getPendingTaskCount(),
      recentCount: this.unmatchedRecentImages.length
    })
    const matchedTask = this.pickBestTask(image)
    if (matchedTask) {
      this.removePendingTask(this.normalizeSenderBucket(matchedTask.senderId), matchedTask.id)
      clearTimeout(matchedTask.timeoutId)
      console.log('[微信图片提取] 匹配成功并出队', {
        taskId: matchedTask.id,
        senderId: matchedTask.senderId,
        pendingCount: this.getPendingTaskCount()
      })
      matchedTask.resolve(image.dataUrl)
      return
    }

    this.unmatchedRecentImages.push(image)
    console.log('[微信图片提取] 未命中任务，进入 unmatchedRecentImages', {
      recentCount: this.unmatchedRecentImages.length
    })
    this.cleanupRecentImages()
  }

  private pickBestTask(image: DecodedImage): PendingTask | null {
    let best: PendingTask | null = null
    let bestDiff = Number.MAX_SAFE_INTEGER
    for (const senderTasks of this.pendingTasksBySender.values()) {
      for (const task of senderTasks.values()) {
        const diff = Math.abs(task.timestamp - image.createdAt)
        if (diff <= MATCH_TOLERANCE_MS && diff < bestDiff) {
          best = task
          bestDiff = diff
        }
      }
    }
    return best
  }

  private takeBestRecentImage(senderBucket: string, task: PendingTask): DecodedImage | null {
    this.cleanupRecentImages()
    console.log('[微信图片提取] 尝试从 recentImages 匹配联系人分桶任务', {
      senderId: task.senderId,
      senderBucket,
      bucketPendingCount: this.getPendingTaskCount(senderBucket),
      recentCount: this.unmatchedRecentImages.length
    })
    return this.takeBestImageFromList(this.unmatchedRecentImages, task)
  }

  private takeBestImageFromList(images: DecodedImage[], task: PendingTask): DecodedImage | null {
    let bestIndex = -1
    let bestDiff = Number.MAX_SAFE_INTEGER
    for (let i = 0; i < images.length; i += 1) {
      const item = images[i]
      const diff = Math.abs(item.createdAt - task.timestamp)
      if (diff <= MATCH_TOLERANCE_MS && diff < bestDiff) {
        bestDiff = diff
        bestIndex = i
      }
    }
    if (bestIndex < 0) {
      return null
    }
    const [matched] = images.splice(bestIndex, 1)
    return matched || null
  }

  private resolveImageCreatedAt(fileStat: Stats): number {
    const candidates = [fileStat.mtimeMs, fileStat.birthtimeMs, fileStat.ctimeMs]
      .map((value) => Math.trunc(Number(value)))
      .filter((value) => Number.isFinite(value) && value > 0)
    if (candidates.length === 0) {
      return Date.now()
    }
    return Math.max(...candidates)
  }

  private cleanupRecentImages(): void {
    const now = Date.now()
    this.unmatchedRecentImages = this.unmatchedRecentImages.filter((item) => now - item.createdAt <= RECENT_IMAGE_TTL_MS)
  }

  private failAllPending(reason: Error): void {
    for (const senderTasks of this.pendingTasksBySender.values()) {
      for (const task of senderTasks.values()) {
        clearTimeout(task.timeoutId)
        task.reject(reason)
      }
    }
    this.pendingTasksBySender.clear()
  }

  private normalizeSenderBucket(senderId: string): string {
    return String(senderId || '').trim() || '__unknown_sender__'
  }

  private addPendingTask(senderBucket: string, task: PendingTask): void {
    const senderTasks = this.pendingTasksBySender.get(senderBucket) || new Map<string, PendingTask>()
    senderTasks.set(task.id, task)
    this.pendingTasksBySender.set(senderBucket, senderTasks)
  }

  private removePendingTask(senderBucket: string, taskId: string): void {
    const senderTasks = this.pendingTasksBySender.get(senderBucket)
    if (!senderTasks) {
      return
    }
    senderTasks.delete(taskId)
    if (senderTasks.size === 0) {
      this.pendingTasksBySender.delete(senderBucket)
    }
  }

  private getPendingTaskCount(senderBucket?: string): number {
    if (senderBucket) {
      return this.pendingTasksBySender.get(senderBucket)?.size || 0
    }
    let count = 0
    for (const senderTasks of this.pendingTasksBySender.values()) {
      count += senderTasks.size
    }
    return count
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
