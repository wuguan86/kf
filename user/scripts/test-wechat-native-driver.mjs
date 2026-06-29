import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const testUserDataPath = resolve(tmpdir(), 'shijie-wechat-native-test')

rmSync(testUserDataPath, { recursive: true, force: true })

function writeRepliedMessageStore(store) {
  mkdirSync(testUserDataPath, { recursive: true })
  writeFileSync(resolve(testUserDataPath, 'wechat-native-replied-messages.json'), `${JSON.stringify(store, null, 2)}\n`, 'utf8')
}

function writeMarketingActionStore(store) {
  mkdirSync(testUserDataPath, { recursive: true })
  writeFileSync(resolve(testUserDataPath, 'wechat-native-marketing-actions.json'), `${JSON.stringify(store, null, 2)}\n`, 'utf8')
}

function clearMarketingActionStore() {
  rmSync(resolve(testUserDataPath, 'wechat-native-marketing-actions.json'), { force: true })
}

function getMarketingDateKey() {
  const now = new Date()
  const month = `${now.getMonth() + 1}`.padStart(2, '0')
  const day = `${now.getDate()}`.padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function buildLegacyMarketingPostFingerprint(author, content, bounds) {
  return createHash('sha256')
    .update([
      String(author || '').trim(),
      String(content || '').replace(/\s+/g, ' ').trim(),
      `${Math.round(bounds.x)}:${Math.round(bounds.y)}:${Math.round(bounds.w)}:${Math.round(bounds.h)}`
    ].join('|'))
    .digest('hex')
    .slice(0, 24)
}

function createDeferred() {
  let resolveValue
  let rejectValue
  const promise = new Promise((resolve, reject) => {
    resolveValue = resolve
    rejectValue = reject
  })
  return { promise, resolve: resolveValue, reject: rejectValue }
}

function paintWechatLayoutRect(bitmap, width, rect, color) {
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      const index = (y * width + x) * 4
      bitmap[index] = color[0]
      bitmap[index + 1] = color[1]
      bitmap[index + 2] = color[2]
      bitmap[index + 3] = 255
    }
  }
}

function createWechatLayoutBitmap(width, height, options = {}) {
  const listWidth = options.listWidth ?? 342
  const inputTop = options.inputTop ?? 574
  const contentRight = options.contentRight ?? width
  const bitmap = Buffer.alloc(width * height * 4, 35)
  paintWechatLayoutRect(bitmap, width, { x: 0, y: 0, width: Math.min(listWidth, contentRight), height }, [236, 236, 236])
  paintWechatLayoutRect(bitmap, width, { x: listWidth, y: 0, width: 2, height }, [210, 210, 210])
  paintWechatLayoutRect(bitmap, width, { x: listWidth + 2, y: 0, width: contentRight - listWidth - 2, height: inputTop }, [248, 248, 248])
  paintWechatLayoutRect(bitmap, width, { x: listWidth + 2, y: inputTop, width: contentRight - listWidth - 2, height: 2 }, [214, 214, 214])
  paintWechatLayoutRect(bitmap, width, { x: listWidth + 2, y: inputTop + 2, width: contentRight - listWidth - 2, height: height - inputTop - 2 }, [250, 250, 250])
  return bitmap
}

function createNativeImageMockFromBitmap(width, height, bitmap) {
  return {
    isEmpty: () => false,
    getSize: () => ({ width, height }),
    toBitmap: () => bitmap,
    crop: (rect) => ({
      isEmpty: () => false,
      getSize: () => ({ width: rect.width, height: rect.height }),
      toPNG: () => Buffer.from(`crop-${rect.x}-${rect.y}-${rect.width}-${rect.height}`)
    })
  }
}

function filterCropRectsByRect(cropRects, expectedRect) {
  return cropRects.filter((item) =>
    item.rect.x === expectedRect.x &&
    item.rect.y === expectedRect.y &&
    item.rect.width === expectedRect.width &&
    item.rect.height === expectedRect.height
  )
}

function loadNativeDriver(mocks = {}) {
  const sourcePath = resolve('src/main/services/wechat-native/WeChatNativeDriver.ts')
  const source = readFileSync(sourcePath, 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true
    }
  }).outputText
  const module = { exports: {} }
  const loadTranspiledTsModule = (relativePath) => {
    const moduleSource = readFileSync(resolve('src/main/services/wechat-native', relativePath), 'utf8')
    const moduleCompiled = ts.transpileModule(moduleSource, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true
      }
    }).outputText
    const childModule = { exports: {} }
    const childRun = new Function('require', 'module', 'exports', moduleCompiled)
    childRun(localRequire, childModule, childModule.exports)
    return childModule.exports
  }
  const localRequire = (id) => {
    if (id === 'electron') {
      return {
        app: { getPath: () => testUserDataPath },
        nativeImage: mocks.nativeImage || {
          createFromPath: () => ({
            isEmpty: () => true,
            toDataURL: () => ''
          }),
          createFromBuffer: () => ({
            isEmpty: () => true
          })
        }
      }
    }
    if (id === './windowLocator') {
      return {
        findWeChatWindow: mocks.findWeChatWindow,
        findWeChatMomentsWindow: mocks.findWeChatMomentsWindow || (async (window) => window),
        focusWindow: mocks.focusWindow || (async () => undefined),
        isPlausibleWeChatWindow: mocks.isPlausibleWeChatWindow || (() => true)
      }
    }
    if (id === './screenReader') {
      return {
        captureWeChatWindow: mocks.captureWeChatWindow,
        getWindowScreenScaleFactor: mocks.getWindowScreenScaleFactor || (() => 1)
      }
    }
    if (id === './snapshotDiff') {
      return {
        comparePngSnapshots: mocks.comparePngSnapshots,
        comparePngSnapshotRegion: mocks.comparePngSnapshotRegion || mocks.comparePngSnapshots
      }
    }
    if (id === './chatRegionDetector') {
      if (mocks.detectCurrentChatSnapshotRegion || mocks.buildFallbackCurrentChatRegion) {
        const actual = loadTranspiledTsModule('chatRegionDetector.ts')
        return {
          ...actual,
          ...(mocks.detectCurrentChatSnapshotRegion ? { detectCurrentChatSnapshotRegion: mocks.detectCurrentChatSnapshotRegion } : {}),
          ...(mocks.buildFallbackCurrentChatRegion ? { buildFallbackCurrentChatRegion: mocks.buildFallbackCurrentChatRegion } : {})
        }
      }
      return loadTranspiledTsModule('chatRegionDetector.ts')
    }
    if (id === './visionDebugRecorder') {
      return {
        configureVisionDebugRecorder: mocks.configureVisionDebugRecorder || (() => ({ enabled: false, outputDir: '' })),
        getVisionDebugRecorderStatus: mocks.getVisionDebugRecorderStatus || (() => ({ enabled: false, outputDir: '' })),
        saveVisionDebugImage: mocks.saveVisionDebugImage || (async () => null)
      }
    }
    if (id === './visionClient') {
      return {
        parseWeChatSnapshotWithVision: mocks.parseWeChatSnapshotWithVision,
        parseWeChatReplyTriggerWithVision: mocks.parseWeChatReplyTriggerWithVision,
        recognizeConversationListItemWithVision: mocks.recognizeConversationListItemWithVision,
        recognizeMarketingMomentsWithVision: mocks.recognizeMarketingMomentsWithVision
      }
    }
    if (id === './messageVisionGuard') {
      return loadTranspiledTsModule('messageVisionGuard.ts')
    }
    if (id === './messageInputPoint') {
      return loadTranspiledTsModule('messageInputPoint.ts')
    }
    if (id === './specialConversationGuard') {
      return loadTranspiledTsModule('specialConversationGuard.ts')
    }
    if (id === './conversationListRecognizer') {
      return { recognizeUnreadConversationCandidate: mocks.recognizeUnreadConversationCandidate || (async () => null) }
    }
    if (id === './inputBackend') {
      return {
        pasteAndSendText: mocks.pasteAndSendText,
        clickConversationCandidate: mocks.clickConversationCandidate,
        exitConversationToList: mocks.exitConversationToList || (async () => true),
        returnFromNestedConversation: mocks.returnFromNestedConversation || (async () => true),
        clickMomentsEntry: mocks.clickMomentsEntry || (async () => true),
        clickMarketingPoint: mocks.clickMarketingPoint || (async () => true),
        closeMomentsWindow: mocks.closeMomentsWindow || (async () => true),
        pasteMarketingComment: mocks.pasteMarketingComment || (async () => true),
        pasteAndSendAttachments: mocks.pasteAndSendAttachments || (async () => true)
      }
    }
    if (id === './unreadDetector') {
      return { findUnreadConversationCandidates: mocks.findUnreadConversationCandidates || (() => []) }
    }
    return require(id)
  }
  const run = new Function('require', 'module', 'exports', compiled)
  run(localRequire, module, module.exports)
  return module.exports
}

function disableStartupBaselineForTest(driver) {
  driver.startupBaselinePending = false
}

const testWindow = {
  hwnd: 100,
  title: '客户A',
  className: 'Weixin',
  processName: 'Weixin',
  x: 0,
  y: 0,
  width: 900,
  height: 700
}

const testEnterpriseWindow = {
  hwnd: 300,
  title: '企业微信',
  className: 'TXGuiFoundation',
  processName: 'WXWork',
  x: 0,
  y: 0,
  width: 1200,
  height: 700
}

const testMomentsWindow = {
  hwnd: 200,
  title: '朋友圈',
  className: 'Qt51514QWindowIcon',
  processName: 'Weixin',
  x: 940,
  y: 70,
  width: 440,
  height: 550
}

function createMarketingMenuNativeImageMock() {
  return {
    createFromBuffer: (buffer) => {
      const marker = buffer.toString()
      const width = marker.includes('narrow-') ? 456 : 900
      const height = marker.includes('narrow-') ? 558 : 700
      const bitmap = Buffer.alloc(width * height * 4, 255)
      if (marker.includes('ellipsis')) {
        for (const centerX of [592, 600, 608]) {
          for (let y = 272; y <= 278; y++) {
            for (let x = centerX - 3; x <= centerX + 3; x++) {
              const offset = (y * width + x) * 4
              bitmap[offset] = 48
              bitmap[offset + 1] = 48
              bitmap[offset + 2] = 48
              bitmap[offset + 3] = 255
            }
          }
        }
      }
      if (marker.includes('two-dot-primary-with-three-dot-fallback')) {
        for (const centerX of [492, 500, 508]) {
          for (let y = 272; y <= 278; y++) {
            for (let x = centerX - 3; x <= centerX + 3; x++) {
              const offset = (y * width + x) * 4
              bitmap[offset] = 42
              bitmap[offset + 1] = 42
              bitmap[offset + 2] = 42
              bitmap[offset + 3] = 255
            }
          }
        }
        for (const centerX of [650, 658]) {
          for (let y = 272; y <= 278; y++) {
            for (let x = centerX - 3; x <= centerX + 3; x++) {
              const offset = (y * width + x) * 4
              bitmap[offset] = 42
              bitmap[offset + 1] = 42
              bitmap[offset + 2] = 42
              bitmap[offset + 3] = 255
            }
          }
        }
      }
      if (marker.includes('article-card-ellipsis')) {
        for (const centerX of [602, 610, 618]) {
          for (let y = 400; y <= 406; y++) {
            for (let x = centerX - 3; x <= centerX + 3; x++) {
              const offset = (y * width + x) * 4
              bitmap[offset] = 42
              bitmap[offset + 1] = 42
              bitmap[offset + 2] = 42
              bitmap[offset + 3] = 255
            }
          }
        }
        for (let y = 448; y <= 480; y++) {
          for (let x = 804; x <= 836; x++) {
            const offset = (y * width + x) * 4
            bitmap[offset] = 226
            bitmap[offset + 1] = 242
            bitmap[offset + 2] = 255
            bitmap[offset + 3] = 255
          }
        }
        for (const centerX of [814, 820, 826]) {
          for (let y = 462; y <= 466; y++) {
            for (let x = centerX - 2; x <= centerX + 2; x++) {
              const offset = (y * width + x) * 4
              bitmap[offset] = 52
              bitmap[offset + 1] = 137
              bitmap[offset + 2] = 219
              bitmap[offset + 3] = 255
            }
          }
        }
      }
      if (marker.includes('menu-open')) {
        for (let y = 252; y <= 298; y++) {
          for (let x = 470; x <= 610; x++) {
            const offset = (y * width + x) * 4
            bitmap[offset] = 48
            bitmap[offset + 1] = 48
            bitmap[offset + 2] = 48
            bitmap[offset + 3] = 255
          }
        }
        for (let y = 270; y <= 280; y++) {
          for (let x = 496; x <= 518; x++) {
            const offset = (y * width + x) * 4
            bitmap[offset] = 245
            bitmap[offset + 1] = 245
            bitmap[offset + 2] = 245
            bitmap[offset + 3] = 255
          }
        }
      }
      if (marker.includes('menu-open-like-local')) {
        for (let y = 252; y <= 298; y++) {
          for (let x = 520; x <= 664; x++) {
            const offset = (y * width + x) * 4
            bitmap[offset] = 48
            bitmap[offset + 1] = 48
            bitmap[offset + 2] = 48
            bitmap[offset + 3] = 255
          }
        }
        for (let y = 270; y <= 280; y++) {
          for (let x = 496; x <= 518; x++) {
            const offset = (y * width + x) * 4
            bitmap[offset] = 245
            bitmap[offset + 1] = 245
            bitmap[offset + 2] = 245
            bitmap[offset + 3] = 255
          }
        }
      }
      if (marker.includes('menu-open-unlike-local')) {
        for (let y = 268; y <= 282; y++) {
          for (let x = 492; x <= 520; x++) {
            const offset = (y * width + x) * 4
            bitmap[offset] = 235
            bitmap[offset + 1] = 72
            bitmap[offset + 2] = 72
            bitmap[offset + 3] = 255
          }
        }
      }
      if (marker.includes('menu-open-comment-local')) {
        for (let y = 252; y <= 298; y++) {
          for (let x = 520; x <= 664; x++) {
            const offset = (y * width + x) * 4
            bitmap[offset] = 48
            bitmap[offset + 1] = 48
            bitmap[offset + 2] = 48
            bitmap[offset + 3] = 255
          }
        }
        for (let y = 270; y <= 282; y++) {
          for (let x = 604; x <= 636; x++) {
            const offset = (y * width + x) * 4
            bitmap[offset] = 245
            bitmap[offset + 1] = 245
            bitmap[offset + 2] = 245
            bitmap[offset + 3] = 255
          }
        }
      }
      if (marker.includes('comment-action-real-mixed')) {
        for (let y = 253; y <= 297; y++) {
          for (let x = 587; x <= 609; x++) {
            const offset = (y * width + x) * 4
            bitmap[offset] = 48
            bitmap[offset + 1] = 48
            bitmap[offset + 2] = 48
            bitmap[offset + 3] = 255
          }
        }
        for (let y = 253; y <= 281; y++) {
          const offset = (y * width + 610) * 4
          bitmap[offset] = 48
          bitmap[offset + 1] = 48
          bitmap[offset + 2] = 48
          bitmap[offset + 3] = 255
        }
      }
      if (marker.includes('menu-open-near-article-button')) {
        for (let y = 444; y <= 486; y++) {
          for (let x = 660; x <= 802; x++) {
            const offset = (y * width + x) * 4
            bitmap[offset] = 48
            bitmap[offset + 1] = 48
            bitmap[offset + 2] = 48
            bitmap[offset + 3] = 255
          }
        }
        for (let y = 458; y <= 468; y++) {
          for (let x = 696; x <= 720; x++) {
            const offset = (y * width + x) * 4
            bitmap[offset] = 245
            bitmap[offset + 1] = 245
            bitmap[offset + 2] = 245
            bitmap[offset + 3] = 255
          }
        }
      }
      if (marker.includes('narrow-article-card-ellipsis')) {
        for (let i = 0; i < bitmap.length; i += 4) {
          bitmap[i] = 248
          bitmap[i + 1] = 248
          bitmap[i + 2] = 248
          bitmap[i + 3] = 255
        }
        for (const centerX of [390, 398, 406]) {
          for (let y = 401; y <= 407; y++) {
            for (let x = centerX - 3; x <= centerX + 3; x++) {
              const offset = (y * width + x) * 4
              bitmap[offset] = 42
              bitmap[offset + 1] = 42
              bitmap[offset + 2] = 42
              bitmap[offset + 3] = 255
            }
          }
        }
        for (let y = 434; y <= 466; y++) {
          for (let x = 414; x <= 448; x++) {
            const offset = (y * width + x) * 4
            bitmap[offset] = 255
            bitmap[offset + 1] = 242
            bitmap[offset + 2] = 226
            bitmap[offset + 3] = 255
          }
        }
        for (const centerX of [424, 433]) {
          for (let y = 448; y <= 452; y++) {
            for (let x = centerX - 2; x <= centerX + 2; x++) {
              const offset = (y * width + x) * 4
              bitmap[offset] = 219
              bitmap[offset + 1] = 137
              bitmap[offset + 2] = 52
              bitmap[offset + 3] = 255
            }
          }
        }
      }
      if (marker.includes('narrow-menu-open-near-button')) {
        for (let y = 430; y <= 472; y++) {
          for (let x = 270; x <= 412; x++) {
            const offset = (y * width + x) * 4
            bitmap[offset] = 48
            bitmap[offset + 1] = 48
            bitmap[offset + 2] = 48
            bitmap[offset + 3] = 255
          }
        }
        for (let y = 444; y <= 456; y++) {
          for (let x = 306; x <= 332; x++) {
            const offset = (y * width + x) * 4
            bitmap[offset] = 245
            bitmap[offset + 1] = 245
            bitmap[offset + 2] = 245
            bitmap[offset + 3] = 255
          }
        }
      }
      return {
        isEmpty: () => false,
        getSize: () => ({ width, height }),
        toBitmap: () => bitmap
      }
    }
  }
}

async function testStopDiscardsInFlightPollMessages() {
  const parseDeferred = createDeferred()
  const { WeChatNativeDriver } = loadNativeDriver({
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => ({ dataUrl: 'data:image/png;base64,current', png: Buffer.from('current'), width: 1, height: 1 }),
    comparePngSnapshots: () => ({ changed: true, digest: 'digest-1', changedRatio: 1 }),
    parseWeChatSnapshotWithVision: async () => parseDeferred.promise,
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  const pollPromise = driver.poll()
  await driver.stop()
  parseDeferred.resolve({
    contact: '客户A',
    messages: [
      { content: '在吗', isSelf: false, uiId: 'customer-1' }
    ],
    snapshotDigest: 'digest-2',
    conversationType: 'SINGLE',
    accountCategory: 'NORMAL'
  })

  const result = await pollPromise
  assert.equal(result.ok, true)
  assert.deepEqual(result.messages, [])
}

async function testSpecialConversationGetsSkippedBeforeClick() {
  const clickedCandidates = []
  const { WeChatNativeDriver } = loadNativeDriver({
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => ({
      dataUrl: 'data:image/png;base64,current',
      png: Buffer.from('same-window'),
      width: 900,
      height: 700
    }),
    comparePngSnapshots: () => ({ changed: false, digest: 'digest-unchanged', changedRatio: 0 }),
    findUnreadConversationCandidates: () => [{
      id: 'unread-special',
      x: 82,
      y: 132,
      width: 14,
      height: 14,
      centerX: 89,
      centerY: 139,
      score: 16
    }],
    recognizeUnreadConversationCandidate: async () => ({
      contact: '文件传输助手',
      conversationType: 'SYSTEM',
      accountCategory: 'FILE_HELPER',
      skipAutoReply: true,
      skipReason: '命中文件传输助手固定过滤规则',
      confidence: 0.99
    }),
    clickConversationCandidate: async (_window, candidate) => {
      clickedCandidates.push(candidate.id)
      return true
    },
    parseWeChatSnapshotWithVision: async () => ({
      contact: '客户A',
      messages: [],
      snapshotDigest: 'digest-1',
      conversationType: 'SINGLE',
      accountCategory: 'NORMAL'
    }),
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  const result = await driver.poll()

  assert.equal(result.ok, true)
  assert.deepEqual(result.messages, [])
  assert.deepEqual(clickedCandidates, [])
}

async function testSpecialConversationNameFallbackSkipsBeforeClick() {
  const clickedCandidates = []
  const { WeChatNativeDriver } = loadNativeDriver({
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => ({
      dataUrl: 'data:image/png;base64=current',
      png: Buffer.from('same-window-special-name'),
      width: 900,
      height: 700
    }),
    comparePngSnapshots: () => ({ changed: false, digest: 'digest-special-name-unchanged', changedRatio: 0 }),
    findUnreadConversationCandidates: () => [{
      id: 'unread-tencent-news',
      x: 82,
      y: 132,
      width: 14,
      height: 14,
      centerX: 89,
      centerY: 139,
      score: 16
    }],
    recognizeUnreadConversationCandidate: async () => ({
      contact: '\u817e\u8baf\u65b0\u95fb',
      conversationType: 'SINGLE',
      accountCategory: 'UNKNOWN',
      skipAutoReply: false,
      skipReason: '',
      confidence: 0.2
    }),
    clickConversationCandidate: async (_window, candidate) => {
      clickedCandidates.push(candidate.id)
      return true
    },
    parseWeChatSnapshotWithVision: async () => ({
      contact: '客户A',
      messages: [],
      snapshotDigest: 'digest-1',
      conversationType: 'SINGLE',
      accountCategory: 'NORMAL'
    }),
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  const result = await driver.poll()

  assert.equal(result.ok, true)
  assert.deepEqual(result.messages, [])
  assert.deepEqual(clickedCandidates, [])
}

async function testCustomerServiceConversationNameFallbackSkipsBeforeClick() {
  const clickedCandidates = []
  const { WeChatNativeDriver } = loadNativeDriver({
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => ({
      dataUrl: 'data:image/png;base64=current',
      png: Buffer.from('same-window-customer-service-name'),
      width: 900,
      height: 700
    }),
    comparePngSnapshots: () => ({ changed: false, digest: 'digest-customer-service-name-unchanged', changedRatio: 0 }),
    findUnreadConversationCandidates: () => [{
      id: 'unread-customer-service',
      x: 82,
      y: 132,
      width: 14,
      height: 14,
      centerX: 89,
      centerY: 139,
      score: 16
    }],
    recognizeUnreadConversationCandidate: async () => ({
      contact: '客服消息',
      conversationType: 'SINGLE',
      accountCategory: 'UNKNOWN',
      skipAutoReply: false,
      skipReason: '',
      confidence: 0.2
    }),
    clickConversationCandidate: async (_window, candidate) => {
      clickedCandidates.push(candidate.id)
      return true
    },
    parseWeChatSnapshotWithVision: async () => ({
      contact: '客户A',
      messages: [],
      snapshotDigest: 'digest-1',
      conversationType: 'SINGLE',
      accountCategory: 'NORMAL'
    }),
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  const result = await driver.poll()

  assert.equal(result.ok, true)
  assert.deepEqual(result.messages, [])
  assert.deepEqual(clickedCandidates, [])
}

async function testActiveReplySessionBlocksSwitchingUnreadConversation() {
  const clickedCandidates = []
  const { WeChatNativeDriver } = loadNativeDriver({
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => ({
      dataUrl: 'data:image/png;base64,current',
      png: Buffer.from('same-window'),
      width: 900,
      height: 700
    }),
    comparePngSnapshots: () => ({ changed: false, digest: 'digest-unchanged', changedRatio: 0 }),
    findUnreadConversationCandidates: () => [{
      id: 'unread-normal',
      x: 82,
      y: 132,
      width: 14,
      height: 14,
      centerX: 89,
      centerY: 139,
      score: 16
    }],
    clickConversationCandidate: async (_window, candidate) => {
      clickedCandidates.push(candidate.id)
      return true
    },
    parseWeChatSnapshotWithVision: async () => ({
      contact: '客户A',
      messages: [],
      snapshotDigest: 'digest-1',
      conversationType: 'SINGLE',
      accountCategory: 'NORMAL'
    }),
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  await driver.command({ action: 'reply_session_started', sessionKey: '客户A' })
  const result = await driver.poll()

  assert.equal(result.ok, true)
  assert.deepEqual(result.messages, [])
  assert.deepEqual(clickedCandidates, [])
}

async function testReplySessionUnlockAllowsSwitchingUnreadConversation() {
  const clickedCandidates = []
  let parseCount = 0
  const { WeChatNativeDriver } = loadNativeDriver({
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => ({
      dataUrl: 'data:image/png;base64,current',
      png: Buffer.from(`same-window-${parseCount}`),
      width: 900,
      height: 700
    }),
    comparePngSnapshots: () => ({ changed: false, digest: `digest-${parseCount}`, changedRatio: 0 }),
    findUnreadConversationCandidates: () => [{
      id: 'unread-normal',
      x: 82,
      y: 132,
      width: 14,
      height: 14,
      centerX: 89,
      centerY: 139,
      score: 16
    }],
    clickConversationCandidate: async (_window, candidate) => {
      clickedCandidates.push(candidate.id)
      return true
    },
    parseWeChatSnapshotWithVision: async () => {
      parseCount += 1
      return {
        contact: '新会话',
        messages: [{ content: '有新消息', isSelf: false, uiId: `customer-${parseCount}` }],
        snapshotDigest: `digest-after-click-${parseCount}`,
        conversationType: 'SINGLE',
        accountCategory: 'NORMAL'
      }
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  await driver.command({ action: 'reply_session_started', sessionKey: '客户A' })
  await driver.command({ action: 'reply_session_finished', sessionKey: '客户A' })
  const result = await driver.poll()

  assert.deepEqual(clickedCandidates, ['unread-normal'])
  assert.equal(result.messages.length, 1)
  assert.equal(result.messages[0].contact, '新会话')
}

async function testUnreadConversationLockedContactOverridesGenericVisionContact() {
  const clickedCandidates = []
  const { WeChatNativeDriver } = loadNativeDriver({
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => ({
      dataUrl: 'data:image/png;base64=current',
      png: Buffer.from('same-window'),
      width: 900,
      height: 700
    }),
    comparePngSnapshots: () => ({ changed: false, digest: 'digest-locked-contact', changedRatio: 0 }),
    findUnreadConversationCandidates: () => [{
      id: 'unread-summer',
      x: 82,
      y: 132,
      width: 14,
      height: 14,
      centerX: 89,
      centerY: 139,
      score: 16
    }],
    recognizeUnreadConversationCandidate: async () => ({
      contact: '夏天',
      conversationType: 'SINGLE',
      accountCategory: 'NORMAL',
      skipAutoReply: false,
      skipReason: '',
      confidence: 0.96
    }),
    clickConversationCandidate: async (_window, candidate) => {
      clickedCandidates.push(candidate.id)
      return true
    },
    parseWeChatSnapshotWithVision: async () => ({
      contact: '微信',
      messages: [{ content: '今天工作还挺顺利的', isSelf: false, uiId: 'customer-locked-contact' }],
      snapshotDigest: 'digest-after-locked-contact',
      conversationType: 'SINGLE',
      accountCategory: 'NORMAL'
    }),
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  const result = await driver.poll()

  assert.deepEqual(clickedCandidates, ['unread-summer'])
  assert.equal(result.messages.length, 1)
  assert.equal(result.messages[0].contact, '夏天')
}

async function testReliableConversationContactSurvivesLockedContactTtl() {
  const originalNow = Date.now
  let fakeNow = 1_700_000_000_000
  Date.now = () => fakeNow
  const clickedCandidates = []
  let parseCount = 0
  const { WeChatNativeDriver } = loadNativeDriver({
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => ({
      dataUrl: `data:image/png;base64,current-${parseCount}`,
      png: Buffer.from(`same-window-${parseCount}`),
      width: 900,
      height: 700
    }),
    comparePngSnapshots: () => ({
      changed: parseCount > 0,
      digest: `digest-reliable-contact-${parseCount}`,
      changedRatio: parseCount > 0 ? 0.12 : 0
    }),
    findUnreadConversationCandidates: () => parseCount === 0
      ? [{
          id: 'unread-summer',
          x: 82,
          y: 132,
          width: 14,
          height: 14,
          centerX: 89,
          centerY: 139,
          score: 16
        }]
      : [],
    recognizeUnreadConversationCandidate: async () => ({
      contact: '夏天',
      conversationType: 'SINGLE',
      accountCategory: 'NORMAL',
      skipAutoReply: false,
      skipReason: '',
      confidence: 0.96
    }),
    clickConversationCandidate: async (_window, candidate) => {
      clickedCandidates.push(candidate.id)
      return true
    },
    parseWeChatSnapshotWithVision: async () => {
      parseCount += 1
      return {
        contact: '微信',
        messages: [{ content: `第 ${parseCount} 条消息`, isSelf: false, uiId: `customer-reliable-contact-${parseCount}` }],
        snapshotDigest: `digest-after-reliable-contact-${parseCount}`,
        conversationType: 'SINGLE',
        accountCategory: 'NORMAL'
      }
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  try {
    await driver.start()
    const firstResult = await driver.poll()
    fakeNow += 31_000
    const secondResult = await driver.poll()

    assert.deepEqual(clickedCandidates, ['unread-summer'])
    assert.equal(firstResult.messages.length, 1)
    assert.equal(firstResult.messages[0].contact, '夏天')
    assert.equal(secondResult.messages.length, 1)
    assert.equal(secondResult.messages[0].contact, '夏天')
  } finally {
    Date.now = originalNow
  }
}

async function testSpecialConversationGetsExitedAfterOpen() {
  const exits = []
  const { WeChatNativeDriver } = loadNativeDriver({
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => ({ dataUrl: 'data:image/png;base64,current', png: Buffer.from('current'), width: 1, height: 1 }),
    comparePngSnapshots: () => ({ changed: true, digest: 'digest-1', changedRatio: 1 }),
    parseWeChatSnapshotWithVision: async () => ({
      contact: '腾讯新闻',
      messages: [],
      snapshotDigest: 'digest-1',
      conversationType: 'SYSTEM',
      accountCategory: 'TENCENT_NEWS',
      skipAutoReply: true,
      skipReason: '命中腾讯新闻固定过滤规则'
    }),
    exitConversationToList: async () => {
      exits.push('exit')
      return true
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  const result = await driver.poll()

  assert.equal(result.ok, true)
  assert.deepEqual(result.messages, [])
  assert.deepEqual(exits, ['exit'])
}

async function testSpecialConversationNameFallbackExitsAfterOpen() {
  const exits = []
  const { WeChatNativeDriver } = loadNativeDriver({
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => ({ dataUrl: 'data:image/png;base64=current', png: Buffer.from('current'), width: 1, height: 1 }),
    comparePngSnapshots: () => ({ changed: true, digest: 'digest-special-name', changedRatio: 1 }),
    parseWeChatSnapshotWithVision: async () => ({
      contact: '\u817e\u8baf\u65b0\u95fb',
      messages: [
        { content: '\u4eca\u65e5\u8981\u95fb', isSelf: false, uiId: 'tencent-news-1' }
      ],
      snapshotDigest: 'digest-special-name-after',
      conversationType: 'SINGLE',
      accountCategory: 'UNKNOWN',
      skipAutoReply: false,
      skipReason: ''
    }),
    exitConversationToList: async () => {
      exits.push('exit')
      return true
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  disableStartupBaselineForTest(driver)
  const result = await driver.poll()

  assert.equal(result.ok, true)
  assert.deepEqual(result.messages, [])
  assert.deepEqual(exits, ['exit'])
}

async function testCustomerServiceConversationNameFallbackExitsAfterOpen() {
  const exits = []
  const nestedReturns = []
  const { WeChatNativeDriver } = loadNativeDriver({
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => ({ dataUrl: 'data:image/png;base64=current', png: Buffer.from('current'), width: 1, height: 1 }),
    comparePngSnapshots: () => ({ changed: true, digest: 'digest-customer-service-name', changedRatio: 1 }),
    parseWeChatSnapshotWithVision: async () => ({
      contact: '客服消息',
      messages: [
        { content: '个人系统开发测试客服: 来了', isSelf: false, uiId: 'customer-service-1' }
      ],
      snapshotDigest: 'digest-customer-service-name-after',
      conversationType: 'SINGLE',
      accountCategory: 'UNKNOWN',
      skipAutoReply: false,
      skipReason: ''
    }),
    exitConversationToList: async () => {
      exits.push('exit')
      return true
    },
    returnFromNestedConversation: async () => {
      nestedReturns.push('return')
      return true
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  disableStartupBaselineForTest(driver)
  const result = await driver.poll()

  assert.equal(result.ok, true)
  assert.deepEqual(result.messages, [])
  assert.deepEqual(exits, [])
  assert.deepEqual(nestedReturns, ['return'])
}

async function testRepeatedCustomerMessageWithChangedUiIdIsNotReportedAgain() {
  let parseCount = 0
  const { WeChatNativeDriver } = loadNativeDriver({
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => ({
      dataUrl: 'data:image/png;base64=current',
      png: Buffer.from(`duplicate-window-${parseCount}`),
      width: 900,
      height: 700
    }),
    comparePngSnapshots: () => ({ changed: true, digest: `digest-duplicate-${parseCount}`, changedRatio: 1 }),
    parseWeChatSnapshotWithVision: async () => {
      parseCount += 1
      return {
        contact: 'duplicate-customer',
        messages: [
          { content: 'same customer text', isSelf: false, uiId: `customer-floating-${parseCount}` }
        ],
        snapshotDigest: `digest-duplicate-after-${parseCount}`,
        conversationType: 'SINGLE',
        accountCategory: 'NORMAL'
      }
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  const firstResult = await driver.poll()
  driver.lastPollAt = 0
  const secondResult = await driver.poll()

  assert.equal(firstResult.messages.length, 1)
  assert.deepEqual(secondResult.messages, [])
}

async function testRepeatedCustomerMessageInSameVisionResultIsReportedOnce() {
  const { WeChatNativeDriver } = loadNativeDriver({
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => ({
      dataUrl: 'data:image/png;base64=same-result-duplicate',
      png: Buffer.from('same-result-duplicate-window'),
      width: 900,
      height: 700
    }),
    comparePngSnapshots: () => ({ changed: true, digest: 'digest-same-result-duplicate', changedRatio: 1 }),
    parseWeChatSnapshotWithVision: async () => ({
      contact: 'same-result-customer',
      messages: [
        { content: 'same customer text', isSelf: false, uiId: 'same-result-1' },
        { content: 'same customer text', isSelf: false, uiId: 'same-result-2' }
      ],
      snapshotDigest: 'digest-same-result-duplicate-after',
      conversationType: 'SINGLE',
      accountCategory: 'NORMAL'
    }),
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  driver.seenMessageFingerprints.add('existing-baseline')
  const result = await driver.poll()

  assert.equal(result.messages.length, 1)
  assert.equal(result.messages[0].content, 'same customer text')
  assert.equal(result.messages[0].trigger_reply, true)
}

async function testCustomerMessageCanTriggerAfterGeometryBecomesReliable() {
  let parseCount = 0
  const { WeChatNativeDriver } = loadNativeDriver({
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => ({
      dataUrl: 'data:image/png;base64=customer-geometry-retry',
      png: Buffer.from(`customer-geometry-retry-window-${parseCount}`),
      width: 900,
      height: 700
    }),
    comparePngSnapshots: () => ({ changed: true, digest: `digest-customer-geometry-retry-${parseCount}`, changedRatio: 1 }),
    parseWeChatSnapshotWithVision: async () => {
      parseCount += 1
      return {
        contact: 'geometry-retry-customer',
        messages: [
          {
            content: '待久了会不舒服',
            isSelf: false,
            uiId: `geometry-retry-${parseCount}`,
            bounds: parseCount === 1 ? undefined : { x: 120, y: 360, w: 118, h: 34 }
          }
        ],
        snapshotDigest: `digest-customer-geometry-retry-after-${parseCount}`,
        conversationType: 'SINGLE',
        accountCategory: 'NORMAL'
      }
    },
    nativeImage: {
      createFromBuffer: () => createNativeImageMockFromBitmap(900, 700, Buffer.alloc(900 * 700 * 4, 255))
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  disableStartupBaselineForTest(driver)
  driver.seenMessageFingerprints.add('existing-baseline')
  const firstResult = await driver.poll()
  driver.lastPollAt = 0
  const secondResult = await driver.poll()

  assert.deepEqual(firstResult.messages, [])
  assert.equal(secondResult.messages.length, 1)
  assert.equal(secondResult.messages[0].content, '待久了会不舒服')
  assert.equal(secondResult.messages[0].trigger_reply, true)
}

async function testOldVisibleCustomerMessageIsNotReportedAgainAfterDedupeWindow() {
  let parseCount = 0
  const { WeChatNativeDriver } = loadNativeDriver({
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => ({
      dataUrl: 'data:image/png;base64=current',
      png: Buffer.from(`old-visible-window-${parseCount}`),
      width: 900,
      height: 700
    }),
    comparePngSnapshots: () => ({ changed: true, digest: `digest-old-visible-${parseCount}`, changedRatio: 1 }),
    parseWeChatSnapshotWithVision: async () => {
      parseCount += 1
      return {
        contact: 'old-visible-customer',
        messages: [
          { content: 'old visible customer text', isSelf: false, uiId: `old-visible-floating-${parseCount}` }
        ],
        snapshotDigest: `digest-old-visible-after-${parseCount}`,
        conversationType: 'SINGLE',
        accountCategory: 'NORMAL'
      }
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  const firstResult = await driver.poll()
  for (const key of driver.recentMessageContentFingerprints.keys()) {
    driver.recentMessageContentFingerprints.set(key, Date.now() - 1)
  }
  driver.lastPollAt = 0
  const secondResult = await driver.poll()

  assert.equal(firstResult.messages.length, 1)
  assert.deepEqual(secondResult.messages, [])
}

async function testRepliedCustomerMessageWithChangedUiIdDoesNotTriggerAfterRestart() {
  let parseCount = 0
  const { WeChatNativeDriver } = loadNativeDriver({
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => ({
      dataUrl: 'data:image/png;base64=replied-restart',
      png: Buffer.from(`replied-restart-window-${parseCount}`),
      width: 900,
      height: 700
    }),
    comparePngSnapshots: () => ({ changed: true, digest: `digest-replied-restart-${parseCount}`, changedRatio: 1 }),
    parseWeChatSnapshotWithVision: async () => {
      parseCount += 1
      return {
        contact: 'replied-restart-customer',
        messages: [
          { content: 'already replied text', isSelf: false, uiId: `replied-floating-${parseCount}` }
        ],
        snapshotDigest: `digest-replied-restart-after-${parseCount}`,
        conversationType: 'SINGLE',
        accountCategory: 'NORMAL'
      }
    },
    pasteAndSendText: async () => true
  })

  const firstDriver = new WeChatNativeDriver()
  await firstDriver.start()
  const firstResult = await firstDriver.poll()

  const secondDriver = new WeChatNativeDriver()
  await secondDriver.start()
  const secondResult = await secondDriver.poll()

  assert.equal(firstResult.messages.length, 1)
  assert.equal(firstResult.messages[0].trigger_reply, true)
  assert.deepEqual(secondResult.messages, [])
}

async function testRepliedTextCustomerMessageDoesNotTriggerAfterShortTtlExpired() {
  let parseCount = 0
  let nowMs = 1_800_002_000_000
  const originalDateNow = Date.now
  const { WeChatNativeDriver } = loadNativeDriver({
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => ({
      dataUrl: 'data:image/png;base64=replied-text-after-ttl',
      png: Buffer.from(`replied-text-after-ttl-window-${parseCount}`),
      width: 900,
      height: 700
    }),
    comparePngSnapshots: () => ({ changed: true, digest: `digest-replied-text-after-ttl-${parseCount}`, changedRatio: 1 }),
    parseWeChatSnapshotWithVision: async () => {
      parseCount += 1
      return {
        contact: 'replied-text-after-ttl-customer',
        messages: [
          { content: 'already replied text after ttl', isSelf: false, uiId: `replied-text-after-ttl-${parseCount}` }
        ],
        snapshotDigest: `digest-replied-text-after-ttl-after-${parseCount}`,
        conversationType: 'SINGLE',
        accountCategory: 'NORMAL'
      }
    },
    pasteAndSendText: async () => true
  })

  try {
    Date.now = () => nowMs
    const firstDriver = new WeChatNativeDriver()
    await firstDriver.start()
    const firstResult = await firstDriver.poll()

    nowMs += 15 * 60 * 1000
    const secondDriver = new WeChatNativeDriver()
    await secondDriver.start()
    const secondResult = await secondDriver.poll()

    assert.equal(firstResult.messages.length, 1)
    assert.equal(firstResult.messages[0].trigger_reply, true)
    assert.deepEqual(secondResult.messages, [])
  } finally {
    Date.now = originalDateNow
  }
}

async function testShortCustomerTextCanTriggerAgainAfterShortTtlWithDifferentBounds() {
  let parseCount = 0
  let nowMs = 1_800_003_000_000
  const originalDateNow = Date.now
  const { WeChatNativeDriver } = loadNativeDriver({
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => ({
      dataUrl: 'data:image/png;base64=short-text-repeat',
      png: Buffer.from(`short-text-repeat-window-${parseCount}`),
      width: 900,
      height: 700
    }),
    comparePngSnapshots: () => ({ changed: true, digest: `digest-short-text-repeat-${parseCount}`, changedRatio: 1 }),
    parseWeChatSnapshotWithVision: async () => {
      parseCount += 1
      return {
        contact: 'short-text-repeat-customer',
        messages: [
          {
            content: '好吧',
            isSelf: false,
            uiId: `short-text-repeat-${parseCount}`,
            bounds: parseCount === 1
              ? { x: 120, y: 160, w: 68, h: 34 }
              : { x: 120, y: 230, w: 68, h: 34 }
          }
        ],
        snapshotDigest: `digest-short-text-repeat-after-${parseCount}`,
        conversationType: 'SINGLE',
        accountCategory: 'NORMAL'
      }
    },
    pasteAndSendText: async () => true
  })

  try {
    Date.now = () => nowMs
    const firstDriver = new WeChatNativeDriver()
    await firstDriver.start()
    const firstResult = await firstDriver.poll()

    nowMs += 2 * 60 * 1000
    const secondDriver = new WeChatNativeDriver()
    await secondDriver.start()
    const secondResult = await secondDriver.poll()

    assert.equal(firstResult.messages.length, 1)
    assert.equal(firstResult.messages[0].trigger_reply, true)
    assert.equal(secondResult.messages.length, 1)
    assert.equal(secondResult.messages[0].trigger_reply, true)
  } finally {
    Date.now = originalDateNow
  }
}

async function testNewNonLatestCustomerMessageIsDisplayedWithoutTriggeringReply() {
  const { WeChatNativeDriver } = loadNativeDriver({
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => ({
      dataUrl: 'data:image/png;base64=non-latest-display',
      png: Buffer.from('non-latest-display-window'),
      width: 900,
      height: 700
    }),
    comparePngSnapshots: () => ({ changed: true, digest: 'digest-non-latest-display', changedRatio: 1 }),
    parseWeChatSnapshotWithVision: async () => ({
      contact: 'non-latest-display-customer',
      messages: [
        {
          content: '好吧',
          isSelf: false,
          uiId: 'non-latest-display-1',
          bounds: { x: 120, y: 160, w: 68, h: 34 }
        },
        {
          content: '那我工作去了',
          isSelf: false,
          uiId: 'non-latest-display-2',
          bounds: { x: 120, y: 220, w: 118, h: 34 }
        }
      ],
      snapshotDigest: 'digest-non-latest-display-after',
      conversationType: 'SINGLE',
      accountCategory: 'NORMAL'
    }),
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  driver.seenMessageFingerprints.add('existing-baseline')
  const result = await driver.poll()

  assert.equal(result.messages.length, 2)
  assert.equal(result.messages[0].content, '好吧')
  assert.equal(result.messages[0].trigger_reply, false)
  assert.equal(result.messages[1].content, '那我工作去了')
  assert.equal(result.messages[1].trigger_reply, true)
}

async function testUnreadSwitchOnlyReportsLatestVisibleCustomerMessage() {
  const clickedCandidates = []
  const { WeChatNativeDriver } = loadNativeDriver({
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => ({
      dataUrl: 'data:image/png;base64=personal-unread-switch-history',
      png: Buffer.from(`personal-unread-switch-history-${clickedCandidates.length}`),
      width: 900,
      height: 700
    }),
    comparePngSnapshots: () => ({ changed: false, digest: 'digest-personal-unread-switch-history', changedRatio: 0 }),
    findUnreadConversationCandidates: () => [{
      id: 'unread-visible-history',
      x: 82,
      y: 132,
      width: 14,
      height: 14,
      centerX: 89,
      centerY: 139,
      score: 16
    }],
    recognizeUnreadConversationCandidate: async () => ({
      contact: '夏天',
      conversationType: 'SINGLE',
      accountCategory: 'NORMAL',
      skipAutoReply: false,
      skipReason: '',
      confidence: 0.98
    }),
    clickConversationCandidate: async (_window, candidate) => {
      clickedCandidates.push(candidate.id)
      return true
    },
    parseWeChatSnapshotWithVision: async () => ({
      contact: '夏天',
      messages: [
        {
          content: '早上好',
          isSelf: false,
          uiId: 'visible-history-morning',
          bounds: { x: 120, y: 180, w: 72, h: 34 }
        },
        {
          content: '中午好',
          isSelf: false,
          uiId: 'visible-history-noon',
          bounds: { x: 120, y: 300, w: 72, h: 34 }
        }
      ],
      snapshotDigest: 'digest-personal-unread-switch-history-after',
      conversationType: 'SINGLE',
      accountCategory: 'NORMAL'
    }),
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  const result = await driver.poll()

  assert.deepEqual(clickedCandidates, ['unread-visible-history'])
  assert.equal(result.messages.length, 1)
  assert.equal(result.messages[0].contact, '夏天')
  assert.equal(result.messages[0].content, '中午好')
  assert.equal(result.messages[0].trigger_reply, true)
}

async function testStartupCurrentChatShortHistoryIsNotReportedWhenNewMessageArrives() {
  let parseCount = 0
  const { WeChatNativeDriver } = loadNativeDriver({
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => ({
      dataUrl: 'data:image/png;base64=startup-current-chat-short-history',
      png: Buffer.from(`startup-current-chat-short-history-${parseCount}`),
      width: 900,
      height: 700
    }),
    comparePngSnapshots: () => ({ changed: true, digest: `digest-startup-current-chat-short-history-${parseCount}`, changedRatio: 1 }),
    parseWeChatSnapshotWithVision: async () => {
      parseCount += 1
      return {
        contact: '夏天',
        messages: parseCount === 1
          ? [
              {
                content: '早上好',
                isSelf: false,
                uiId: 'startup-history-morning',
                bounds: { x: 120, y: 180, w: 72, h: 34 }
              },
              {
                content: '中午好',
                isSelf: true,
                uiId: 'startup-history-noon',
                bounds: { x: 120, y: 300, w: 72, h: 34 }
              },
              {
                content: '睡了没',
                isSelf: true,
                uiId: 'startup-history-sleep',
                bounds: { x: 120, y: 420, w: 72, h: 34 }
              }
            ]
          : parseCount === 2
            ? [
              {
                content: '早上好',
                isSelf: false,
                uiId: 'startup-history-morning-shifted',
                bounds: { x: 120, y: 110, w: 72, h: 34 }
              },
              {
                content: '中午好',
                isSelf: false,
                uiId: 'startup-history-noon-shifted',
                bounds: { x: 120, y: 230, w: 72, h: 34 }
              },
              {
                content: '睡了没',
                isSelf: false,
                uiId: 'startup-history-sleep-shifted',
                bounds: { x: 120, y: 290, w: 72, h: 34 }
              },
              {
                content: '开始上班了',
                isSelf: false,
                uiId: 'startup-new-after-running',
                bounds: { x: 120, y: 350, w: 96, h: 34 }
              }
            ]
            : [
              {
                content: '开始上班了',
                isSelf: false,
                uiId: `startup-new-after-running-visible-${parseCount}`,
                bounds: { x: 120, y: 250, w: 96, h: 34 }
              },
              {
                content: '收到，先喝口水缓缓。',
                isSelf: true,
                uiId: `startup-self-after-running-${parseCount}`,
                bounds: { x: 520, y: 330, w: 180, h: 34 }
              }
            ],
        snapshotDigest: `digest-startup-current-chat-short-history-after-${parseCount}`,
        conversationType: 'SINGLE',
        accountCategory: 'NORMAL'
      }
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  const baselineResult = await driver.poll()
  driver.lastPollAt = 0
  const result = await driver.poll()
  driver.lastPollAt = 0
  const repeatedHistoryResult = await driver.poll()

  assert.deepEqual(baselineResult.messages, [])
  assert.equal(result.messages.length, 1)
  assert.equal(result.messages[0].contact, '夏天')
  assert.equal(result.messages[0].content, '开始上班了')
  assert.equal(result.messages[0].trigger_reply, true)
  assert.deepEqual(repeatedHistoryResult.messages, [])
}

async function testLegacyPersistedContentFingerprintDoesNotSuppressNewCustomerMessage() {
  let parseCount = 0
  writeRepliedMessageStore({
    version: 1,
    fingerprints: [
      'legacy-repeat-customer:customer:repeat text'
    ]
  })
  const { WeChatNativeDriver } = loadNativeDriver({
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => ({
      dataUrl: 'data:image/png;base64=legacy-repeat',
      png: Buffer.from(`legacy-repeat-window-${parseCount}`),
      width: 900,
      height: 700
    }),
    comparePngSnapshots: () => ({ changed: true, digest: `digest-legacy-repeat-${parseCount}`, changedRatio: 1 }),
    parseWeChatSnapshotWithVision: async () => {
      parseCount += 1
      return {
        contact: 'legacy-repeat-customer',
        messages: [
          { content: 'repeat text', isSelf: false, uiId: `legacy-repeat-${parseCount}` }
        ],
        snapshotDigest: `digest-legacy-repeat-after-${parseCount}`,
        conversationType: 'SINGLE',
        accountCategory: 'NORMAL'
      }
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  const result = await driver.poll()

  assert.equal(result.messages.length, 1)
  assert.equal(result.messages[0].trigger_reply, true)
}

async function testLeftListOnlyChangeDoesNotTriggerVisionParsing() {
  let parseCount = 0
  const { WeChatNativeDriver } = loadNativeDriver({
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => ({
      dataUrl: 'data:image/png;base64=list-change',
      png: Buffer.from(`left-list-change-${parseCount}`),
      width: 900,
      height: 700
    }),
    comparePngSnapshots: () => ({ changed: true, digest: 'digest-left-list-change', changedRatio: 0.03 }),
    comparePngSnapshotRegion: () => ({ changed: false, digest: 'digest-chat-region-unchanged', changedRatio: 0 }),
    findUnreadConversationCandidates: () => [],
    parseWeChatSnapshotWithVision: async () => {
      parseCount += 1
      return {
        contact: 'left-list-change-customer',
        messages: [{ content: 'should not parse', isSelf: false, uiId: `left-list-${parseCount}` }],
        snapshotDigest: `digest-left-list-after-${parseCount}`,
        conversationType: 'SINGLE',
        accountCategory: 'NORMAL'
      }
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  const result = await driver.poll()

  assert.equal(parseCount, 0)
  assert.deepEqual(result.messages, [])
}

async function testCurrentChatRegionChangeStillTriggersVisionParsing() {
  let parseCount = 0
  const { WeChatNativeDriver } = loadNativeDriver({
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => ({
      dataUrl: 'data:image/png;base64=minor-change',
      png: Buffer.from(`minor-current-chat-${parseCount}`),
      width: 900,
      height: 700
    }),
    comparePngSnapshots: () => ({ changed: false, digest: `digest-minor-${parseCount}`, changedRatio: 0.004 }),
    comparePngSnapshotRegion: () => ({ changed: true, digest: `digest-chat-region-${parseCount}`, changedRatio: 0.004 }),
    parseWeChatSnapshotWithVision: async () => {
      parseCount += 1
      return {
        contact: 'minor-change-customer',
        messages: [
          { content: 'short new text', isSelf: false, uiId: `minor-customer-${parseCount}` }
        ],
        snapshotDigest: `digest-minor-after-${parseCount}`,
        conversationType: 'SINGLE',
        accountCategory: 'NORMAL'
      }
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  const result = await driver.poll()

  assert.equal(parseCount, 1)
  assert.equal(result.messages.length, 1)
  assert.equal(result.messages[0].content, 'short new text')
}

async function testCurrentChatRegionUsesDynamicLayoutBoundaries() {
  const capturedRegions = []
  const width = 900
  const height = 700
  const layoutBitmap = createWechatLayoutBitmap(width, height, { listWidth: 456, inputTop: 548 })
  const { WeChatNativeDriver } = loadNativeDriver({
    nativeImage: {
      createFromBuffer: () => ({
        isEmpty: () => false,
        getSize: () => ({ width, height }),
        toBitmap: () => layoutBitmap,
        crop: (rect) => ({
          isEmpty: () => false,
          getSize: () => ({ width: rect.width, height: rect.height }),
          toPNG: () => Buffer.from(`dynamic-layout-crop-${rect.x}-${rect.y}-${rect.width}-${rect.height}`)
        })
      }),
      createFromPath: () => ({
        isEmpty: () => true,
        toDataURL: () => ''
      })
    },
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => ({
      dataUrl: 'data:image/png;base64=dynamic-layout',
      png: Buffer.from('dynamic-layout'),
      width,
      height,
      scaleFactor: 1
    }),
    comparePngSnapshots: () => ({ changed: false, digest: 'digest-dynamic-layout', changedRatio: 0.004 }),
    comparePngSnapshotRegion: (_previous, _current, region) => {
      capturedRegions.push(region)
      return { changed: false, digest: 'digest-dynamic-layout-region', changedRatio: 0 }
    },
    findUnreadConversationCandidates: () => [],
    parseWeChatSnapshotWithVision: async () => {
      throw new Error('dynamic layout region test should not request vision parsing')
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  const result = await driver.poll()

  assert.deepEqual(result.messages, [])
  assert.equal(capturedRegions.length, 1)
  assert.ok(capturedRegions[0].x >= 450, `expected dynamic left boundary after wide contact list, got ${capturedRegions[0].x}`)
  assert.ok(capturedRegions[0].y + capturedRegions[0].height <= 548, `expected region to end above raised input box, got ${capturedRegions[0].y + capturedRegions[0].height}`)
}

async function testChatRegionReusesCacheWhenWindowOnlyMoves() {
  const detectedRegions = [
    {
      region: { x: 300, y: 63, width: 500, height: 430 },
      source: 'dynamic',
      confidence: 0.8,
      reason: 'dynamic_region_detected',
      splitterX: 298,
      inputTopY: 501,
      rightEdgeX: 800
    },
    {
      region: { x: 300, y: 63, width: 500, height: 452 },
      source: 'dynamic',
      confidence: 0.8,
      reason: 'dynamic_region_detected',
      splitterX: 298,
      inputTopY: 523,
      rightEdgeX: 800
    }
  ]
  const capturedRegions = []
  const debugMetadata = []
  let captureIndex = 0
  let detectIndex = 0
  let windowLookupIndex = 0
  const { WeChatNativeDriver } = loadNativeDriver({
    nativeImage: {
      createFromBuffer: () => createNativeImageMockFromBitmap(1200, 900, Buffer.alloc(1200 * 900 * 4, 255)),
      createFromPath: () => ({
        isEmpty: () => true,
        toDataURL: () => ''
      })
    },
    findWeChatWindow: async () => {
      const initialWindow = windowLookupIndex < 2
      windowLookupIndex += 1
      return {
        ...testWindow,
        x: initialWindow ? 20 : 180,
        y: initialWindow ? 30 : 260,
        width: 900,
        height: 700
      }
    },
    captureWeChatWindow: async () => ({
      dataUrl: 'data:image/png;base64=window-move',
      png: Buffer.from(`window-move-${captureIndex++}`),
      width: 900,
      height: 700,
      scaleFactor: 1
    }),
    detectCurrentChatSnapshotRegion: () => detectedRegions[Math.min(detectIndex++, detectedRegions.length - 1)],
    comparePngSnapshots: () => ({ changed: false, digest: `digest-window-move-${captureIndex}`, changedRatio: 0 }),
    comparePngSnapshotRegion: (_previous, _current, region) => {
      capturedRegions.push(region)
      return { changed: false, digest: `digest-window-move-region-${captureIndex}`, changedRatio: 0 }
    },
    getVisionDebugRecorderStatus: () => ({ enabled: true, outputDir: testUserDataPath }),
    saveVisionDebugImage: async (payload) => {
      if (payload.stage === 'chat-region') {
        debugMetadata.push(payload.metadata)
      }
      return null
    },
    findUnreadConversationCandidates: () => [],
    parseWeChatSnapshotWithVision: async () => {
      throw new Error('window move cache test should not request vision parsing')
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  await driver.poll()
  driver.lastPollAt = 0
  await driver.poll()

  const latestRegion = capturedRegions.at(-1)
  const latestMetadata = debugMetadata.at(-1)
  assert.deepEqual(latestRegion, detectedRegions[0].region)
  assert.equal(latestMetadata.windowMoved, true)
  assert.equal(latestMetadata.windowResized, false)
  assert.equal(latestMetadata.regionReuseReason, 'window_moved_without_resize')
}

async function testChatRegionRebuildsAfterWindowResize() {
  const detectedRegions = [
    {
      region: { x: 300, y: 63, width: 500, height: 430 },
      source: 'dynamic',
      confidence: 0.8,
      reason: 'dynamic_region_detected',
      splitterX: 298,
      inputTopY: 501,
      rightEdgeX: 800
    },
    {
      region: { x: 340, y: 72, width: 620, height: 480 },
      source: 'dynamic',
      confidence: 0.8,
      reason: 'dynamic_region_detected',
      splitterX: 338,
      inputTopY: 560,
      rightEdgeX: 960
    }
  ]
  const capturedRegions = []
  const debugMetadata = []
  let captureIndex = 0
  let detectIndex = 0
  let windowLookupIndex = 0
  const { WeChatNativeDriver } = loadNativeDriver({
    nativeImage: {
      createFromBuffer: () => createNativeImageMockFromBitmap(1200, 900, Buffer.alloc(1200 * 900 * 4, 255)),
      createFromPath: () => ({
        isEmpty: () => true,
        toDataURL: () => ''
      })
    },
    findWeChatWindow: async () => {
      const initialWindow = windowLookupIndex < 2
      windowLookupIndex += 1
      return {
        ...testWindow,
        width: initialWindow ? 900 : 1040,
        height: initialWindow ? 700 : 780
      }
    },
    captureWeChatWindow: async () => {
      const first = captureIndex === 0
      captureIndex += 1
      return {
        dataUrl: 'data:image/png;base64=window-resize',
        png: Buffer.from(`window-resize-${captureIndex}`),
        width: first ? 900 : 1040,
        height: first ? 700 : 780,
        scaleFactor: 1
      }
    },
    detectCurrentChatSnapshotRegion: () => detectedRegions[Math.min(detectIndex++, detectedRegions.length - 1)],
    comparePngSnapshots: () => ({ changed: false, digest: `digest-window-resize-${captureIndex}`, changedRatio: 0 }),
    comparePngSnapshotRegion: (_previous, _current, region) => {
      capturedRegions.push(region)
      return { changed: false, digest: `digest-window-resize-region-${captureIndex}`, changedRatio: 0 }
    },
    getVisionDebugRecorderStatus: () => ({ enabled: true, outputDir: testUserDataPath }),
    saveVisionDebugImage: async (payload) => {
      if (payload.stage === 'chat-region') {
        debugMetadata.push(payload.metadata)
      }
      return null
    },
    findUnreadConversationCandidates: () => [],
    parseWeChatSnapshotWithVision: async () => {
      throw new Error('window resize cache test should not request vision parsing')
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  await driver.poll()
  driver.lastPollAt = 0
  await driver.poll()

  const latestRegion = capturedRegions.at(-1)
  const latestMetadata = debugMetadata.at(-1)
  assert.deepEqual(latestRegion, detectedRegions[1].region)
  assert.equal(latestMetadata.windowResized, true)
  assert.equal(latestMetadata.regionReuseReason, '')
}

async function testChatRegionRejectsInputTopDownshiftWithoutResize() {
  const detectedRegions = [
    {
      region: { x: 300, y: 63, width: 500, height: 430 },
      source: 'dynamic',
      confidence: 0.8,
      reason: 'dynamic_region_detected',
      splitterX: 298,
      inputTopY: 501,
      rightEdgeX: 800
    },
    {
      region: { x: 300, y: 63, width: 500, height: 482 },
      source: 'dynamic',
      confidence: 0.8,
      reason: 'dynamic_region_detected',
      splitterX: 298,
      inputTopY: 553,
      rightEdgeX: 800
    }
  ]
  const capturedRegions = []
  const debugMetadata = []
  let captureIndex = 0
  let detectIndex = 0
  const { WeChatNativeDriver } = loadNativeDriver({
    nativeImage: {
      createFromBuffer: () => createNativeImageMockFromBitmap(1200, 900, Buffer.alloc(1200 * 900 * 4, 255)),
      createFromPath: () => ({
        isEmpty: () => true,
        toDataURL: () => ''
      })
    },
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => ({
      dataUrl: 'data:image/png;base64=input-downshift',
      png: Buffer.from(`input-downshift-${captureIndex++}`),
      width: 900,
      height: 700,
      scaleFactor: 1
    }),
    detectCurrentChatSnapshotRegion: () => detectedRegions[Math.min(detectIndex++, detectedRegions.length - 1)],
    comparePngSnapshots: () => ({ changed: false, digest: `digest-input-downshift-${captureIndex}`, changedRatio: 0 }),
    comparePngSnapshotRegion: (_previous, _current, region) => {
      capturedRegions.push(region)
      return { changed: false, digest: `digest-input-downshift-region-${captureIndex}`, changedRatio: 0 }
    },
    getVisionDebugRecorderStatus: () => ({ enabled: true, outputDir: testUserDataPath }),
    saveVisionDebugImage: async (payload) => {
      if (payload.stage === 'chat-region') {
        debugMetadata.push(payload.metadata)
      }
      return null
    },
    findUnreadConversationCandidates: () => [],
    parseWeChatSnapshotWithVision: async () => {
      throw new Error('input top downshift cache test should not request vision parsing')
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  await driver.poll()
  driver.lastPollAt = 0
  await driver.poll()

  const latestRegion = capturedRegions.at(-1)
  const latestMetadata = debugMetadata.at(-1)
  assert.deepEqual(latestRegion, detectedRegions[0].region)
  assert.equal(latestMetadata.regionReuseReason, 'input_top_unstable_downshift')
  assert.equal(latestMetadata.previousInputTopY, 501)
  assert.equal(latestMetadata.detectedInputTopY, 553)
}

async function testCurrentChatRegionTrimsDarkPixelsOutsideWechatRightEdge() {
  const capturedRegions = []
  const width = 744
  const height = 728
  const contentRight = 736
  const layoutBitmap = createWechatLayoutBitmap(width, height, { listWidth: 263, inputTop: 615, contentRight })
  const { WeChatNativeDriver } = loadNativeDriver({
    nativeImage: {
      createFromBuffer: () => createNativeImageMockFromBitmap(width, height, layoutBitmap),
      createFromPath: () => ({
        isEmpty: () => true,
        toDataURL: () => ''
      })
    },
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => ({
      dataUrl: 'data:image/png;base64=right-edge-layout',
      png: Buffer.from('right-edge-layout'),
      width,
      height,
      scaleFactor: 1
    }),
    comparePngSnapshots: () => ({ changed: false, digest: 'digest-right-edge-layout', changedRatio: 0.004 }),
    comparePngSnapshotRegion: (_previous, _current, region) => {
      capturedRegions.push(region)
      return { changed: false, digest: 'digest-right-edge-layout-region', changedRatio: 0 }
    },
    findUnreadConversationCandidates: () => [],
    parseWeChatSnapshotWithVision: async () => {
      throw new Error('right edge region test should not request vision parsing')
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  const result = await driver.poll()

  assert.deepEqual(result.messages, [])
  assert.equal(capturedRegions.length, 1)
  assert.ok(capturedRegions[0].x + capturedRegions[0].width <= contentRight, `expected region to exclude dark right edge, got ${capturedRegions[0].x + capturedRegions[0].width}`)
  assert.ok(capturedRegions[0].x + capturedRegions[0].width >= contentRight - 6, `expected region to keep WeChat right border, got ${capturedRegions[0].x + capturedRegions[0].width}`)
}

async function testPersonalChannelEmitsScreenshotCandidateWithoutMainVisionReplyParse() {
  let triggerParseCount = 0
  const { WeChatNativeDriver } = loadNativeDriver({
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => ({
      dataUrl: 'data:image/png;base64=reply-trigger',
      png: Buffer.from('reply-trigger-window'),
      width: 900,
      height: 700
    }),
    comparePngSnapshots: () => ({ changed: true, digest: 'digest-reply-trigger', changedRatio: 1 }),
    parseWeChatSnapshotWithVision: async () => {
      throw new Error('full chat parse should not run for personal screenshot candidates')
    },
    parseWeChatReplyTriggerWithVision: async () => {
      triggerParseCount += 1
      throw new Error('personal reply trigger parse should be handled by backend unified stream')
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  driver.configure({ backendBaseUrl: 'http://127.0.0.1:18080', token: 'token', tenantId: '1', channel: 'personal' })
  await driver.start()
  disableStartupBaselineForTest(driver)
  driver.seenMessageFingerprints.add('existing-baseline')
  const result = await driver.poll()

  assert.equal(triggerParseCount, 0)
  assert.equal(result.messages.length, 1)
  assert.equal(result.messages[0].content, '微信截图已变化，等待后端识别最新客户消息')
  assert.equal(result.messages[0].latest_customer_message, '')
  assert.equal(result.messages[0].image_summary, '')
  assert.equal(result.messages[0].screenshot_data_url, 'data:image/png;base64=reply-trigger')
  assert.equal(result.messages[0].trigger_reply, true)
}

async function testPersonalScreenshotCandidateTriggersForTinyCurrentChatChange() {
  let triggerParseCount = 0
  const { WeChatNativeDriver } = loadNativeDriver({
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => ({
      dataUrl: 'data:image/png;base64=tiny-reply-trigger',
      png: Buffer.from('tiny-reply-trigger-window'),
      width: 900,
      height: 700
    }),
    comparePngSnapshots: () => ({ changed: false, digest: 'digest-tiny-reply-trigger', changedRatio: 0.001 }),
    comparePngSnapshotRegion: () => ({ changed: false, digest: 'digest-tiny-chat-region', changedRatio: 0.001 }),
    findUnreadConversationCandidates: () => [],
    parseWeChatSnapshotWithVision: async () => {
      throw new Error('full chat parse should not run for personal screenshot candidates')
    },
    parseWeChatReplyTriggerWithVision: async () => {
      triggerParseCount += 1
      throw new Error('personal reply trigger parse should be handled by backend unified stream')
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  driver.configure({ backendBaseUrl: 'http://127.0.0.1:18080', token: 'token', tenantId: '1', channel: 'personal' })
  await driver.start()
  disableStartupBaselineForTest(driver)
  driver.seenMessageFingerprints.add('existing-baseline')
  const result = await driver.poll()

  assert.equal(triggerParseCount, 0)
  assert.equal(result.messages.length, 1)
  assert.equal(result.messages[0].screenshot_data_url, 'data:image/png;base64=tiny-reply-trigger')
  assert.equal(result.messages[0].trigger_reply, true)
}

async function testReplyTriggerRecognitionCreatesSingleAutoReplyMessage() {
  let triggerParseCount = 0
  const { WeChatNativeDriver } = loadNativeDriver({
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => ({
      dataUrl: 'data:image/png;base64=reply-trigger',
      png: Buffer.from(`reply-trigger-window-${triggerParseCount}`),
      width: 900,
      height: 700
    }),
    comparePngSnapshots: () => ({ changed: true, digest: 'digest-reply-trigger', changedRatio: 1 }),
    parseWeChatSnapshotWithVision: async () => {
      throw new Error('旧完整聊天解析不应被自动回复轮询调用')
    },
    parseWeChatReplyTriggerWithVision: async () => {
      triggerParseCount += 1
      return {
        hasNewUnrepliedMessage: true,
        contact: '客户A',
        latestCustomerMessage: '这个多少钱',
        imageSummary: '',
        conversationType: 'SINGLE',
        accountCategory: 'NORMAL',
        confidence: 0.92,
        skipReason: ''
      }
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  disableStartupBaselineForTest(driver)
  driver.seenMessageFingerprints.add('existing-baseline')
  const result = await driver.poll()

  assert.equal(triggerParseCount, 1)
  assert.equal(result.messages.length, 1)
  assert.equal(result.messages[0].content, '这个多少钱')
  assert.equal(result.messages[0].latest_customer_message, '这个多少钱')
  assert.equal(result.messages[0].image_summary, '')
  assert.equal(result.messages[0].trigger_reply, true)
}

async function testStartSavesWindowSnapshotWhenVisionDebugCaptureIsEnabled() {
  const savedImages = []
  const { WeChatNativeDriver } = loadNativeDriver({
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => ({
      dataUrl: 'data:image/png;base64=start-window-debug',
      png: Buffer.from('start-window-debug'),
      width: 900,
      height: 700,
      scaleFactor: 1
    }),
    comparePngSnapshots: () => ({ changed: false, digest: 'start-window-debug', changedRatio: 0 }),
    getVisionDebugRecorderStatus: () => ({ enabled: true, outputDir: 'E:\\project\\kf\\tmp\\wechat-vision-debug' }),
    saveVisionDebugImage: async (options) => {
      savedImages.push(options)
      return 'E:\\project\\kf\\tmp\\wechat-vision-debug\\start-window-debug.png'
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  const result = await driver.start()

  assert.equal(result.ok, true)
  assert.equal(savedImages.length, 1)
  assert.equal(savedImages[0].stage, 'window')
  assert.equal(savedImages[0].metadata.reason, 'startup_window')
}

async function testCurrentChatRegionReusesStableRegionForSmallBoundaryJitter() {
  const capturedRegions = []
  const width = 900
  const height = 700
  let pollCount = 0
  const { WeChatNativeDriver } = loadNativeDriver({
    nativeImage: {
      createFromBuffer: () => {
        const options = pollCount === 0
          ? { listWidth: 342, inputTop: 574 }
          : { listWidth: 346, inputTop: 578 }
        return createNativeImageMockFromBitmap(width, height, createWechatLayoutBitmap(width, height, options))
      },
      createFromPath: () => ({
        isEmpty: () => true,
        toDataURL: () => ''
      })
    },
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => ({
      dataUrl: `data:image/png;base64=stable-region-${pollCount}`,
      png: Buffer.from(`stable-region-${pollCount}`),
      width,
      height,
      scaleFactor: 1
    }),
    comparePngSnapshots: () => ({ changed: false, digest: `digest-stable-region-${pollCount}`, changedRatio: 0 }),
    comparePngSnapshotRegion: (_previous, _current, region) => {
      capturedRegions.push({ ...region })
      pollCount += 1
      return { changed: false, digest: `digest-stable-region-crop-${pollCount}`, changedRatio: 0 }
    },
    findUnreadConversationCandidates: () => [],
    parseWeChatSnapshotWithVision: async () => {
      throw new Error('stable chat region test should not request vision parsing')
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  await driver.poll()
  driver.lastPollAt = 0
  await driver.poll()

  assert.equal(capturedRegions.length, 2)
  assert.deepEqual(capturedRegions[1], capturedRegions[0])
}

async function testVisionFailureRetryWaitsForCooldownWhenChatRegionUnchanged() {
  const originalDateNow = Date.now
  let nowMs = 1_800_010_000_000
  let parseCount = 0
  const { WeChatNativeDriver } = loadNativeDriver({
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => ({
      dataUrl: 'data:image/png;base64=retry-cooldown',
      png: Buffer.from(`retry-cooldown-${parseCount}`),
      width: 900,
      height: 700
    }),
    comparePngSnapshots: () => ({
      changed: parseCount === 0,
      digest: `digest-retry-cooldown-${parseCount}`,
      changedRatio: parseCount === 0 ? 1 : 0
    }),
    comparePngSnapshotRegion: () => ({
      changed: parseCount === 0,
      digest: `digest-retry-cooldown-region-${parseCount}`,
      changedRatio: parseCount === 0 ? 1 : 0
    }),
    findUnreadConversationCandidates: () => [],
    parseWeChatSnapshotWithVision: async () => {
      parseCount += 1
      throw new Error('vision backend unavailable')
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  try {
    Date.now = () => nowMs
    await driver.start()
    const firstResult = await driver.poll()
    nowMs += 2_000
    driver.lastPollAt = 0
    const secondResult = await driver.poll()

    assert.deepEqual(firstResult.messages, [])
    assert.deepEqual(secondResult.messages, [])
    assert.equal(parseCount, 1)
  } finally {
    Date.now = originalDateNow
  }
}

async function testNativeSendReturnsSelfMessageForDisplay() {
  const { WeChatNativeDriver } = loadNativeDriver({
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => ({ dataUrl: 'data:image/png;base64,current', png: Buffer.from('current'), width: 1, height: 1 }),
    comparePngSnapshots: () => ({ changed: false, digest: 'digest-1', changedRatio: 0 }),
    parseWeChatSnapshotWithVision: async () => ({ contact: '客户A', messages: [], snapshotDigest: 'digest-1', conversationType: 'SINGLE', accountCategory: 'NORMAL' }),
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  const result = await driver.send({ target: '客户A', content: '稍等，我看一下' })

  assert.equal(result.ok, true)
  assert.equal(result.sentMessage.contact, '客户A')
  assert.equal(result.sentMessage.content, '稍等，我看一下')
  assert.equal(result.sentMessage.is_self, true)
  assert.equal(result.sentMessage.trigger_reply, false)
}

async function testNativeSendRefreshesInputGeometryBeforePasting() {
  const width = 1350
  const height = 1050
  const bitmap = createWechatLayoutBitmap(width, height, { listWidth: 510, inputTop: 900 })
  const sentWindows = []
  const { WeChatNativeDriver } = loadNativeDriver({
    nativeImage: {
      createFromBuffer: () => createNativeImageMockFromBitmap(width, height, bitmap)
    },
    findWeChatWindow: async () => ({ ...testWindow, width: 900, height: 700, scaleFactor: 1 }),
    captureWeChatWindow: async () => ({
      dataUrl: 'data:image/png;base64,current',
      png: Buffer.from('current'),
      width,
      height,
      scaleFactor: 1.5
    }),
    getWindowScreenScaleFactor: () => 1.25,
    comparePngSnapshots: () => ({ changed: false, digest: 'digest-1', changedRatio: 0 }),
    parseWeChatSnapshotWithVision: async () => ({ contact: '客户A', messages: [], snapshotDigest: 'digest-1', conversationType: 'SINGLE', accountCategory: 'NORMAL' }),
    pasteAndSendText: async (window) => {
      sentWindows.push({ ...window })
      return true
    }
  })
  const driver = new WeChatNativeDriver()

  const result = await driver.send({ target: '客户A', content: '稍等，我看一下' })

  assert.equal(result.ok, true)
  assert.equal(sentWindows.length, 1)
  assert.equal(sentWindows[0].scaleFactor, 1.25)
  assert.ok(sentWindows[0].messageInputTopY >= 895)
  assert.ok(sentWindows[0].messageInputTopY <= 905)
}

async function testNativeSendSendsTextThenAttachments() {
  const textCalls = []
  const attachmentCalls = []
  const { WeChatNativeDriver } = loadNativeDriver({
    nativeImage: {
      createFromPath: (localPath) => ({
        isEmpty: () => false,
        toDataURL: () => `data:image/png;base64,${Buffer.from(localPath).toString('base64')}`
      }),
      createFromBuffer: () => ({ isEmpty: () => true })
    },
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => ({ dataUrl: 'data:image/png;base64,current', png: Buffer.from('current'), width: 1, height: 1 }),
    comparePngSnapshots: () => ({ changed: false, digest: 'digest-1', changedRatio: 0 }),
    parseWeChatSnapshotWithVision: async () => ({ contact: '瀹㈡埛A', messages: [], snapshotDigest: 'digest-1', conversationType: 'SINGLE', accountCategory: 'NORMAL' }),
    pasteAndSendText: async (_window, content) => {
      textCalls.push(content)
      return true
    },
    pasteAndSendAttachments: async (_window, attachments) => {
      attachmentCalls.push(attachments)
      return true
    }
  })
  const driver = new WeChatNativeDriver()

  const result = await driver.send({
    target: '瀹㈡埛A',
    content: '可以的，我把产品图发你。',
    attachments: [{ materialId: '31', name: '产品图', fileType: 'IMAGE', localPath: 'C:\\tmp\\product.png' }]
  })

  assert.equal(result.ok, true)
  assert.deepEqual(textCalls, ['可以的，我把产品图发你。'])
  assert.equal(attachmentCalls.length, 1)
  assert.equal(attachmentCalls[0][0].localPath, 'C:\\tmp\\product.png')
  assert.equal(result.sentMessage.content, '可以的，我把产品图发你。')
  assert.equal(result.sentMessage.type, 'image')
  assert.equal(result.sentMessage.image_data_url.startsWith('data:image/png;base64,'), true)
}

async function testNativeSendAttachmentOnlyDoesNotRecordEmptyReply() {
  const textCalls = []
  const attachmentCalls = []
  const { WeChatNativeDriver } = loadNativeDriver({
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => ({ dataUrl: 'data:image/png;base64,current', png: Buffer.from('current'), width: 1, height: 1 }),
    comparePngSnapshots: () => ({ changed: false, digest: 'digest-1', changedRatio: 0 }),
    parseWeChatSnapshotWithVision: async () => ({ contact: '客户A', messages: [], snapshotDigest: 'digest-1', conversationType: 'SINGLE', accountCategory: 'NORMAL' }),
    pasteAndSendText: async (_window, content) => {
      textCalls.push(content)
      return true
    },
    pasteAndSendAttachments: async (_window, attachments) => {
      attachmentCalls.push(attachments)
      return true
    }
  })
  const driver = new WeChatNativeDriver()

  const result = await driver.send({
    target: '客户A',
    content: '',
    attachments: [{ materialId: '32', name: '产品图', fileType: 'IMAGE', localPath: 'C:\\tmp\\product.png' }]
  })

  assert.equal(result.ok, true)
  assert.deepEqual(textCalls, [])
  assert.equal(attachmentCalls.length, 1)
  assert.ok(result.sentMessage.content.length > 0)
  assert.equal(driver.recentSentSelfReplyContents.size, 0)
}

async function testImageMessageCanBeCroppedFromLatestSnapshot() {
  const cropRects = []
  const { WeChatNativeDriver } = loadNativeDriver({
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => ({
      dataUrl: 'data:image/png;base64=image-window',
      png: Buffer.from('image-window'),
      width: 900,
      height: 700
    }),
    comparePngSnapshots: () => ({ changed: true, digest: 'digest-image-window', changedRatio: 1 }),
    parseWeChatSnapshotWithVision: async () => ({
      contact: 'image-customer',
      messages: [
        {
          content: '[图片]',
          isSelf: false,
          uiId: 'image-message-1',
          type: 'image',
          bounds: { x: 120, y: 220, w: 180, h: 120 }
        }
      ],
      snapshotDigest: 'digest-image-window-after',
      conversationType: 'SINGLE',
      accountCategory: 'NORMAL'
    }),
    nativeImage: {
      createFromBuffer: (buffer) => ({
        isEmpty: () => false,
        getSize: () => ({ width: 900, height: 700 }),
        crop: (rect) => {
          cropRects.push({ buffer: buffer.toString('utf8'), rect })
          return {
            isEmpty: () => false,
            getSize: () => ({ width: rect.width, height: rect.height }),
            toDataURL: () => `data:image/png;base64,cropped-${rect.x}-${rect.y}-${rect.width}-${rect.height}`
          }
        }
      })
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  const pollResult = await driver.poll()
  const imageResult = await driver.copyImageMessage({ messageUiId: 'image-message-1' })

  assert.equal(pollResult.messages.length, 1)
  assert.equal(pollResult.messages[0].type, 'image')
  assert.equal(imageResult.ok, true)
  assert.equal(imageResult.dataUrl, 'data:image/png;base64,cropped-114-214-192-132')
  assert.deepEqual(filterCropRectsByRect(cropRects, { x: 114, y: 214, width: 192, height: 132 }), [
    {
      buffer: 'image-window',
      rect: { x: 114, y: 214, width: 192, height: 132 }
    }
  ])
}

async function testSmallAvatarMisreadAsImageMessageIsIgnored() {
  let parseCount = 0
  const { WeChatNativeDriver } = loadNativeDriver({
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => ({
      dataUrl: 'data:image/png;base64=avatar-misread-window',
      png: Buffer.from(`avatar-misread-window-${parseCount}`),
      width: 900,
      height: 700
    }),
    comparePngSnapshots: () => ({ changed: true, digest: `digest-avatar-misread-window-${parseCount}`, changedRatio: 1 }),
    parseWeChatSnapshotWithVision: async () => {
      parseCount += 1
      return {
        contact: 'avatar-misread-customer',
        messages: parseCount === 1
          ? [
              {
                content: '上一条己方消息',
                isSelf: true,
                uiId: 'avatar-misread-self-baseline',
                type: 'text'
              }
            ]
          : [
              {
                content: '[图片]',
                isSelf: false,
                uiId: 'avatar-misread-image',
                type: 'image',
                bounds: { x: 320, y: 230, w: 42, h: 42 }
              },
              {
                content: '这就别想了，但是可以买',
                isSelf: false,
                uiId: 'avatar-misread-text',
                type: 'text'
              }
            ],
        snapshotDigest: `digest-avatar-misread-window-after-${parseCount}`,
        conversationType: 'SINGLE',
        accountCategory: 'NORMAL'
      }
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  await driver.poll()
  driver.lastPollAt = 0
  const result = await driver.poll()

  assert.equal(result.messages.length, 1)
  assert.equal(result.messages[0].content, '这就别想了，但是可以买')
  assert.equal(result.messages[0].type, 'text')
  assert.equal(result.messages[0].trigger_reply, true)
}

function createBitmap(width, height, fill, regions = []) {
  const bitmap = Buffer.alloc(width * height * 4)
  const paintPixel = (x, y, color) => {
    const index = (y * width + x) * 4
    bitmap[index] = color.blue
    bitmap[index + 1] = color.green
    bitmap[index + 2] = color.red
    bitmap[index + 3] = 255
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      paintPixel(x, y, fill)
    }
  }
  for (const region of regions) {
    for (let y = region.y; y < region.y + region.height; y += 1) {
      for (let x = region.x; x < region.x + region.width; x += 1) {
        paintPixel(x, y, region.color)
      }
    }
  }
  return bitmap
}

async function testRightGreenBubbleMisreadAsCustomerIsCorrectedByCv() {
  let parseCount = 0
  const bitmap = createBitmap(
    900,
    700,
    { red: 242, green: 242, blue: 242 },
    [
      { x: 560, y: 220, width: 210, height: 82, color: { red: 149, green: 236, blue: 105 } }
    ]
  )
  const { WeChatNativeDriver } = loadNativeDriver({
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => ({
      dataUrl: 'data:image/png;base64=right-green-misread-window',
      png: Buffer.from(`right-green-misread-window-${parseCount}`),
      width: 900,
      height: 700
    }),
    comparePngSnapshots: () => ({ changed: true, digest: `digest-right-green-misread-${parseCount}`, changedRatio: 1 }),
    parseWeChatSnapshotWithVision: async () => {
      parseCount += 1
      return {
        contact: 'right-green-customer',
        messages: parseCount === 1
          ? [
              {
                content: '上一条客户消息',
                isSelf: false,
                uiId: 'right-green-baseline',
                type: 'text',
                bounds: { x: 318, y: 140, w: 160, h: 48 }
              }
            ]
          : [
              {
                content: '这是右侧自己的自动回复',
                isSelf: false,
                uiId: 'right-green-misread',
                type: 'text',
                bounds: { x: 560, y: 220, w: 210, h: 82 }
              }
            ],
        snapshotDigest: `digest-right-green-misread-after-${parseCount}`,
        conversationType: 'SINGLE',
        accountCategory: 'NORMAL'
      }
    },
    nativeImage: {
      createFromBuffer: () => createNativeImageMockFromBitmap(900, 700, bitmap)
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  await driver.poll()
  driver.lastPollAt = 0
  const result = await driver.poll()

  assert.equal(result.ok, true)
  assert.deepEqual(result.messages, [])
}

async function testLeftCustomerTextNearWindowCenterIsNotCorrectedAsSelf() {
  let parseCount = 0
  const bitmap = createBitmap(
    865,
    743,
    { red: 242, green: 242, blue: 242 },
    [
      { x: 430, y: 575, width: 230, height: 36, color: { red: 255, green: 255, blue: 255 } }
    ]
  )
  const { WeChatNativeDriver } = loadNativeDriver({
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => ({
      dataUrl: 'data:image/png;base64=left-customer-near-center',
      png: Buffer.from(`left-customer-near-center-${parseCount}`),
      width: 865,
      height: 743,
      scaleFactor: 1
    }),
    comparePngSnapshots: () => ({ changed: true, digest: `digest-left-customer-near-center-${parseCount}`, changedRatio: 1 }),
    parseWeChatSnapshotWithVision: async () => {
      parseCount += 1
      return {
        contact: '夏天',
        messages: parseCount === 1
          ? [
              {
                content: '下午好',
                isSelf: false,
                uiId: 'left-customer-baseline',
                type: 'text',
                bounds: { x: 430, y: 475, w: 120, h: 36 }
              }
            ]
          : [
              {
                content: '我都工作三小时了，哈哈',
                isSelf: false,
                uiId: 'left-customer-near-center',
                type: 'text',
                bounds: { x: 430, y: 575, w: 230, h: 36 }
              }
            ],
        snapshotDigest: `digest-left-customer-near-center-after-${parseCount}`,
        conversationType: 'SINGLE',
        accountCategory: 'NORMAL'
      }
    },
    nativeImage: {
      createFromBuffer: () => createNativeImageMockFromBitmap(865, 743, bitmap)
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  await driver.poll()
  driver.lastPollAt = 0
  const result = await driver.poll()

  assert.equal(result.ok, true)
  assert.equal(result.messages.length, 1)
  assert.equal(result.messages[0].content, '我都工作三小时了，哈哈')
  assert.equal(result.messages[0].is_self, false)
  assert.equal(result.messages[0].trigger_reply, true)
}

async function testNarrowWindowLeftCustomerImageNearCenterIsNotCorrectedAsSelf() {
  let parseCount = 0
  const bitmap = createBitmap(
    590,
    610,
    { red: 242, green: 242, blue: 242 },
    [
      { x: 375, y: 350, width: 80, height: 80, color: { red: 132, green: 142, blue: 210 } }
    ]
  )
  const { WeChatNativeDriver } = loadNativeDriver({
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => ({
      dataUrl: 'data:image/png;base64=narrow-left-customer-image',
      png: Buffer.from(`narrow-left-customer-image-${parseCount}`),
      width: 590,
      height: 610,
      scaleFactor: 1
    }),
    comparePngSnapshots: () => ({ changed: true, digest: `digest-narrow-left-customer-image-${parseCount}`, changedRatio: 1 }),
    parseWeChatSnapshotWithVision: async () => {
      parseCount += 1
      return {
        contact: '夏天',
        messages: parseCount === 1
          ? [
              {
                content: '启动基线',
                isSelf: false,
                uiId: 'narrow-left-image-baseline',
                type: 'text',
                bounds: { x: 375, y: 240, w: 80, h: 36 }
              }
            ]
          : [
              {
                content: '[图片]',
                isSelf: false,
                uiId: 'narrow-left-customer-image',
                type: 'image',
                bounds: { x: 375, y: 350, w: 80, h: 80 }
              }
            ],
        snapshotDigest: `digest-narrow-left-customer-image-after-${parseCount}`,
        conversationType: 'SINGLE',
        accountCategory: 'NORMAL'
      }
    },
    nativeImage: {
      createFromBuffer: () => createNativeImageMockFromBitmap(590, 610, bitmap)
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  await driver.poll()
  driver.lastPollAt = 0
  const result = await driver.poll()

  assert.equal(result.ok, true)
  assert.equal(result.messages.length, 1)
  assert.equal(result.messages[0].type, 'image')
  assert.equal(result.messages[0].is_self, false)
  assert.equal(result.messages[0].trigger_reply, true)
}

async function testStartupVisibleHistoryIsOnlyUsedAsBaselineWithPixelGuard() {
  const bitmap = createBitmap(
    900,
    700,
    { red: 242, green: 242, blue: 242 },
    [
      { x: 320, y: 180, width: 160, height: 48, color: { red: 255, green: 255, blue: 255 } },
      { x: 560, y: 260, width: 190, height: 60, color: { red: 149, green: 236, blue: 105 } }
    ]
  )
  const { WeChatNativeDriver } = loadNativeDriver({
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => ({
      dataUrl: 'data:image/png;base64=startup-history-window',
      png: Buffer.from('startup-history-window'),
      width: 900,
      height: 700
    }),
    comparePngSnapshots: () => ({ changed: true, digest: 'digest-startup-history', changedRatio: 1 }),
    parseWeChatSnapshotWithVision: async () => ({
      contact: 'startup-history-customer',
      messages: [
        {
          content: 'old customer text',
          isSelf: false,
          uiId: 'startup-old-customer',
          type: 'text',
          bounds: { x: 320, y: 180, w: 160, h: 48 }
        },
        {
          content: 'old self reply',
          isSelf: true,
          uiId: 'startup-old-self',
          type: 'text',
          bounds: { x: 560, y: 260, w: 190, h: 60 }
        }
      ],
      snapshotDigest: 'digest-startup-history-after',
      conversationType: 'SINGLE',
      accountCategory: 'NORMAL'
    }),
    nativeImage: {
      createFromBuffer: () => createNativeImageMockFromBitmap(900, 700, bitmap)
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  const result = await driver.poll()

  assert.equal(result.ok, true)
  assert.deepEqual(result.messages, [])
}

async function testEnterpriseStartupVisibleHistoryIsOnlyUsedAsBaselineWithoutPixelGuard() {
  const { WeChatNativeDriver } = loadNativeDriver({
    findWeChatWindow: async () => testEnterpriseWindow,
    captureWeChatWindow: async () => ({
      dataUrl: 'data:image/png;base64=enterprise-startup-history-window',
      png: Buffer.from('enterprise-startup-history-window'),
      width: 1200,
      height: 700
    }),
    comparePngSnapshots: () => ({ changed: true, digest: 'digest-enterprise-startup-history', changedRatio: 1 }),
    parseWeChatSnapshotWithVision: async () => ({
      contact: 'enterprise-startup-customer',
      messages: [
        {
          content: 'old enterprise customer text',
          isSelf: false,
          uiId: 'enterprise-startup-old-customer',
          type: 'text',
          bounds: { x: 320, y: 180, w: 160, h: 48 }
        }
      ],
      snapshotDigest: 'digest-enterprise-startup-history-after',
      conversationType: 'SINGLE',
      accountCategory: 'NORMAL'
    }),
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  driver.configure({ channel: 'enterprise' })
  await driver.start()
  const result = await driver.poll()

  assert.equal(result.ok, true)
  assert.deepEqual(result.messages, [])
}

async function testEnterpriseStartupUnreadCandidateIsIgnored() {
  const clickedCandidates = []
  let compareCount = 0
  const { WeChatNativeDriver } = loadNativeDriver({
    findWeChatWindow: async () => testEnterpriseWindow,
    captureWeChatWindow: async () => ({
      dataUrl: 'data:image/png;base64=enterprise-unread-window',
      png: Buffer.from('enterprise-unread-window'),
      width: 1200,
      height: 700
    }),
    comparePngSnapshots: () => {
      compareCount += 1
      return compareCount === 1
        ? { changed: false, digest: 'digest-enterprise-unread-before-click', changedRatio: 0 }
        : { changed: true, digest: 'digest-enterprise-unread-after-click', changedRatio: 1 }
    },
    findUnreadConversationCandidates: () => [{
      id: 'unread-enterprise-startup',
      x: 68,
      y: 365,
      width: 12,
      height: 12,
      centerX: 74,
      centerY: 371,
      score: 18
    }],
    recognizeUnreadConversationCandidate: async () => ({
      contact: 'enterprise-startup-unread-customer',
      conversationType: 'SINGLE',
      accountCategory: 'NORMAL',
      skipAutoReply: false,
      skipReason: '',
      confidence: 0.99
    }),
    clickConversationCandidate: async (_window, candidate) => {
      clickedCandidates.push(candidate.id)
      return true
    },
    parseWeChatSnapshotWithVision: async () => ({
      contact: 'enterprise-startup-unread-customer',
      messages: [
        {
          content: 'old unread enterprise text',
          isSelf: false,
          uiId: 'enterprise-old-unread',
          type: 'text',
          bounds: { x: 320, y: 220, w: 190, h: 48 }
        }
      ],
      snapshotDigest: 'digest-enterprise-unread-after',
      conversationType: 'SINGLE',
      accountCategory: 'NORMAL'
    }),
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  driver.configure({ channel: 'enterprise' })
  await driver.start()
  const result = await driver.poll()

  assert.equal(result.ok, true)
  assert.deepEqual(result.messages, [])
  assert.deepEqual(clickedCandidates, [])
}

async function testEnterpriseUnboundedCustomerTextDoesNotTriggerWithoutPixelGuard() {
  let parseCount = 0
  const { WeChatNativeDriver } = loadNativeDriver({
    findWeChatWindow: async () => testEnterpriseWindow,
    captureWeChatWindow: async () => ({
      dataUrl: 'data:image/png;base64=enterprise-unbounded-window',
      png: Buffer.from(`enterprise-unbounded-window-${parseCount}`),
      width: 1200,
      height: 700
    }),
    comparePngSnapshots: () => ({ changed: true, digest: `digest-enterprise-unbounded-${parseCount}`, changedRatio: 1 }),
    parseWeChatSnapshotWithVision: async () => {
      parseCount += 1
      return {
        contact: 'enterprise-unbounded-customer',
        messages: parseCount === 1
          ? [
              {
                content: 'enterprise baseline text',
                isSelf: false,
                uiId: 'enterprise-unbounded-baseline',
                type: 'text',
                bounds: { x: 320, y: 150, w: 160, h: 48 }
              }
            ]
          : [
              {
                content: 'enterprise hallucinated customer text',
                isSelf: false,
                uiId: 'enterprise-unbounded-customer',
                type: 'text'
              }
            ],
        snapshotDigest: `digest-enterprise-unbounded-after-${parseCount}`,
        conversationType: 'SINGLE',
        accountCategory: 'NORMAL'
      }
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  driver.configure({ channel: 'enterprise' })
  await driver.start()
  await driver.poll()
  driver.lastPollAt = 0
  const result = await driver.poll()

  assert.equal(result.ok, true)
  assert.deepEqual(result.messages, [])
}

async function testUnboundedCustomerTextDoesNotTriggerWhenPixelGuardIsAvailable() {
  let parseCount = 0
  const bitmap = createBitmap(
    900,
    700,
    { red: 242, green: 242, blue: 242 },
    [
      { x: 560, y: 160, width: 180, height: 48, color: { red: 149, green: 236, blue: 105 } }
    ]
  )
  const { WeChatNativeDriver } = loadNativeDriver({
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => ({
      dataUrl: 'data:image/png;base64=unbounded-customer-text-window',
      png: Buffer.from(`unbounded-customer-text-window-${parseCount}`),
      width: 900,
      height: 700
    }),
    comparePngSnapshots: () => ({ changed: true, digest: `digest-unbounded-customer-text-${parseCount}`, changedRatio: 1 }),
    parseWeChatSnapshotWithVision: async () => {
      parseCount += 1
      return {
        contact: 'unbounded-customer-text-customer',
        messages: parseCount === 1
          ? [
              {
                content: 'self baseline text',
                isSelf: true,
                uiId: 'unbounded-self-baseline',
                type: 'text',
                bounds: { x: 560, y: 160, w: 180, h: 48 }
              }
            ]
          : [
              {
                content: 'unbounded customer text',
                isSelf: false,
                uiId: 'unbounded-customer-text',
                type: 'text'
              }
            ],
        snapshotDigest: `digest-unbounded-customer-text-after-${parseCount}`,
        conversationType: 'SINGLE',
        accountCategory: 'NORMAL'
      }
    },
    nativeImage: {
      createFromBuffer: () => createNativeImageMockFromBitmap(900, 700, bitmap)
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  await driver.poll()
  driver.lastPollAt = 0
  const result = await driver.poll()

  assert.equal(result.ok, true)
  assert.deepEqual(result.messages, [])
}

async function testBlankLargeImageHallucinationIsIgnored() {
  let parseCount = 0
  const bitmap = createBitmap(
    900,
    700,
    { red: 242, green: 242, blue: 242 },
    [
      { x: 315, y: 225, width: 130, height: 96, color: { red: 248, green: 248, blue: 248 } }
    ]
  )
  const { WeChatNativeDriver } = loadNativeDriver({
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => ({
      dataUrl: 'data:image/png;base64=blank-image-hallucination-window',
      png: Buffer.from(`blank-image-hallucination-window-${parseCount}`),
      width: 900,
      height: 700
    }),
    comparePngSnapshots: () => ({ changed: true, digest: `digest-blank-image-hallucination-${parseCount}`, changedRatio: 1 }),
    parseWeChatSnapshotWithVision: async () => {
      parseCount += 1
      return {
        contact: 'blank-image-hallucination-customer',
        messages: parseCount === 1
          ? [
              {
                content: '上一条己方消息',
                isSelf: true,
                uiId: 'blank-image-self-baseline',
                type: 'text',
                bounds: { x: 560, y: 150, w: 160, h: 48 }
              }
            ]
          : [
              {
                content: '[图片]',
                isSelf: false,
                uiId: 'blank-image-hallucination',
                type: 'image',
                bounds: { x: 315, y: 225, w: 130, h: 96 }
              },
              {
                content: '这就别想了，但是可以买',
                isSelf: false,
                uiId: 'blank-image-real-text',
                type: 'text',
                bounds: { x: 365, y: 370, w: 220, h: 45 }
              }
            ],
        snapshotDigest: `digest-blank-image-hallucination-after-${parseCount}`,
        conversationType: 'SINGLE',
        accountCategory: 'NORMAL'
      }
    },
    nativeImage: {
      createFromBuffer: () => createNativeImageMockFromBitmap(900, 700, bitmap)
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  await driver.poll()
  driver.lastPollAt = 0
  const result = await driver.poll()

  assert.equal(result.messages.length, 1)
  assert.equal(result.messages[0].content, '这就别想了，但是可以买')
  assert.equal(result.messages[0].type, 'text')
  assert.equal(result.messages[0].trigger_reply, true)
}

async function testOversizedImageBoundsAreTightenedBeforeCrop() {
  const cropRects = []
  const bitmap = createBitmap(
    900,
    700,
    { red: 242, green: 242, blue: 242 },
    [
      { x: 126, y: 226, width: 180, height: 120, color: { red: 60, green: 130, blue: 190 } },
      { x: 120, y: 390, width: 500, height: 210, color: { red: 255, green: 255, blue: 255 } },
      { x: 120, y: 620, width: 500, height: 20, color: { red: 15, green: 15, blue: 15 } }
    ]
  )
  const { WeChatNativeDriver } = loadNativeDriver({
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => ({
      dataUrl: 'data:image/png;base64=oversized-image-window',
      png: Buffer.from('oversized-image-window'),
      width: 900,
      height: 700
    }),
    comparePngSnapshots: () => ({ changed: true, digest: 'digest-oversized-image-window', changedRatio: 1 }),
    parseWeChatSnapshotWithVision: async () => ({
      contact: 'dark-image-customer',
      messages: [
        {
          content: '[image]',
          isSelf: false,
          uiId: 'oversized-image-message',
          type: 'image',
          bounds: { x: 120, y: 220, w: 500, h: 430 }
        }
      ],
      snapshotDigest: 'digest-oversized-image-window-after',
      conversationType: 'SINGLE',
      accountCategory: 'NORMAL'
    }),
    nativeImage: {
      createFromBuffer: (buffer) => ({
        isEmpty: () => false,
        getSize: () => ({ width: 900, height: 700 }),
        toBitmap: () => bitmap,
        crop: (rect) => {
          cropRects.push({ buffer: buffer.toString('utf8'), rect })
          return {
            isEmpty: () => false,
            getSize: () => ({ width: rect.width, height: rect.height }),
            toDataURL: () => `data:image/png;base64=cropped-${rect.x}-${rect.y}-${rect.width}-${rect.height}`
          }
        }
      })
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  disableStartupBaselineForTest(driver)
  await driver.poll()
  const imageResult = await driver.copyImageMessage({ messageUiId: 'oversized-image-message' })

  assert.equal(imageResult.ok, true)
  assert.equal(imageResult.dataUrl, 'data:image/png;base64=cropped-120-220-192-132')
  assert.deepEqual(filterCropRectsByRect(cropRects, { x: 120, y: 220, width: 192, height: 132 }), [
    {
      buffer: 'oversized-image-window',
      rect: { x: 120, y: 220, width: 192, height: 132 }
    }
  ])
}

async function testDarkImageContentIsKeptWhenTighteningCrop() {
  const cropRects = []
  const bitmap = createBitmap(
    900,
    700,
    { red: 242, green: 242, blue: 242 },
    [
      { x: 126, y: 226, width: 180, height: 35, color: { red: 8, green: 8, blue: 8 } },
      { x: 126, y: 261, width: 180, height: 50, color: { red: 70, green: 135, blue: 190 } },
      { x: 126, y: 311, width: 180, height: 35, color: { red: 10, green: 10, blue: 10 } },
      { x: 120, y: 390, width: 500, height: 210, color: { red: 255, green: 255, blue: 255 } },
      { x: 120, y: 620, width: 500, height: 20, color: { red: 15, green: 15, blue: 15 } }
    ]
  )
  const { WeChatNativeDriver } = loadNativeDriver({
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => ({
      dataUrl: 'data:image/png;base64=dark-image-window',
      png: Buffer.from('dark-image-window'),
      width: 900,
      height: 700
    }),
    comparePngSnapshots: () => ({ changed: true, digest: 'digest-dark-image-window', changedRatio: 1 }),
    parseWeChatSnapshotWithVision: async () => ({
      contact: 'image-customer',
      messages: [
        {
          content: '[image]',
          isSelf: false,
          uiId: 'dark-image-message',
          type: 'image',
          bounds: { x: 120, y: 220, w: 500, h: 430 }
        }
      ],
      snapshotDigest: 'digest-dark-image-window-after',
      conversationType: 'SINGLE',
      accountCategory: 'NORMAL'
    }),
    nativeImage: {
      createFromBuffer: (buffer) => ({
        isEmpty: () => false,
        getSize: () => ({ width: 900, height: 700 }),
        toBitmap: () => bitmap,
        crop: (rect) => {
          cropRects.push({ buffer: buffer.toString('utf8'), rect })
          return {
            isEmpty: () => false,
            getSize: () => ({ width: rect.width, height: rect.height }),
            toDataURL: () => `data:image/png;base64=cropped-${rect.x}-${rect.y}-${rect.width}-${rect.height}`
          }
        }
      })
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  disableStartupBaselineForTest(driver)
  await driver.poll()
  const imageResult = await driver.copyImageMessage({ messageUiId: 'dark-image-message' })

  assert.equal(imageResult.ok, true)
  assert.equal(imageResult.dataUrl, 'data:image/png;base64=cropped-120-220-192-132')
  assert.deepEqual(filterCropRectsByRect(cropRects, { x: 120, y: 220, width: 192, height: 132 }), [
    {
      buffer: 'dark-image-window',
      rect: { x: 120, y: 220, width: 192, height: 132 }
    }
  ])
}

async function testShortImageBoundsAreExpandedToFullImageBody() {
  const cropRects = []
  const bitmap = createBitmap(
    900,
    700,
    { red: 242, green: 242, blue: 242 },
    [
      { x: 126, y: 226, width: 180, height: 90, color: { red: 80, green: 140, blue: 80 } },
      { x: 126, y: 316, width: 180, height: 150, color: { red: 95, green: 135, blue: 75 } }
    ]
  )
  const { WeChatNativeDriver } = loadNativeDriver({
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => ({
      dataUrl: 'data:image/png;base64=short-bounds-image-window',
      png: Buffer.from('short-bounds-image-window'),
      width: 900,
      height: 700
    }),
    comparePngSnapshots: () => ({ changed: true, digest: 'digest-short-bounds-image-window', changedRatio: 1 }),
    parseWeChatSnapshotWithVision: async () => ({
      contact: 'short-bounds-image-customer',
      messages: [
        {
          content: '[image]',
          isSelf: false,
          uiId: 'short-bounds-image-message',
          type: 'image',
          bounds: { x: 120, y: 220, w: 180, h: 120 }
        }
      ],
      snapshotDigest: 'digest-short-bounds-image-window-after',
      conversationType: 'SINGLE',
      accountCategory: 'NORMAL'
    }),
    nativeImage: {
      createFromBuffer: (buffer) => ({
        isEmpty: () => false,
        getSize: () => ({ width: 900, height: 700 }),
        toBitmap: () => bitmap,
        crop: (rect) => {
          cropRects.push({ buffer: buffer.toString('utf8'), rect })
          return {
            isEmpty: () => false,
            getSize: () => ({ width: rect.width, height: rect.height }),
            toDataURL: () => `data:image/png;base64=cropped-${rect.x}-${rect.y}-${rect.width}-${rect.height}`
          }
        }
      })
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  disableStartupBaselineForTest(driver)
  await driver.poll()
  const imageResult = await driver.copyImageMessage({ messageUiId: 'short-bounds-image-message' })

  assert.equal(imageResult.ok, true)
  assert.equal(imageResult.dataUrl, 'data:image/png;base64=cropped-120-220-192-252')
  assert.deepEqual(filterCropRectsByRect(cropRects, { x: 120, y: 220, width: 192, height: 252 }), [
    {
      buffer: 'short-bounds-image-window',
      rect: { x: 120, y: 220, width: 192, height: 252 }
    }
  ])
}

async function testRepliedImageWithChangedUiIdAndBoundsDoesNotTriggerAgain() {
  let parseCount = 0
  let nowMs = 1_800_000_000_000
  const originalDateNow = Date.now
  const { WeChatNativeDriver } = loadNativeDriver({
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => ({
      dataUrl: 'data:image/png;base64=repeated-image-window',
      png: Buffer.from(`repeated-image-window-${parseCount}`),
      width: 900,
      height: 700
    }),
    comparePngSnapshots: () => ({ changed: true, digest: `digest-repeated-image-${parseCount}`, changedRatio: 1 }),
    parseWeChatSnapshotWithVision: async () => {
      parseCount += 1
      return {
        contact: 'repeated-image-customer',
        messages: [
          {
            content: '[图片]',
            isSelf: false,
            uiId: `repeated-image-${parseCount}`,
            type: 'image',
            bounds: { x: 120, y: 220 - parseCount * 3, w: 180, h: 120 }
          }
        ],
        snapshotDigest: `digest-repeated-image-after-${parseCount}`,
        conversationType: 'SINGLE',
        accountCategory: 'NORMAL'
      }
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  try {
    Date.now = () => nowMs
    await driver.start()
    disableStartupBaselineForTest(driver)
    const firstResult = await driver.poll()
    nowMs += 10 * 60 * 1000
    driver.lastPollAt = 0
    const secondResult = await driver.poll()

    assert.equal(firstResult.messages.length, 1)
    assert.equal(firstResult.messages[0].trigger_reply, true)
    assert.deepEqual(secondResult.messages, [])
  } finally {
    Date.now = originalDateNow
  }
}

async function testCustomerImageFollowedBySelfRepliesDoesNotTrigger() {
  const { WeChatNativeDriver } = loadNativeDriver({
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => ({
      dataUrl: 'data:image/png;base64=image-with-self-replies',
      png: Buffer.from('image-with-self-replies'),
      width: 900,
      height: 700
    }),
    comparePngSnapshots: () => ({ changed: true, digest: 'digest-image-with-self-replies', changedRatio: 1 }),
    parseWeChatSnapshotWithVision: async () => ({
      contact: 'image-self-replies-customer',
      messages: [
        {
          content: '[图片]',
          isSelf: false,
          uiId: 'old-image-message',
          type: 'image',
          bounds: { x: 120, y: 220, w: 180, h: 120 }
        },
        {
          content: '这是第一次自动回复',
          isSelf: true,
          uiId: 'self-reply-1',
          type: 'text'
        },
        {
          content: '这是第二次自动回复',
          isSelf: true,
          uiId: 'self-reply-2',
          type: 'text'
        },
        {
          content: '这是第三次自动回复',
          isSelf: true,
          uiId: 'self-reply-3',
          type: 'text'
        }
      ],
      snapshotDigest: 'digest-image-with-self-replies-after',
      conversationType: 'SINGLE',
      accountCategory: 'NORMAL'
    }),
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  const result = await driver.poll()

  assert.deepEqual(result.messages, [])
}

async function testDifferentImageSignatureCanTriggerAfterPreviousImageReply() {
  let parseCount = 0
  let nowMs = 1_800_000_500_000
  const originalDateNow = Date.now
  const firstBitmap = createBitmap(900, 700, { red: 242, green: 242, blue: 242 }, [
    { x: 126, y: 226, width: 180, height: 120, color: { red: 60, green: 130, blue: 190 } }
  ])
  const secondBitmap = createBitmap(900, 700, { red: 242, green: 242, blue: 242 }, [
    { x: 126, y: 226, width: 180, height: 120, color: { red: 190, green: 90, blue: 60 } }
  ])
  const { WeChatNativeDriver } = loadNativeDriver({
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => ({
      dataUrl: 'data:image/png;base64=different-image-window',
      png: Buffer.from(`different-image-window-${parseCount}`),
      width: 900,
      height: 700
    }),
    comparePngSnapshots: () => ({ changed: true, digest: `digest-different-image-${parseCount}`, changedRatio: 1 }),
    parseWeChatSnapshotWithVision: async () => {
      parseCount += 1
      return {
        contact: 'different-image-customer',
        messages: [
          {
            content: '[图片]',
            isSelf: false,
            uiId: `different-image-${parseCount}`,
            type: 'image',
            bounds: { x: 120, y: 220, w: 180, h: 120 }
          }
        ],
        snapshotDigest: `digest-different-image-after-${parseCount}`,
        conversationType: 'SINGLE',
        accountCategory: 'NORMAL'
      }
    },
    nativeImage: {
      createFromBuffer: (buffer) => ({
        isEmpty: () => false,
        getSize: () => ({ width: 900, height: 700 }),
        toBitmap: () => buffer.toString('utf8').endsWith('-0') ? firstBitmap : secondBitmap,
        crop: (rect) => ({
          isEmpty: () => false,
          getSize: () => ({ width: rect.width, height: rect.height }),
          toDataURL: () => `data:image/png;base64=cropped-${rect.x}-${rect.y}-${rect.width}-${rect.height}`
        })
      })
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  try {
    Date.now = () => nowMs
    await driver.start()
    disableStartupBaselineForTest(driver)
    const firstResult = await driver.poll()
    nowMs += 30 * 1000
    driver.lastPollAt = 0
    const secondResult = await driver.poll()

    assert.equal(firstResult.messages.length, 1)
    assert.equal(firstResult.messages[0].trigger_reply, true)
    assert.equal(secondResult.messages.length, 1)
    assert.equal(secondResult.messages[0].trigger_reply, true)
  } finally {
    Date.now = originalDateNow
  }
}

async function testRecentlySentSelfReplyMisreadAsCustomerIsNotReported() {
  let parseCount = 0
  const sentReply = '可以呀 公园空气好 走一万步刚好~ 记得穿双舒服的鞋'
  const { WeChatNativeDriver } = loadNativeDriver({
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => ({
      dataUrl: 'data:image/png;base64=misread-self-reply',
      png: Buffer.from(`misread-self-reply-window-${parseCount}`),
      width: 900,
      height: 700
    }),
    comparePngSnapshots: () => ({ changed: true, digest: `digest-misread-self-reply-${parseCount}`, changedRatio: 1 }),
    parseWeChatSnapshotWithVision: async () => {
      parseCount += 1
      return {
        contact: '客户A',
        messages: [
          { content: '走一万步刚好~ 记得穿双舒服的鞋', isSelf: false, uiId: `misread-self-reply-${parseCount}` }
        ],
        snapshotDigest: `digest-misread-self-reply-after-${parseCount}`,
        conversationType: 'SINGLE',
        accountCategory: 'NORMAL'
      }
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  await driver.send({ target: '客户A', content: sentReply })
  driver.lastPollAt = 0
  const result = await driver.poll()

  assert.equal(result.ok, true)
  assert.deepEqual(result.messages, [])
}

async function testEllipsizedSelfReplyMisreadAsCustomerIsNotReported() {
  let parseCount = 0
  const sentReply = '那挺爽啊 周末还能包场 😅 适合躺平发呆'
  const { WeChatNativeDriver } = loadNativeDriver({
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => ({
      dataUrl: 'data:image/png;base64=ellipsized-self-reply',
      png: Buffer.from(`ellipsized-self-reply-window-${parseCount}`),
      width: 900,
      height: 700
    }),
    comparePngSnapshots: () => ({ changed: true, digest: `digest-ellipsized-self-reply-${parseCount}`, changedRatio: 1 }),
    parseWeChatSnapshotWithVision: async () => {
      parseCount += 1
      return {
        contact: '客户A',
        messages: [
          { content: '那挺爽啊 周末还能包场 😅 ...', isSelf: false, uiId: `ellipsized-self-reply-${parseCount}` }
        ],
        snapshotDigest: `digest-ellipsized-self-reply-after-${parseCount}`,
        conversationType: 'SINGLE',
        accountCategory: 'NORMAL'
      }
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  await driver.send({ target: '客户A', content: sentReply })
  driver.lastPollAt = 0
  const result = await driver.poll()

  assert.equal(result.ok, true)
  assert.deepEqual(result.messages, [])
}

async function testMarketingLikeIsSkippedDuringActiveReplySession() {
  const clickedPoints = []
  const { WeChatNativeDriver } = loadNativeDriver({
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => ({
      dataUrl: 'data:image/png;base64=marketing-busy',
      png: Buffer.from('marketing-busy'),
      width: 900,
      height: 700
    }),
    comparePngSnapshots: () => ({ changed: false, digest: 'marketing-busy', changedRatio: 0 }),
    parseWeChatSnapshotWithVision: async () => ({
      contact: '客户A',
      messages: [],
      snapshotDigest: 'marketing-busy',
      conversationType: 'SINGLE',
      accountCategory: 'NORMAL'
    }),
    recognizeMarketingMomentsWithVision: async () => ({
      moments: [
        {
          author: '客户A',
          content: '今天新品到店',
          postBounds: { x: 180, y: 120, w: 520, h: 180 },
          likePoint: { x: 650, y: 270 },
          likeMenuAction: 'like',
          confidence: 0.95
        }
      ],
      confidence: 0.95
    }),
    clickMarketingPoint: async (_window, point) => {
      clickedPoints.push(point)
      return true
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  await driver.command({ action: 'reply_session_started', sessionKey: '客户A' })
  const result = await driver.command({
    action: 'marketing_like',
    config: {
      enabled: true,
      maxDailyLikesPerFriend: 5,
      maxDailyTotalLikes: 100
    }
  })

  assert.equal(result.ok, true)
  assert.equal(result.skipped, true)
  assert.equal(result.error, 'busy_not_idle')
  assert.deepEqual(clickedPoints, [])
}

async function testMarketingLikeClicksSafeCandidateAndDedupesPost() {
  const clickedPoints = []
  let captureCount = 0
  const { WeChatNativeDriver } = loadNativeDriver({
    nativeImage: createMarketingMenuNativeImageMock(),
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => {
      captureCount += 1
      const isListFrame = captureCount !== 2
      return {
        dataUrl: isListFrame
          ? 'data:image/png;base64=marketing-like-list'
          : 'data:image/png;base64=marketing-like-menu',
        png: Buffer.from(isListFrame ? 'marketing-like-ellipsis' : 'menu-open'),
        width: 900,
        height: 700
      }
    },
    comparePngSnapshots: () => ({ changed: false, digest: 'marketing-like', changedRatio: 0 }),
    parseWeChatSnapshotWithVision: async () => ({
      contact: '客户A',
      messages: [],
      snapshotDigest: 'marketing-like',
      conversationType: 'SINGLE',
      accountCategory: 'NORMAL'
    }),
    recognizeMarketingMomentsWithVision: async () => ({
      moments: [
        {
          author: '客户A',
          content: '今天新品到店',
          postBounds: { x: 180, y: 120, w: 520, h: 180 },
          likePoint: { x: 650, y: 270 },
          likeMenuAction: 'like',
          confidence: 0.95
        }
      ],
      confidence: 0.95
    }),
    clickMarketingPoint: async (window, point) => {
      clickedPoints.push({ hwnd: window.hwnd, point })
      return true
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  const firstResult = await driver.command({
    action: 'marketing_like',
    config: {
      enabled: true,
      maxDailyLikesPerFriend: 5,
      maxDailyTotalLikes: 100
    }
  })
  const secondResult = await driver.command({
    action: 'marketing_like',
    config: {
      enabled: true,
      maxDailyLikesPerFriend: 5,
      maxDailyTotalLikes: 100
    }
  })

  assert.equal(firstResult.ok, true)
  assert.equal(firstResult.performed, true)
  assert.equal(firstResult.author, '客户A')
  assert.equal(clickedPoints.length, 2)
  assert.deepEqual(clickedPoints[0], { hwnd: 100, point: { x: 600, y: 275 } })
  assert.equal(clickedPoints[1].hwnd, 100)
  assert.ok(clickedPoints[1].point.x >= 490 && clickedPoints[1].point.x <= 530)
  assert.ok(clickedPoints[1].point.y >= 265 && clickedPoints[1].point.y <= 285)
  assert.equal(secondResult.ok, true)
  assert.equal(secondResult.skipped, true)
  assert.equal(secondResult.error, 'duplicate_local_visual_digest')
}

async function testMarketingLikeEntersMomentsBeforeRecognition() {
  const events = []
  let captureCount = 0
  const { WeChatNativeDriver } = loadNativeDriver({
    nativeImage: createMarketingMenuNativeImageMock(),
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => {
      captureCount += 1
      return {
        dataUrl: `data:image/png;base64=marketing-enter-moments-${captureCount}`,
        png: Buffer.from(captureCount === 2 ? 'menu-open' : 'marketing-enter-moments-ellipsis'),
        width: 900,
        height: 700
      }
    },
    comparePngSnapshots: () => ({ changed: false, digest: 'marketing-enter-moments', changedRatio: 0 }),
    parseWeChatSnapshotWithVision: async () => ({
      contact: '进入朋友圈客户',
      messages: [],
      snapshotDigest: 'marketing-enter-moments',
      conversationType: 'SINGLE',
      accountCategory: 'NORMAL'
    }),
    clickMomentsEntry: async () => {
      events.push('enter-moments')
      return true
    },
    recognizeMarketingMomentsWithVision: async () => {
      events.push('recognize-moments')
      return {
        moments: [
          {
            author: '客户A',
            content: '进入朋友圈后识别新品动态',
            postBounds: { x: 180, y: 120, w: 520, h: 180 },
            likePoint: { x: 650, y: 270 },
            likeMenuAction: 'like',
            confidence: 0.95
          }
        ],
        confidence: 0.95
      }
    },
    clickMarketingPoint: async () => {
      events.push(events.includes('click-like-menu') ? 'click-like-confirm' : 'click-like-menu')
      return true
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  const result = await driver.command({
    action: 'marketing_like',
    config: {
      enabled: true,
      maxDailyLikesPerFriend: 5,
      maxDailyTotalLikes: 100
    }
  })

  assert.equal(result.ok, true)
  assert.equal(result.performed, true)
  assert.deepEqual(events.slice(0, 2), ['enter-moments', 'recognize-moments'])
  assert.deepEqual(events.slice(2), ['click-like-menu', 'click-like-confirm'])
}

async function testMarketingLikeUsesMomentsWindowAndClicksMenuThenLike() {
  const events = []
  const clicked = []
  let captureCount = 0
  const { WeChatNativeDriver } = loadNativeDriver({
    nativeImage: createMarketingMenuNativeImageMock(),
    findWeChatWindow: async () => testWindow,
    findWeChatMomentsWindow: async (sourceWindow) => {
      events.push(`find-moments:${sourceWindow.hwnd}`)
      return testMomentsWindow
    },
    captureWeChatWindow: async (window) => {
      captureCount += 1
      events.push(`capture:${window.hwnd}:${captureCount}`)
      return {
        dataUrl: `data:image/png;base64=marketing-moments-${captureCount}`,
        png: Buffer.from(captureCount === 1 ? 'moments-window-ellipsis' : 'menu-open'),
        width: 900,
        height: 700
      }
    },
    comparePngSnapshots: () => ({ changed: false, digest: 'marketing-moments', changedRatio: 0 }),
    parseWeChatSnapshotWithVision: async () => ({
      contact: '朋友圈',
      messages: [],
      snapshotDigest: 'marketing-moments',
      conversationType: 'SYSTEM',
      accountCategory: 'NORMAL'
    }),
    clickMomentsEntry: async () => {
      events.push('enter-moments')
      return true
    },
    recognizeMarketingMomentsWithVision: async (_imageDataUrl, window) => {
      events.push(`recognize:${window.hwnd}`)
      return {
        moments: [
          {
            author: '客户A',
            content: '今天新品到店',
            postBounds: { x: 140, y: 120, w: 520, h: 220 },
            likePoint: { x: 600, y: 275 },
            likeMenuAction: 'like',
            confidence: 0.95
          }
        ],
        confidence: 0.95
      }
    },
    clickMarketingPoint: async (window, point) => {
      clicked.push({ hwnd: window.hwnd, point })
      events.push(`click:${window.hwnd}:${point.x}:${point.y}`)
      return true
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  const result = await driver.command({
    action: 'marketing_like',
    config: {
      enabled: true,
      maxDailyLikesPerFriend: 5,
      maxDailyTotalLikes: 100
    }
  })

  assert.equal(result.ok, true)
  assert.equal(result.performed, true)
  assert.deepEqual(events.slice(0, 4), ['enter-moments', 'find-moments:100', 'capture:200:1', 'recognize:200'])
  assert.ok(events.includes('capture:200:2'))
  assert.equal(events.filter((event) => event === 'recognize:200').length, 1)
  assert.equal(clicked.length, 2)
  assert.deepEqual(clicked[0], { hwnd: 200, point: { x: 600, y: 275 } })
  assert.equal(clicked[1].hwnd, 200)
  assert.ok(clicked[1].point.x >= 490 && clicked[1].point.x <= 530)
  assert.ok(clicked[1].point.y >= 265 && clicked[1].point.y <= 285)
}

async function testMarketingLikeClosesMomentsWindowAfterSuccess() {
  const events = []
  const delayEvents = []
  const originalSetTimeout = globalThis.setTimeout
  let captureCount = 0
  const { WeChatNativeDriver } = loadNativeDriver({
    nativeImage: createMarketingMenuNativeImageMock(),
    findWeChatWindow: async () => testWindow,
    findWeChatMomentsWindow: async () => testMomentsWindow,
    captureWeChatWindow: async () => {
      captureCount += 1
      return {
        dataUrl: `data:image/png;base64=marketing-close-after-like-${captureCount}`,
        png: Buffer.from(captureCount === 1 ? 'moments-window-ellipsis' : 'menu-open'),
        width: 900,
        height: 700
      }
    },
    comparePngSnapshots: () => ({ changed: false, digest: 'marketing-close-after-like', changedRatio: 0 }),
    parseWeChatSnapshotWithVision: async () => ({ contact: '朋友圈', messages: [] }),
    clickMomentsEntry: async () => {
      events.push('enter-moments')
      return true
    },
    recognizeMarketingMomentsWithVision: async () => ({
      moments: [
        {
          author: '关闭测试客户',
          content: '点赞成功后关闭朋友圈窗口',
          verticalRange: { y: 120, h: 220 },
          suitableForLike: true,
          likeMenuAction: 'like',
          confidence: 0.95
        }
      ],
      confidence: 0.95
    }),
    clickMarketingPoint: async () => {
      events.push(events.includes('click-like-menu') ? 'click-like-confirm' : 'click-like-menu')
      return true
    },
    closeMomentsWindow: async (window) => {
      events.push(`close-moments:${window.hwnd}`)
      return true
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  globalThis.setTimeout = (callback, milliseconds, ...args) => {
    delayEvents.push({ milliseconds, lastEvent: events.at(-1) || '' })
    return originalSetTimeout(callback, 0, ...args)
  }
  let result
  try {
    await driver.start()
    result = await driver.command({
      action: 'marketing_like',
      config: {
        enabled: true,
        maxDailyLikesPerFriend: 5,
        maxDailyTotalLikes: 100
      }
    })
  } finally {
    globalThis.setTimeout = originalSetTimeout
  }

  assert.equal(result.ok, true)
  assert.equal(result.performed, true)
  assert.deepEqual(events.slice(-3), ['click-like-menu', 'click-like-confirm', 'close-moments:200'])
  assert.ok(delayEvents.some((item) =>
    item.lastEvent === 'click-like-confirm' &&
    item.milliseconds >= 1200 &&
    item.milliseconds <= 2000
  ))
}

async function testMarketingLikeDoesNotTrustModelAlreadyLikedAsFinalState() {
  const clicked = []
  let captureCount = 0
  const { WeChatNativeDriver } = loadNativeDriver({
    nativeImage: createMarketingMenuNativeImageMock(),
    findWeChatWindow: async () => testWindow,
    findWeChatMomentsWindow: async () => testMomentsWindow,
    captureWeChatWindow: async () => {
      captureCount += 1
      return {
        dataUrl: `data:image/png;base64=marketing-skip-liked-${captureCount}`,
        png: Buffer.from(captureCount === 1 ? 'moments-window-ellipsis' : 'menu-open'),
        width: 900,
        height: 700
      }
    },
    comparePngSnapshots: () => ({ changed: false, digest: 'marketing-skip-liked', changedRatio: 0 }),
    parseWeChatSnapshotWithVision: async () => ({ contact: '朋友圈', messages: [] }),
    clickMomentsEntry: async () => true,
    recognizeMarketingMomentsWithVision: async () => ({
      moments: [
        {
          author: '已点赞客户',
          content: '这条已经点过赞',
          alreadyLiked: true,
          visualIndex: 0,
          verticalRange: { y: 120, h: 180 },
          suitableForLike: true,
          confidence: 0.95
        },
        {
          author: '待点赞客户',
          content: '这条还没点赞',
          alreadyLiked: false,
          likeMenuAction: 'like',
          visualIndex: 0,
          verticalRange: { y: 120, h: 180 },
          suitableForLike: true,
          confidence: 0.95
        }
      ],
      confidence: 0.95
    }),
    clickMarketingPoint: async (window, point) => {
      clicked.push({ hwnd: window.hwnd, point })
      return true
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  const result = await driver.command({
    action: 'marketing_like',
    config: {
      enabled: true,
      maxDailyLikesPerFriend: 5,
      maxDailyTotalLikes: 100
    }
  })

  assert.equal(result.ok, true)
  assert.equal(result.performed, true)
  assert.equal(clicked.length, 2)
}

async function testMarketingLikeSkipsWhenOpenedMenuIsUnlikeAction() {
  const clicked = []
  const closed = []
  let captureCount = 0
  let recognizeCount = 0
  const { WeChatNativeDriver } = loadNativeDriver({
    nativeImage: createMarketingMenuNativeImageMock(),
    findWeChatWindow: async () => testWindow,
    findWeChatMomentsWindow: async () => testMomentsWindow,
    captureWeChatWindow: async () => {
      captureCount += 1
      return {
        dataUrl: `data:image/png;base64=marketing-menu-unlike-${captureCount}`,
        png: Buffer.from(captureCount === 1 ? 'moments-window-ellipsis' : 'menu-open-unlike-local'),
        width: 900,
        height: 700
      }
    },
    comparePngSnapshots: () => ({ changed: false, digest: 'marketing-menu-unlike', changedRatio: 0 }),
    parseWeChatSnapshotWithVision: async () => ({ contact: '朋友圈', messages: [] }),
    clickMomentsEntry: async () => true,
    recognizeMarketingMomentsWithVision: async () => {
      recognizeCount += 1
      if (recognizeCount === 1) {
        return {
          moments: [
            {
              author: '已点赞客户',
              content: '打开菜单后才发现是取消',
              alreadyLiked: false,
              visualIndex: 0,
              verticalRange: { y: 120, h: 180 },
              suitableForLike: true,
              confidence: 0.95
            }
          ],
          confidence: 0.95
        }
      }
      return {
        moments: [
          {
            author: '已点赞客户',
            content: '打开菜单后才发现是取消',
            alreadyLiked: true,
            likeMenuAction: 'unlike',
            visualIndex: 0,
            verticalRange: { y: 120, h: 180 },
            suitableForLike: true,
            confidence: 0.95
          }
        ],
        confidence: 0.95
      }
    },
    clickMarketingPoint: async (window, point) => {
      clicked.push({ hwnd: window.hwnd, point })
      return true
    },
    closeMomentsWindow: async (window) => {
      closed.push(window.hwnd)
      return true
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  const result = await driver.command({
    action: 'marketing_like',
    config: {
      enabled: true,
      maxDailyLikesPerFriend: 5,
      maxDailyTotalLikes: 100
    }
  })

  assert.equal(result.ok, true)
  assert.equal(result.skipped, true)
  assert.equal(result.error, 'like_menu_is_unlike')
  assert.equal(clicked.length, 1)
  assert.equal(recognizeCount, 1)
  assert.deepEqual(closed, [200])
}

async function testMarketingLikeAllowsMenuPointBesidePostBounds() {
  const clicked = []
  let captureCount = 0
  const { WeChatNativeDriver } = loadNativeDriver({
    nativeImage: createMarketingMenuNativeImageMock(),
    findWeChatWindow: async () => testWindow,
    findWeChatMomentsWindow: async () => testMomentsWindow,
    captureWeChatWindow: async () => {
      captureCount += 1
      return {
        dataUrl: `data:image/png;base64=marketing-right-side-menu-${captureCount}`,
        png: Buffer.from(captureCount === 1 ? 'moments-window-ellipsis' : 'menu-open'),
        width: 900,
        height: 700
      }
    },
    comparePngSnapshots: () => ({ changed: false, digest: 'marketing-right-side-menu', changedRatio: 0 }),
    parseWeChatSnapshotWithVision: async () => ({ contact: '朋友圈', messages: [] }),
    clickMomentsEntry: async () => true,
    recognizeMarketingMomentsWithVision: async () => ({
      moments: [
        {
          author: '客户A',
          content: '右侧菜单点位测试',
          postBounds: { x: 140, y: 120, w: 360, h: 220 },
          likePoint: { x: 600, y: 275 },
          likeMenuAction: 'like',
          confidence: 0.95
        }
      ],
      confidence: 0.95
    }),
    clickMarketingPoint: async (window, point) => {
      clicked.push({ hwnd: window.hwnd, point })
      return true
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  const result = await driver.command({
    action: 'marketing_like',
    config: {
      enabled: true,
      maxDailyLikesPerFriend: 5,
      maxDailyTotalLikes: 100
    }
  })

  assert.equal(result.ok, true)
  assert.equal(result.performed, true)
  assert.equal(clicked.length, 2)
  assert.deepEqual(clicked[0], { hwnd: 200, point: { x: 600, y: 275 } })
}

async function testMarketingLikeUsesLocalMenuPointWithoutModelCoordinates() {
  const clicked = []
  let captureCount = 0
  const { WeChatNativeDriver } = loadNativeDriver({
    nativeImage: createMarketingMenuNativeImageMock(),
    findWeChatWindow: async () => testWindow,
    findWeChatMomentsWindow: async () => testMomentsWindow,
    captureWeChatWindow: async () => {
      captureCount += 1
      return {
        dataUrl: `data:image/png;base64=marketing-local-menu-${captureCount}`,
        png: Buffer.from(captureCount === 1 ? 'moments-window-ellipsis' : 'menu-open'),
        width: 900,
        height: 700
      }
    },
    comparePngSnapshots: () => ({ changed: false, digest: 'marketing-local-menu', changedRatio: 0 }),
    parseWeChatSnapshotWithVision: async () => ({ contact: '朋友圈', messages: [] }),
    clickMomentsEntry: async () => true,
    recognizeMarketingMomentsWithVision: async () => ({
      moments: [
        {
          author: '客户A',
          content: '本地菜单定位测试',
          verticalRange: { y: 120, h: 260 },
          suitableForLike: true,
          likeMenuAction: 'like',
          confidence: 0.95
        }
      ],
      confidence: 0.95
    }),
    clickMarketingPoint: async (window, point) => {
      clicked.push({ hwnd: window.hwnd, point })
      return true
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  const result = await driver.command({
    action: 'marketing_like',
    config: {
      enabled: true,
      maxDailyLikesPerFriend: 5,
      maxDailyTotalLikes: 100
    }
  })

  assert.equal(result.ok, true)
  assert.equal(result.performed, true)
  assert.equal(clicked.length, 2)
  assert.equal(clicked[0].hwnd, 200)
  assert.ok(clicked[0].point.x >= 590 && clicked[0].point.x <= 610)
  assert.ok(clicked[0].point.y >= 270 && clicked[0].point.y <= 280)
}

async function testMarketingLikePrefersBlueActionButtonOverArticleEllipsis() {
  const clicked = []
  let captureCount = 0
  const { WeChatNativeDriver } = loadNativeDriver({
    nativeImage: createMarketingMenuNativeImageMock(),
    findWeChatWindow: async () => testWindow,
    findWeChatMomentsWindow: async () => testMomentsWindow,
    captureWeChatWindow: async () => {
      captureCount += 1
      return {
        dataUrl: `data:image/png;base64=marketing-article-button-${captureCount}`,
        png: Buffer.from(captureCount === 1 ? 'article-card-ellipsis' : 'menu-open-near-article-button'),
        width: 900,
        height: 700
      }
    },
    comparePngSnapshots: () => ({ changed: false, digest: 'marketing-article-button', changedRatio: 0 }),
    parseWeChatSnapshotWithVision: async () => ({ contact: '鏈嬪弸鍦?', messages: [] }),
    clickMomentsEntry: async () => true,
    recognizeMarketingMomentsWithVision: async () => ({
      moments: [
        {
          author: '鏆楀',
          content: '姣曟槉娲诲瓧鍗板埛',
          verticalRange: { y: 386, h: 146 },
          suitableForLike: true,
          likeMenuAction: 'like',
          confidence: 0.95
        }
      ],
      confidence: 0.95
    }),
    clickMarketingPoint: async (window, point) => {
      clicked.push({ hwnd: window.hwnd, point })
      return true
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  const result = await driver.command({
    action: 'marketing_like',
    config: {
      enabled: true,
      maxDailyLikesPerFriend: 5,
      maxDailyTotalLikes: 100
    }
  })

  assert.equal(result.ok, true)
  assert.equal(result.performed, true)
  assert.equal(clicked.length, 2)
  assert.equal(clicked[0].hwnd, 200)
  assert.ok(clicked[0].point.x >= 812 && clicked[0].point.x <= 828)
  assert.ok(clicked[0].point.y >= 458 && clicked[0].point.y <= 470)
  assert.equal(clicked[1].hwnd, 200)
  assert.ok(clicked[1].point.x >= 690 && clicked[1].point.x <= 730)
  assert.ok(clicked[1].point.y >= 458 && clicked[1].point.y <= 474)
}

async function testMarketingLikeUsesRightEdgeBlueButtonInNarrowMomentsWindow() {
  const clicked = []
  let captureCount = 0
  const narrowMomentsWindow = {
    ...testMomentsWindow,
    width: 456,
    height: 558
  }
  const { WeChatNativeDriver } = loadNativeDriver({
    nativeImage: createMarketingMenuNativeImageMock(),
    findWeChatWindow: async () => testWindow,
    findWeChatMomentsWindow: async () => narrowMomentsWindow,
    captureWeChatWindow: async () => {
      captureCount += 1
      return {
        dataUrl: `data:image/png;base64=marketing-narrow-button-${captureCount}`,
        png: Buffer.from(captureCount === 1 ? 'narrow-article-card-ellipsis' : 'narrow-menu-open-near-button'),
        width: 456,
        height: 558
      }
    },
    comparePngSnapshots: () => ({ changed: false, digest: 'marketing-narrow-button', changedRatio: 0 }),
    parseWeChatSnapshotWithVision: async () => ({ contact: '鏈嬪弸鍦?', messages: [] }),
    clickMomentsEntry: async () => true,
    recognizeMarketingMomentsWithVision: async () => ({
      moments: [
        {
          author: '暗夜',
          content: '毕昇活字印刷领先西方四百年',
          verticalRange: { y: 386, h: 190 },
          suitableForLike: true,
          likeMenuAction: 'like',
          confidence: 0.95
        }
      ],
      confidence: 0.95
    }),
    clickMarketingPoint: async (window, point) => {
      clicked.push({ hwnd: window.hwnd, point })
      return true
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  const result = await driver.command({
    action: 'marketing_like',
    config: {
      enabled: true,
      maxDailyLikesPerFriend: 5,
      maxDailyTotalLikes: 100
    }
  })

  assert.equal(result.ok, true)
  assert.equal(result.performed, true)
  assert.equal(clicked.length, 2)
  assert.equal(clicked[0].hwnd, 200)
  assert.ok(clicked[0].point.x >= 424 && clicked[0].point.x <= 438)
  assert.ok(clicked[0].point.y >= 448 && clicked[0].point.y <= 462)
  assert.equal(clicked[1].hwnd, 200)
  assert.ok(clicked[1].point.x >= 300 && clicked[1].point.x <= 340)
  assert.ok(clicked[1].point.y >= 444 && clicked[1].point.y <= 462)
}

async function testMarketingLikePrefersTwoDotMenuOverThreeDotFallback() {
  const clicked = []
  let captureCount = 0
  const { WeChatNativeDriver } = loadNativeDriver({
    nativeImage: createMarketingMenuNativeImageMock(),
    findWeChatWindow: async () => testWindow,
    findWeChatMomentsWindow: async () => testMomentsWindow,
    captureWeChatWindow: async () => {
      captureCount += 1
      return {
        dataUrl: `data:image/png;base64=marketing-two-dot-${captureCount}`,
        png: Buffer.from(captureCount === 1 ? 'two-dot-primary-with-three-dot-fallback' : 'menu-open-like-local'),
        width: 900,
        height: 700
      }
    },
    comparePngSnapshots: () => ({ changed: false, digest: 'marketing-two-dot', changedRatio: 0 }),
    parseWeChatSnapshotWithVision: async () => ({ contact: '朋友圈', messages: [] }),
    clickMomentsEntry: async () => true,
    recognizeMarketingMomentsWithVision: async () => ({
      moments: [
        {
          author: 'two-dot-customer',
          content: 'two dot menu should be primary',
          verticalRange: { y: 120, h: 220 },
          suitableForLike: true,
          confidence: 0.95
        }
      ],
      confidence: 0.95
    }),
    clickMarketingPoint: async (window, point) => {
      clicked.push({ hwnd: window.hwnd, point })
      return true
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  const result = await driver.command({
    action: 'marketing_like',
    config: {
      enabled: true,
      maxDailyLikesPerFriend: 5,
      maxDailyTotalLikes: 100
    }
  })

  assert.equal(result.ok, true)
  assert.equal(result.performed, true)
  assert.equal(clicked.length, 2)
  assert.ok(clicked[0].point.x >= 650 && clicked[0].point.x <= 660)
  assert.ok(clicked[0].point.y >= 270 && clicked[0].point.y <= 280)
}

async function testMarketingLikeUsesLocalOpenedMenuStatusWithoutSecondVision() {
  const clicked = []
  let captureCount = 0
  let recognizeCount = 0
  const { WeChatNativeDriver } = loadNativeDriver({
    nativeImage: createMarketingMenuNativeImageMock(),
    findWeChatWindow: async () => testWindow,
    findWeChatMomentsWindow: async () => testMomentsWindow,
    captureWeChatWindow: async () => {
      captureCount += 1
      return {
        dataUrl: `data:image/png;base64=marketing-local-like-${captureCount}`,
        png: Buffer.from(captureCount === 1 ? 'marketing-local-like-ellipsis' : 'menu-open-like-local'),
        width: 900,
        height: 700
      }
    },
    comparePngSnapshots: () => ({ changed: false, digest: 'marketing-local-like', changedRatio: 0 }),
    parseWeChatSnapshotWithVision: async () => ({ contact: '朋友圈', messages: [] }),
    clickMomentsEntry: async () => true,
    recognizeMarketingMomentsWithVision: async () => {
      recognizeCount += 1
      return {
        moments: [
          {
            author: 'local-like-customer',
            content: 'local like menu can be confirmed without model',
            verticalRange: { y: 120, h: 220 },
            suitableForLike: true,
            confidence: 0.95
          }
        ],
        confidence: 0.95
      }
    },
    clickMarketingPoint: async (window, point) => {
      clicked.push({ hwnd: window.hwnd, point })
      return true
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  const result = await driver.command({
    action: 'marketing_like',
    config: {
      enabled: true,
      maxDailyLikesPerFriend: 5,
      maxDailyTotalLikes: 100
    }
  })

  assert.equal(result.ok, true)
  assert.equal(result.performed, true)
  assert.equal(recognizeCount, 1)
  assert.equal(clicked.length, 2)
}

async function testMarketingLikeSkipsLocalUnlikeMenuWithoutSecondVision() {
  const clicked = []
  const closed = []
  let captureCount = 0
  let recognizeCount = 0
  const { WeChatNativeDriver } = loadNativeDriver({
    nativeImage: createMarketingMenuNativeImageMock(),
    findWeChatWindow: async () => testWindow,
    findWeChatMomentsWindow: async () => testMomentsWindow,
    captureWeChatWindow: async () => {
      captureCount += 1
      return {
        dataUrl: `data:image/png;base64=marketing-local-unlike-${captureCount}`,
        png: Buffer.from(captureCount === 1 ? 'marketing-local-unlike-ellipsis' : 'menu-open-unlike-local'),
        width: 900,
        height: 700
      }
    },
    comparePngSnapshots: () => ({ changed: false, digest: 'marketing-local-unlike', changedRatio: 0 }),
    parseWeChatSnapshotWithVision: async () => ({ contact: '朋友圈', messages: [] }),
    clickMomentsEntry: async () => true,
    recognizeMarketingMomentsWithVision: async () => {
      recognizeCount += 1
      return {
        moments: [
          {
            author: 'local-unlike-customer',
            content: 'local unlike menu must be skipped',
            verticalRange: { y: 120, h: 220 },
            suitableForLike: true,
            confidence: 0.95
          }
        ],
        confidence: 0.95
      }
    },
    clickMarketingPoint: async (window, point) => {
      clicked.push({ hwnd: window.hwnd, point })
      return true
    },
    closeMomentsWindow: async (window) => {
      closed.push(window.hwnd)
      return true
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  const result = await driver.command({
    action: 'marketing_like',
    config: {
      enabled: true,
      maxDailyLikesPerFriend: 5,
      maxDailyTotalLikes: 100
    }
  })

  assert.equal(result.ok, true)
  assert.equal(result.skipped, true)
  assert.equal(result.error, 'like_menu_is_unlike')
  assert.equal(recognizeCount, 1)
  assert.equal(clicked.length, 1)
  assert.deepEqual(closed, [200])
}

async function testMarketingLikeSkipsRepeatedLocalVisualDigestBeforeVision() {
  const clicked = []
  const closed = []
  let captureCount = 0
  let recognizeCount = 0
  const { WeChatNativeDriver } = loadNativeDriver({
    nativeImage: createMarketingMenuNativeImageMock(),
    findWeChatWindow: async () => testWindow,
    findWeChatMomentsWindow: async () => testMomentsWindow,
    captureWeChatWindow: async () => {
      captureCount += 1
      const isListFrame = captureCount % 2 === 1
      return {
        dataUrl: isListFrame
          ? `data:image/png;base64=marketing-local-digest-repeat-list-${captureCount}`
          : `data:image/png;base64=marketing-local-digest-repeat-menu-${captureCount}`,
        png: Buffer.from(isListFrame ? `marketing-local-digest-repeat-ellipsis-${captureCount}` : 'menu-open-like-local'),
        width: 900,
        height: 700
      }
    },
    comparePngSnapshots: () => ({ changed: false, digest: 'marketing-local-digest-repeat', changedRatio: 0 }),
    parseWeChatSnapshotWithVision: async () => ({ contact: '朋友圈', messages: [] }),
    clickMomentsEntry: async () => true,
    recognizeMarketingMomentsWithVision: async () => {
      recognizeCount += 1
      return {
        moments: [
          {
            author: 'local-digest-customer',
            content: 'same local digest should skip before model next time',
            verticalRange: { y: 120, h: 220 },
            suitableForLike: true,
            confidence: 0.95
          }
        ],
        confidence: 0.95
      }
    },
    clickMarketingPoint: async (window, point) => {
      clicked.push({ hwnd: window.hwnd, point })
      return true
    },
    closeMomentsWindow: async (window) => {
      closed.push(window.hwnd)
      return true
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  const firstResult = await driver.command({
    action: 'marketing_like',
    config: {
      enabled: true,
      maxDailyLikesPerFriend: 5,
      maxDailyTotalLikes: 100
    }
  })
  const secondResult = await driver.command({
    action: 'marketing_like',
    config: {
      enabled: true,
      maxDailyLikesPerFriend: 5,
      maxDailyTotalLikes: 100
    }
  })

  assert.equal(firstResult.ok, true)
  assert.equal(firstResult.performed, true)
  assert.equal(secondResult.ok, true)
  assert.equal(secondResult.skipped, true)
  assert.equal(secondResult.error, 'duplicate_local_visual_digest')
  assert.equal(recognizeCount, 1)
  assert.equal(clicked.length, 2)
  assert.deepEqual(closed, [200, 200])
}

async function testMarketingLikeReadsLegacyActionRecordFingerprint() {
  const clicked = []
  const closed = []
  let recognizeCount = 0
  const legacyBounds = { x: 180, y: 120, w: 520, h: 180 }
  writeMarketingActionStore({
    version: 1,
    records: [
      {
        date: getMarketingDateKey(),
        action: 'like',
        author: 'legacy-like-customer',
        postFingerprint: buildLegacyMarketingPostFingerprint('legacy-like-customer', 'legacy local record should still skip', legacyBounds),
        createdAt: Date.now() - 1000
      }
    ]
  })
  const { WeChatNativeDriver } = loadNativeDriver({
    nativeImage: createMarketingMenuNativeImageMock(),
    findWeChatWindow: async () => testWindow,
    findWeChatMomentsWindow: async () => testMomentsWindow,
    captureWeChatWindow: async () => ({
      dataUrl: 'data:image/png;base64=marketing-legacy-record-list',
      png: Buffer.from('marketing-legacy-record-ellipsis'),
      width: 900,
      height: 700
    }),
    comparePngSnapshots: () => ({ changed: false, digest: 'marketing-legacy-record', changedRatio: 0 }),
    parseWeChatSnapshotWithVision: async () => ({ contact: '朋友圈', messages: [] }),
    clickMomentsEntry: async () => true,
    recognizeMarketingMomentsWithVision: async () => {
      recognizeCount += 1
      return {
        moments: [
          {
            author: 'legacy-like-customer',
            content: 'legacy local record should still skip',
            postBounds: legacyBounds,
            verticalRange: { y: 120, h: 180 },
            suitableForLike: true,
            confidence: 0.95
          }
        ],
        confidence: 0.95
      }
    },
    clickMarketingPoint: async (window, point) => {
      clicked.push({ hwnd: window.hwnd, point })
      return true
    },
    closeMomentsWindow: async (window) => {
      closed.push(window.hwnd)
      return true
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  const result = await driver.command({
    action: 'marketing_like',
    config: {
      enabled: true,
      maxDailyLikesPerFriend: 5,
      maxDailyTotalLikes: 100
    }
  })

  assert.equal(result.ok, true)
  assert.equal(result.skipped, true)
  assert.equal(result.error, 'duplicate_post')
  assert.equal(recognizeCount, 1)
  assert.deepEqual(clicked, [])
  assert.deepEqual(closed, [200])
}

async function testMarketingLikeSkipsWhenMomentsWindowIsNotFound() {
  let recognized = false
  let clicked = false
  const { WeChatNativeDriver } = loadNativeDriver({
    findWeChatWindow: async () => testWindow,
    findWeChatMomentsWindow: async () => null,
    captureWeChatWindow: async () => ({
      dataUrl: 'data:image/png;base64=marketing-missing-moments-window',
      png: Buffer.from('marketing-missing-moments-window'),
      width: 900,
      height: 700
    }),
    comparePngSnapshots: () => ({ changed: false, digest: 'marketing-missing-moments-window', changedRatio: 0 }),
    parseWeChatSnapshotWithVision: async () => ({ contact: '朋友圈', messages: [] }),
    clickMomentsEntry: async () => true,
    recognizeMarketingMomentsWithVision: async () => {
      recognized = true
      return { moments: [], confidence: 0 }
    },
    clickMarketingPoint: async () => {
      clicked = true
      return true
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  const result = await driver.command({
    action: 'marketing_like',
    config: {
      enabled: true,
      maxDailyLikesPerFriend: 5,
      maxDailyTotalLikes: 100
    }
  })

  assert.equal(result.ok, true)
  assert.equal(result.skipped, true)
  assert.equal(result.error, 'moments_window_not_found')
  assert.equal(recognized, false)
  assert.equal(clicked, false)
}

async function testMarketingLikeSkipsWhenLikeMenuIsNotConfirmed() {
  const clicked = []
  const closed = []
  let captureCount = 0
  const { WeChatNativeDriver } = loadNativeDriver({
    nativeImage: createMarketingMenuNativeImageMock(),
    findWeChatWindow: async () => testWindow,
    findWeChatMomentsWindow: async () => testMomentsWindow,
    captureWeChatWindow: async () => {
      captureCount += 1
      return {
        dataUrl: `data:image/png;base64=marketing-menu-missing-${captureCount}`,
        png: Buffer.from(captureCount === 1 ? 'moments-window-ellipsis' : 'menu-closed'),
        width: 900,
        height: 700
      }
    },
    comparePngSnapshots: () => ({ changed: false, digest: 'marketing-menu-missing', changedRatio: 0 }),
    parseWeChatSnapshotWithVision: async () => ({ contact: '朋友圈', messages: [] }),
    clickMomentsEntry: async () => true,
    recognizeMarketingMomentsWithVision: async () => ({
      moments: [
        {
          author: '客户B',
          content: '菜单未出现测试',
          postBounds: { x: 140, y: 120, w: 520, h: 220 },
          likePoint: { x: 600, y: 275 },
          confidence: 0.95
        }
      ],
      confidence: 0.95
    }),
    clickMarketingPoint: async (window, point) => {
      clicked.push({ hwnd: window.hwnd, point })
      return true
    },
    closeMomentsWindow: async (window) => {
      closed.push(window.hwnd)
      return true
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  const result = await driver.command({
    action: 'marketing_like',
    config: {
      enabled: true,
      maxDailyLikesPerFriend: 5,
      maxDailyTotalLikes: 100
    }
  })

  assert.equal(result.ok, true)
  assert.equal(result.skipped, true)
  assert.equal(result.error, 'like_menu_not_confirmed')
  assert.equal(clicked.length, 1)
  assert.deepEqual(closed, [])
}

async function testMarketingLikeSkipsWhenLocalMenuPointIsNotFound() {
  const clicked = []
  const { WeChatNativeDriver } = loadNativeDriver({
    findWeChatWindow: async () => testWindow,
    findWeChatMomentsWindow: async () => testMomentsWindow,
    captureWeChatWindow: async () => ({
      dataUrl: 'data:image/png;base64=marketing-too-far-menu',
      png: Buffer.from('marketing-too-far-menu'),
      width: 900,
      height: 700
    }),
    comparePngSnapshots: () => ({ changed: false, digest: 'marketing-too-far-menu', changedRatio: 0 }),
    parseWeChatSnapshotWithVision: async () => ({ contact: '朋友圈', messages: [] }),
    clickMomentsEntry: async () => true,
    recognizeMarketingMomentsWithVision: async () => ({
      moments: [
        {
          author: '客户A',
          content: '过远点位测试',
          postBounds: { x: 140, y: 120, w: 360, h: 220 },
          likePoint: { x: 760, y: 275 },
          confidence: 0.95
        }
      ],
      confidence: 0.95
    }),
    clickMarketingPoint: async (window, point) => {
      clicked.push({ hwnd: window.hwnd, point })
      return true
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  const result = await driver.command({
    action: 'marketing_like',
    config: {
      enabled: true,
      maxDailyLikesPerFriend: 5,
      maxDailyTotalLikes: 100
    }
  })

  assert.equal(result.ok, true)
  assert.equal(result.skipped, true)
  assert.equal(result.error, 'like_menu_point_not_found')
  assert.equal(clicked.length, 0)
}

async function testMarketingLikeRejectsLowConfidenceCandidateWithoutClicking() {
  const clickedPoints = []
  const { WeChatNativeDriver } = loadNativeDriver({
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => ({
      dataUrl: 'data:image/png;base64=marketing-low-confidence',
      png: Buffer.from('marketing-low-confidence'),
      width: 900,
      height: 700
    }),
    comparePngSnapshots: () => ({ changed: false, digest: 'marketing-low-confidence', changedRatio: 0 }),
    parseWeChatSnapshotWithVision: async () => ({
      contact: '客户A',
      messages: [],
      snapshotDigest: 'marketing-low-confidence',
      conversationType: 'SINGLE',
      accountCategory: 'NORMAL'
    }),
    recognizeMarketingMomentsWithVision: async () => ({
      moments: [
        {
          author: '客户A',
          content: '模型不确定的动态',
          postBounds: { x: 180, y: 120, w: 520, h: 180 },
          likePoint: { x: 650, y: 270 },
          confidence: 0.5
        }
      ],
      confidence: 0.5
    }),
    clickMarketingPoint: async (_window, point) => {
      clickedPoints.push(point)
      return true
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  const result = await driver.command({
    action: 'marketing_like',
    config: {
      enabled: true,
      maxDailyLikesPerFriend: 5,
      maxDailyTotalLikes: 100
    }
  })

  assert.equal(result.ok, true)
  assert.equal(result.skipped, true)
  assert.equal(result.error, 'vision_low_confidence')
  assert.deepEqual(clickedPoints, [])
}

async function testMarketingCommentDoesNotOpenCommentBoxWhenGenerationFails() {
  const clickedPoints = []
  const comments = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => {
    throw new Error('generate failed')
  }
  const { WeChatNativeDriver } = loadNativeDriver({
    nativeImage: createMarketingMenuNativeImageMock(),
    findWeChatWindow: async () => testWindow,
    findWeChatMomentsWindow: async () => testMomentsWindow,
    captureWeChatWindow: async () => ({
      dataUrl: 'data:image/png;base64=marketing-comment',
      png: Buffer.from('marketing-comment-ellipsis'),
      width: 900,
      height: 700
    }),
    comparePngSnapshots: () => ({ changed: false, digest: 'marketing-comment', changedRatio: 0 }),
    parseWeChatSnapshotWithVision: async () => ({
      contact: '客户A',
      messages: [],
      snapshotDigest: 'marketing-comment',
      conversationType: 'SINGLE',
      accountCategory: 'NORMAL'
    }),
    clickMomentsEntry: async () => true,
    recognizeMarketingMomentsWithVision: async () => ({
      moments: [
        {
          author: '客户A',
          content: '今天新品到店',
          verticalRange: { y: 120, h: 180 },
          postBounds: { x: 180, y: 120, w: 520, h: 180 },
          commentPoint: { x: 690, y: 270 },
          suitableForComment: true,
          confidence: 0.95
        }
      ],
      confidence: 0.95
    }),
    clickMarketingPoint: async (_window, point) => {
      clickedPoints.push(point)
      return true
    },
    pasteMarketingComment: async (_window, content) => {
      comments.push(content)
      return true
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  try {
    await driver.start()
    const result = await driver.command({
      action: 'marketing_comment',
      config: {
        enabled: true,
        maxDailyCommentsPerFriend: 5,
        maxDailyTotalComments: 100,
        backendUrl: 'http://127.0.0.1:18080',
        token: 'token',
        tenantId: '1'
      }
    })

    assert.equal(result.ok, true)
    assert.equal(result.skipped, true)
    assert.equal(result.error, 'comment_generation_request_failed')
    assert.deepEqual(clickedPoints, [])
    assert.deepEqual(comments, [])
  } finally {
    globalThis.fetch = originalFetch
  }
}

async function testMarketingCommentUsesLocalMenuPointWithoutModelCommentPoint() {
  const clickedPoints = []
  const comments = []
  const originalFetch = globalThis.fetch
  let captureCount = 0
  let fetchBody = null
  globalThis.fetch = async (_url, options) => {
    fetchBody = JSON.parse(String(options?.body || '{}'))
    return {
      ok: true,
      json: async () => ({ code: 0, data: '挺有意思的' })
    }
  }
  const { WeChatNativeDriver } = loadNativeDriver({
    nativeImage: createMarketingMenuNativeImageMock(),
    findWeChatWindow: async () => testWindow,
    findWeChatMomentsWindow: async () => testMomentsWindow,
    captureWeChatWindow: async () => {
      captureCount += 1
      return {
        dataUrl: `data:image/png;base64=marketing-comment-local-${captureCount}`,
        png: Buffer.from(captureCount === 1 ? 'marketing-comment-local-ellipsis' : 'menu-open-comment-local'),
        width: 900,
        height: 700
      }
    },
    comparePngSnapshots: () => ({ changed: false, digest: 'marketing-comment-local', changedRatio: 0 }),
    parseWeChatSnapshotWithVision: async () => ({ contact: '朋友圈', messages: [] }),
    clickMomentsEntry: async () => true,
    recognizeMarketingMomentsWithVision: async () => ({
      moments: [
        {
          author: 'comment-local-customer',
          content: 'local menu should open comment box',
          timeText: '2小时前',
          verticalRange: { y: 120, h: 220 },
          suitableForComment: true,
          confidence: 0.95
        }
      ],
      confidence: 0.95
    }),
    clickMarketingPoint: async (_window, point) => {
      clickedPoints.push(point)
      return true
    },
    pasteMarketingComment: async (_window, content) => {
      comments.push(content)
      return true
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  try {
    await driver.start()
    const result = await driver.command({
      action: 'marketing_comment',
      config: {
        enabled: true,
        maxDailyCommentsPerFriend: 5,
        maxDailyTotalComments: 100,
        backendUrl: 'http://127.0.0.1:18080',
        token: 'token',
        tenantId: '1'
      }
    })

    assert.equal(result.ok, true)
    assert.equal(result.performed, true)
    assert.equal(clickedPoints.length, 2)
    assert.ok(clickedPoints[0].x >= 590 && clickedPoints[0].x <= 610)
    assert.ok(clickedPoints[1].x >= 600 && clickedPoints[1].x <= 640)
    assert.deepEqual(comments, ['挺有意思的'])
    assert.equal(fetchBody.timeText, '2小时前')
  } finally {
    globalThis.fetch = originalFetch
  }
}

async function testMarketingCommentRecognizesRealMixedMenuPixels() {
  const { WeChatNativeDriver } = loadNativeDriver({
    nativeImage: createMarketingMenuNativeImageMock()
  })
  const driver = new WeChatNativeDriver()

  const action = driver.detectOpenedMarketingCommentMenuAction(
    {
      dataUrl: 'data:image/png;base64=comment-action-real-mixed',
      png: Buffer.from('comment-action-real-mixed'),
      width: 900,
      height: 700
    },
    { x: 623, y: 275 }
  )

  assert.equal(action, 'comment')
}

async function testMarketingCommentReportsMissingGenerationBackendBeforeMenuClick() {
  const clickedPoints = []
  let captureCount = 0
  const { WeChatNativeDriver } = loadNativeDriver({
    nativeImage: createMarketingMenuNativeImageMock(),
    findWeChatWindow: async () => testWindow,
    findWeChatMomentsWindow: async () => testMomentsWindow,
    captureWeChatWindow: async () => {
      captureCount += 1
      return {
        dataUrl: `data:image/png;base64=marketing-comment-missing-backend-${captureCount}`,
        png: Buffer.from(captureCount === 1 ? 'marketing-comment-missing-backend-ellipsis' : 'menu-open-comment-local'),
        width: 900,
        height: 700
      }
    },
    comparePngSnapshots: () => ({ changed: false, digest: 'marketing-comment-missing-backend', changedRatio: 0 }),
    parseWeChatSnapshotWithVision: async () => ({ contact: '朋友圈', messages: [] }),
    clickMomentsEntry: async () => true,
    recognizeMarketingMomentsWithVision: async () => ({
      moments: [
        {
          author: 'comment-missing-backend-customer',
          content: 'local menu is available but comment backend is missing',
          verticalRange: { y: 120, h: 220 },
          suitableForComment: true,
          confidence: 0.95
        }
      ],
      confidence: 0.95
    }),
    clickMarketingPoint: async (_window, point) => {
      clickedPoints.push(point)
      return true
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  const result = await driver.command({
    action: 'marketing_comment',
    config: {
      enabled: true,
      maxDailyCommentsPerFriend: 5,
      maxDailyTotalComments: 100
    }
  })

  assert.equal(result.ok, true)
  assert.equal(result.skipped, true)
  assert.equal(result.error, 'comment_generation_backend_missing')
  assert.deepEqual(clickedPoints, [])
}

async function testMarketingCommentSkipsWhenOpenedMenuCommentActionUnknown() {
  const clickedPoints = []
  const comments = []
  const originalFetch = globalThis.fetch
  let captureCount = 0
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ code: 0, data: '内容不错' })
  })
  const { WeChatNativeDriver } = loadNativeDriver({
    nativeImage: createMarketingMenuNativeImageMock(),
    findWeChatWindow: async () => testWindow,
    findWeChatMomentsWindow: async () => testMomentsWindow,
    captureWeChatWindow: async () => {
      captureCount += 1
      return {
        dataUrl: `data:image/png;base64=marketing-comment-unknown-${captureCount}`,
        png: Buffer.from(captureCount === 1 ? 'marketing-comment-unknown-ellipsis' : 'menu-open'),
        width: 900,
        height: 700
      }
    },
    comparePngSnapshots: () => ({ changed: false, digest: 'marketing-comment-unknown', changedRatio: 0 }),
    parseWeChatSnapshotWithVision: async () => ({ contact: '朋友圈', messages: [] }),
    clickMomentsEntry: async () => true,
    recognizeMarketingMomentsWithVision: async () => ({
      moments: [
        {
          author: 'comment-unknown-customer',
          content: 'comment button is not clear',
          verticalRange: { y: 120, h: 220 },
          suitableForComment: true,
          confidence: 0.95
        }
      ],
      confidence: 0.95
    }),
    clickMarketingPoint: async (_window, point) => {
      clickedPoints.push(point)
      return true
    },
    pasteMarketingComment: async (_window, content) => {
      comments.push(content)
      return true
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  try {
    await driver.start()
    const result = await driver.command({
      action: 'marketing_comment',
      config: {
        enabled: true,
        maxDailyCommentsPerFriend: 5,
        maxDailyTotalComments: 100,
        backendUrl: 'http://127.0.0.1:18080',
        token: 'token',
        tenantId: '1'
      }
    })

    assert.equal(result.ok, true)
    assert.equal(result.skipped, true)
    assert.equal(result.error, 'comment_menu_action_unconfirmed')
    assert.equal(clickedPoints.length, 1)
    assert.deepEqual(comments, [])
  } finally {
    globalThis.fetch = originalFetch
  }
}

async function testMarketingCommentSkipsUnsafeGeneratedContent() {
  const clickedPoints = []
  const comments = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ code: 0, data: '加我微信 wx123456 一起聊' })
  })
  const { WeChatNativeDriver } = loadNativeDriver({
    nativeImage: createMarketingMenuNativeImageMock(),
    findWeChatWindow: async () => testWindow,
    findWeChatMomentsWindow: async () => testMomentsWindow,
    captureWeChatWindow: async () => ({
      dataUrl: 'data:image/png;base64=marketing-comment-unsafe',
      png: Buffer.from('marketing-comment-unsafe-ellipsis'),
      width: 900,
      height: 700
    }),
    comparePngSnapshots: () => ({ changed: false, digest: 'marketing-comment-unsafe', changedRatio: 0 }),
    parseWeChatSnapshotWithVision: async () => ({ contact: '朋友圈', messages: [] }),
    clickMomentsEntry: async () => true,
    recognizeMarketingMomentsWithVision: async () => ({
      moments: [
        {
          author: 'comment-unsafe-customer',
          content: 'unsafe generated content should be blocked',
          verticalRange: { y: 120, h: 220 },
          suitableForComment: true,
          confidence: 0.95
        }
      ],
      confidence: 0.95
    }),
    clickMarketingPoint: async (_window, point) => {
      clickedPoints.push(point)
      return true
    },
    pasteMarketingComment: async (_window, content) => {
      comments.push(content)
      return true
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  try {
    await driver.start()
    const result = await driver.command({
      action: 'marketing_comment',
      config: {
        enabled: true,
        maxDailyCommentsPerFriend: 5,
        maxDailyTotalComments: 100,
        backendUrl: 'http://127.0.0.1:18080',
        token: 'token',
        tenantId: '1'
      }
    })

    assert.equal(result.ok, true)
    assert.equal(result.skipped, true)
    assert.equal(result.error, 'comment_generation_content_unsafe')
    assert.deepEqual(clickedPoints, [])
    assert.deepEqual(comments, [])
  } finally {
    globalThis.fetch = originalFetch
  }
}

await testStartSavesWindowSnapshotWhenVisionDebugCaptureIsEnabled()
await testStopDiscardsInFlightPollMessages()
await testSpecialConversationGetsSkippedBeforeClick()
await testSpecialConversationNameFallbackSkipsBeforeClick()
await testCustomerServiceConversationNameFallbackSkipsBeforeClick()
await testActiveReplySessionBlocksSwitchingUnreadConversation()
await testReplySessionUnlockAllowsSwitchingUnreadConversation()
await testUnreadConversationLockedContactOverridesGenericVisionContact()
await testReliableConversationContactSurvivesLockedContactTtl()
await testSpecialConversationGetsExitedAfterOpen()
await testSpecialConversationNameFallbackExitsAfterOpen()
await testCustomerServiceConversationNameFallbackExitsAfterOpen()
await testRepeatedCustomerMessageWithChangedUiIdIsNotReportedAgain()
await testRepeatedCustomerMessageInSameVisionResultIsReportedOnce()
await testCustomerMessageCanTriggerAfterGeometryBecomesReliable()
await testPersonalChannelEmitsScreenshotCandidateWithoutMainVisionReplyParse()
await testPersonalScreenshotCandidateTriggersForTinyCurrentChatChange()
await testReplyTriggerRecognitionCreatesSingleAutoReplyMessage()
await testOldVisibleCustomerMessageIsNotReportedAgainAfterDedupeWindow()
await testRepliedCustomerMessageWithChangedUiIdDoesNotTriggerAfterRestart()
await testRepliedTextCustomerMessageDoesNotTriggerAfterShortTtlExpired()
await testShortCustomerTextCanTriggerAgainAfterShortTtlWithDifferentBounds()
await testNewNonLatestCustomerMessageIsDisplayedWithoutTriggeringReply()
await testUnreadSwitchOnlyReportsLatestVisibleCustomerMessage()
await testStartupCurrentChatShortHistoryIsNotReportedWhenNewMessageArrives()
await testLegacyPersistedContentFingerprintDoesNotSuppressNewCustomerMessage()
await testLeftListOnlyChangeDoesNotTriggerVisionParsing()
await testCurrentChatRegionChangeStillTriggersVisionParsing()
await testCurrentChatRegionUsesDynamicLayoutBoundaries()
await testCurrentChatRegionTrimsDarkPixelsOutsideWechatRightEdge()
await testCurrentChatRegionReusesStableRegionForSmallBoundaryJitter()
await testChatRegionReusesCacheWhenWindowOnlyMoves()
await testChatRegionRebuildsAfterWindowResize()
await testChatRegionRejectsInputTopDownshiftWithoutResize()
await testVisionFailureRetryWaitsForCooldownWhenChatRegionUnchanged()
await testNativeSendReturnsSelfMessageForDisplay()
await testNativeSendRefreshesInputGeometryBeforePasting()
await testNativeSendSendsTextThenAttachments()
await testNativeSendAttachmentOnlyDoesNotRecordEmptyReply()
await testImageMessageCanBeCroppedFromLatestSnapshot()
await testSmallAvatarMisreadAsImageMessageIsIgnored()
await testRightGreenBubbleMisreadAsCustomerIsCorrectedByCv()
await testLeftCustomerTextNearWindowCenterIsNotCorrectedAsSelf()
await testNarrowWindowLeftCustomerImageNearCenterIsNotCorrectedAsSelf()
await testStartupVisibleHistoryIsOnlyUsedAsBaselineWithPixelGuard()
await testEnterpriseStartupVisibleHistoryIsOnlyUsedAsBaselineWithoutPixelGuard()
await testEnterpriseStartupUnreadCandidateIsIgnored()
await testEnterpriseUnboundedCustomerTextDoesNotTriggerWithoutPixelGuard()
await testUnboundedCustomerTextDoesNotTriggerWhenPixelGuardIsAvailable()
await testBlankLargeImageHallucinationIsIgnored()
await testOversizedImageBoundsAreTightenedBeforeCrop()
await testDarkImageContentIsKeptWhenTighteningCrop()
await testShortImageBoundsAreExpandedToFullImageBody()
await testRepliedImageWithChangedUiIdAndBoundsDoesNotTriggerAgain()
await testCustomerImageFollowedBySelfRepliesDoesNotTrigger()
await testDifferentImageSignatureCanTriggerAfterPreviousImageReply()
await testRecentlySentSelfReplyMisreadAsCustomerIsNotReported()
await testEllipsizedSelfReplyMisreadAsCustomerIsNotReported()
clearMarketingActionStore()
await testMarketingLikeIsSkippedDuringActiveReplySession()
clearMarketingActionStore()
await testMarketingLikeEntersMomentsBeforeRecognition()
clearMarketingActionStore()
await testMarketingLikeUsesMomentsWindowAndClicksMenuThenLike()
clearMarketingActionStore()
await testMarketingLikeClosesMomentsWindowAfterSuccess()
clearMarketingActionStore()
await testMarketingLikeDoesNotTrustModelAlreadyLikedAsFinalState()
clearMarketingActionStore()
await testMarketingLikeSkipsWhenOpenedMenuIsUnlikeAction()
clearMarketingActionStore()
await testMarketingLikeAllowsMenuPointBesidePostBounds()
clearMarketingActionStore()
await testMarketingLikeUsesLocalMenuPointWithoutModelCoordinates()
clearMarketingActionStore()
await testMarketingLikePrefersBlueActionButtonOverArticleEllipsis()
clearMarketingActionStore()
await testMarketingLikeUsesRightEdgeBlueButtonInNarrowMomentsWindow()
clearMarketingActionStore()
await testMarketingLikePrefersTwoDotMenuOverThreeDotFallback()
clearMarketingActionStore()
await testMarketingLikeUsesLocalOpenedMenuStatusWithoutSecondVision()
clearMarketingActionStore()
await testMarketingLikeSkipsLocalUnlikeMenuWithoutSecondVision()
clearMarketingActionStore()
await testMarketingLikeSkipsRepeatedLocalVisualDigestBeforeVision()
clearMarketingActionStore()
await testMarketingLikeReadsLegacyActionRecordFingerprint()
clearMarketingActionStore()
await testMarketingLikeSkipsWhenMomentsWindowIsNotFound()
clearMarketingActionStore()
await testMarketingLikeSkipsWhenLikeMenuIsNotConfirmed()
clearMarketingActionStore()
await testMarketingLikeSkipsWhenLocalMenuPointIsNotFound()
clearMarketingActionStore()
await testMarketingLikeClicksSafeCandidateAndDedupesPost()
clearMarketingActionStore()
await testMarketingLikeRejectsLowConfidenceCandidateWithoutClicking()
clearMarketingActionStore()
await testMarketingCommentUsesLocalMenuPointWithoutModelCommentPoint()
clearMarketingActionStore()
await testMarketingCommentRecognizesRealMixedMenuPixels()
clearMarketingActionStore()
await testMarketingCommentReportsMissingGenerationBackendBeforeMenuClick()
clearMarketingActionStore()
await testMarketingCommentSkipsWhenOpenedMenuCommentActionUnknown()
clearMarketingActionStore()
await testMarketingCommentSkipsUnsafeGeneratedContent()
clearMarketingActionStore()
await testMarketingCommentDoesNotOpenCommentBoxWhenGenerationFails()
