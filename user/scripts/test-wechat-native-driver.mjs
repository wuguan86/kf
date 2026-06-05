import assert from 'node:assert/strict'
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

function createDeferred() {
  let resolveValue
  let rejectValue
  const promise = new Promise((resolve, reject) => {
    resolveValue = resolve
    rejectValue = reject
  })
  return { promise, resolve: resolveValue, reject: rejectValue }
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
          createFromBuffer: () => ({
            isEmpty: () => true
          })
        }
      }
    }
    if (id === './windowLocator') {
      return {
        findWeChatWindow: mocks.findWeChatWindow,
        focusWindow: mocks.focusWindow || (async () => undefined),
        isPlausibleWeChatWindow: mocks.isPlausibleWeChatWindow || (() => true)
      }
    }
    if (id === './screenReader') {
      return { captureWeChatWindow: mocks.captureWeChatWindow }
    }
    if (id === './snapshotDiff') {
      return { comparePngSnapshots: mocks.comparePngSnapshots }
    }
    if (id === './visionClient') {
      return {
        parseWeChatSnapshotWithVision: mocks.parseWeChatSnapshotWithVision,
        recognizeConversationListItemWithVision: mocks.recognizeConversationListItemWithVision
      }
    }
    if (id === './messageVisionGuard') {
      return loadTranspiledTsModule('messageVisionGuard.ts')
    }
    if (id === './conversationListRecognizer') {
      return { recognizeUnreadConversationCandidate: mocks.recognizeUnreadConversationCandidate || (async () => null) }
    }
    if (id === './inputBackend') {
      return {
        pasteAndSendText: mocks.pasteAndSendText,
        clickConversationCandidate: mocks.clickConversationCandidate,
        exitConversationToList: mocks.exitConversationToList || (async () => true)
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

async function testMinorCurrentChatChangeStillTriggersVisionParsing() {
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
  assert.deepEqual(cropRects, [
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
      createFromBuffer: () => ({
        isEmpty: () => false,
        getSize: () => ({ width: 900, height: 700 }),
        toBitmap: () => bitmap
      })
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
      createFromBuffer: () => ({
        isEmpty: () => false,
        getSize: () => ({ width: 900, height: 700 }),
        toBitmap: () => bitmap
      })
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
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
      createFromBuffer: () => ({
        isEmpty: () => false,
        getSize: () => ({ width: 900, height: 700 }),
        toBitmap: () => bitmap
      })
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
      createFromBuffer: () => ({
        isEmpty: () => false,
        getSize: () => ({ width: 900, height: 700 }),
        toBitmap: () => bitmap
      })
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
  assert.deepEqual(cropRects, [
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
  assert.deepEqual(cropRects, [
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
  assert.deepEqual(cropRects, [
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

await testStopDiscardsInFlightPollMessages()
await testSpecialConversationGetsSkippedBeforeClick()
await testActiveReplySessionBlocksSwitchingUnreadConversation()
await testReplySessionUnlockAllowsSwitchingUnreadConversation()
await testSpecialConversationGetsExitedAfterOpen()
await testRepeatedCustomerMessageWithChangedUiIdIsNotReportedAgain()
await testRepeatedCustomerMessageInSameVisionResultIsReportedOnce()
await testOldVisibleCustomerMessageIsNotReportedAgainAfterDedupeWindow()
await testRepliedCustomerMessageWithChangedUiIdDoesNotTriggerAfterRestart()
await testRepliedTextCustomerMessageDoesNotTriggerAfterShortTtlExpired()
await testLegacyPersistedContentFingerprintDoesNotSuppressNewCustomerMessage()
await testMinorCurrentChatChangeStillTriggersVisionParsing()
await testNativeSendReturnsSelfMessageForDisplay()
await testImageMessageCanBeCroppedFromLatestSnapshot()
await testSmallAvatarMisreadAsImageMessageIsIgnored()
await testRightGreenBubbleMisreadAsCustomerIsCorrectedByCv()
await testStartupVisibleHistoryIsOnlyUsedAsBaselineWithPixelGuard()
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
