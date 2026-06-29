const { app, nativeImage } = require('electron')
const { mkdirSync, writeFileSync } = require('node:fs')
const { resolve } = require('node:path')
const ts = require('typescript')

const defaultOutputDir = resolve(__dirname, '../.tmp-wechat-native-test')
const wechatNativeDir = resolve(__dirname, '../src/main/services/wechat-native')
const compiledModuleCache = new Map()

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms))

const parseArgs = () => {
  const args = process.argv.slice(2)
  const options = {
    channel: 'personal',
    outputDir: defaultOutputDir
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--channel' && args[index + 1]) {
      options.channel = args[index + 1] === 'enterprise' ? 'enterprise' : 'personal'
      index += 1
      continue
    }
    if (arg === '--output-dir' && args[index + 1]) {
      options.outputDir = resolve(args[index + 1])
      index += 1
    }
  }

  return options
}

const loadWechatNativeModule = (modulePath) => {
  const resolvedPath = resolve(modulePath)
  if (compiledModuleCache.has(resolvedPath)) {
    return compiledModuleCache.get(resolvedPath).exports
  }

  const source = require('node:fs').readFileSync(resolvedPath, 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true
    }
  }).outputText
  const module = { exports: {} }
  compiledModuleCache.set(resolvedPath, module)

  const localRequire = (id) => {
    if (id.startsWith('.')) {
      const { existsSync, readFileSync } = require('node:fs')
      const { basename, dirname } = require('node:path')
      const childPath = resolve(dirname(resolvedPath), id)
      const candidates = [
        childPath,
        `${childPath}.ts`,
        `${childPath}.js`,
        resolve(childPath, 'index.ts'),
        resolve(childPath, 'index.js')
      ]
      const matchedPath = candidates.find((candidate) => existsSync(candidate))
      if (!matchedPath) {
        throw new Error(`未找到本地模块：${id}，来源：${basename(resolvedPath)}`)
      }
      return loadWechatNativeModule(matchedPath, readFileSync)
    }
    return require(id)
  }

  const run = new Function('require', 'module', 'exports', compiled)
  run(localRequire, module, module.exports)
  return module.exports
}

const buildTimestamp = () => {
  const now = new Date()
  const pad = (value) => `${value}`.padStart(2, '0')
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate())
  ].join('') + '-' + [
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds())
  ].join('')
}

const saveJson = (path, value) => {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

const buildWindowMeta = (window) => ({
  hwnd: window.hwnd,
  title: window.title,
  className: window.className,
  processName: window.processName,
  x: window.x,
  y: window.y,
  width: window.width,
  height: window.height
})

const buildScreenshotFromCapture = (screenshot) => {
  const image = nativeImage.createFromBuffer(screenshot.png)
  if (image.isEmpty()) {
    throw new Error('微信窗口截图为空，无法识别对话区域')
  }

  const size = image.getSize()
  return {
    ...screenshot,
    bitmap: image.toBitmap(),
    width: size.width,
    height: size.height
  }
}

const saveCaptureFiles = (options, window, screenshot, detection) => {
  mkdirSync(options.outputDir, { recursive: true })
  const timestamp = buildTimestamp()
  const windowPngPath = resolve(options.outputDir, `${timestamp}-wechat-window.png`)
  const regionPngPath = resolve(options.outputDir, `${timestamp}-wechat-chat-region.png`)
  const metaPath = resolve(options.outputDir, `${timestamp}-wechat-chat-region.json`)

  writeFileSync(windowPngPath, screenshot.png)

  const fullImage = nativeImage.createFromBuffer(screenshot.png)
  if (fullImage.isEmpty()) {
    throw new Error('微信窗口截图为空，无法裁剪对话区域')
  }
  const regionImage = fullImage.crop(detection.region)
  if (regionImage.isEmpty()) {
    throw new Error('对话窗口区域裁剪结果为空，请检查区域坐标')
  }
  writeFileSync(regionPngPath, regionImage.toPNG())
  saveJson(metaPath, {
    channel: options.channel,
    createdAt: new Date().toISOString(),
    window: buildWindowMeta(window),
    screenshot: {
      width: screenshot.width,
      height: screenshot.height,
      scaleFactor: screenshot.scaleFactor,
      widthRatioToWindow: screenshot.width / Math.max(1, window.width),
      heightRatioToWindow: screenshot.height / Math.max(1, window.height)
    },
    chatRegion: detection.region,
    detection: {
      source: detection.source,
      confidence: detection.confidence,
      reason: detection.reason,
      splitterX: detection.splitterX,
      inputTopY: detection.inputTopY,
      rightEdgeX: detection.rightEdgeX
    },
    files: {
      windowPngPath,
      regionPngPath
    }
  })

  return { windowPngPath, regionPngPath, metaPath }
}

const main = async () => {
  const options = parseArgs()
  const { findWeChatWindow, focusWindow } = loadWechatNativeModule(resolve(wechatNativeDir, 'windowLocator.ts'))
  const { captureWeChatWindow } = loadWechatNativeModule(resolve(wechatNativeDir, 'screenReader.ts'))
  const { detectCurrentChatSnapshotRegion } = loadWechatNativeModule(resolve(wechatNativeDir, 'chatRegionDetector.ts'))

  console.info('开始截取微信窗口与对话区域', {
    channel: options.channel,
    outputDir: options.outputDir
  })

  const window = await findWeChatWindow(options.channel)
  if (!window) {
    throw new Error('未找到可信的微信窗口，请先打开微信并保持主窗口可见')
  }

  await focusWindow(window.hwnd)
  await sleep(350)

  const refreshedWindow = await findWeChatWindow(options.channel)
  const captureWindow = refreshedWindow?.hwnd === window.hwnd ? refreshedWindow : window
  const screenshot = buildScreenshotFromCapture(await captureWeChatWindow(captureWindow))
  const detection = detectCurrentChatSnapshotRegion(screenshot)
  const files = saveCaptureFiles(options, captureWindow, screenshot, detection)

  console.info('微信截图已保存', {
    windowPngPath: files.windowPngPath,
    regionPngPath: files.regionPngPath,
    metaPath: files.metaPath,
    region: detection.region,
    source: detection.source,
    reason: detection.reason,
    confidence: detection.confidence,
    scaleFactor: screenshot.scaleFactor
  })
}

app.whenReady()
  .then(main)
  .then(() => app.quit())
  .catch((error) => {
    console.error('截取微信对话区域失败', error)
    app.quit()
    process.exitCode = 1
  })
