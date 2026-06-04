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
  const localRequire = (id) => {
    if (id === 'electron') {
      return { app: { getPath: () => testUserDataPath } }
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

await testStopDiscardsInFlightPollMessages()
await testSpecialConversationGetsSkippedBeforeClick()
await testActiveReplySessionBlocksSwitchingUnreadConversation()
await testReplySessionUnlockAllowsSwitchingUnreadConversation()
await testSpecialConversationGetsExitedAfterOpen()
await testRepeatedCustomerMessageWithChangedUiIdIsNotReportedAgain()
await testRepeatedCustomerMessageInSameVisionResultIsReportedOnce()
await testOldVisibleCustomerMessageIsNotReportedAgainAfterDedupeWindow()
await testRepliedCustomerMessageWithChangedUiIdDoesNotTriggerAfterRestart()
await testLegacyPersistedContentFingerprintDoesNotSuppressNewCustomerMessage()
await testMinorCurrentChatChangeStillTriggersVisionParsing()
await testNativeSendReturnsSelfMessageForDisplay()
await testRecentlySentSelfReplyMisreadAsCustomerIsNotReported()
