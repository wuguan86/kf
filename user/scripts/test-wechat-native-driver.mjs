import assert from 'node:assert/strict'
import { readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const testUserDataPath = resolve(tmpdir(), 'shijie-wechat-native-test')

rmSync(testUserDataPath, { recursive: true, force: true })

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
      return { parseWeChatSnapshotWithVision: mocks.parseWeChatSnapshotWithVision }
    }
    if (id === './inputBackend') {
      return {
        pasteAndSendText: mocks.pasteAndSendText,
        clickConversationCandidate: mocks.clickConversationCandidate
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
  title: '暗夜',
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
    contact: '暗夜',
    messages: [
      { content: '在吗', isSelf: false, uiId: 'customer-1' },
      { content: '吃了没?', isSelf: false, uiId: 'customer-2' },
      { content: '今天要做什么。', isSelf: false, uiId: 'customer-3' },
      { content: '刚刚好计划 上午看数据复盘 下午搞个活动脑暴 你呢?', isSelf: true, uiId: 'self-1' }
    ],
    snapshotDigest: 'digest-2'
  })

  const result = await pollPromise
  assert.equal(result.ok, true)
  assert.deepEqual(result.messages, [])
}

async function testNativeSendReturnsSelfMessageForDisplay() {
  const { WeChatNativeDriver } = loadNativeDriver({
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => ({ dataUrl: 'data:image/png;base64,current', png: Buffer.from('current'), width: 1, height: 1 }),
    comparePngSnapshots: () => ({ changed: false, digest: 'digest-1', changedRatio: 0 }),
    parseWeChatSnapshotWithVision: async () => ({ contact: '暗夜', messages: [], snapshotDigest: 'digest-1' }),
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  const result = await driver.send({ target: '暗夜', content: '刚刚好计划 上午看数据复盘 下午搞个活动脑暴 你呢?' })

  assert.equal(result.ok, true)
  assert.equal(result.sentMessage.contact, '暗夜')
  assert.equal(result.sentMessage.content, '刚刚好计划 上午看数据复盘 下午搞个活动脑暴 你呢?')
  assert.equal(result.sentMessage.is_self, true)
  assert.equal(result.sentMessage.trigger_reply, false)
}

async function testEnterpriseChannelUsesEnterpriseWindowLocator() {
  const requestedChannels = []
  const { WeChatNativeDriver } = loadNativeDriver({
    findWeChatWindow: async (channel) => {
      requestedChannels.push(channel)
      return { ...testWindow, title: '企业微信', className: 'WXWorkWindow', processName: 'WXWork' }
    },
    captureWeChatWindow: async () => ({ dataUrl: 'data:image/png;base64,current', png: Buffer.from('current'), width: 1, height: 1 }),
    comparePngSnapshots: () => ({ changed: true, digest: 'digest-1', changedRatio: 1 }),
    parseWeChatSnapshotWithVision: async () => ({
      contact: '企业微信客户',
      messages: [{ content: '您好', isSelf: false, uiId: 'enterprise-customer-1' }],
      snapshotDigest: 'digest-1'
    }),
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  driver.configure({ channel: 'enterprise', backendBaseUrl: 'http://localhost', token: 'token', tenantId: '1' })
  await driver.start()
  await driver.poll()
  await driver.send({ target: '企业微信客户', content: '您好，稍等' })

  assert.deepEqual(requestedChannels, ['enterprise', 'enterprise', 'enterprise'])
}

async function testFirstPollOnlyReportsLatestCustomerMessage() {
  const { WeChatNativeDriver } = loadNativeDriver({
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => ({ dataUrl: 'data:image/png;base64,current', png: Buffer.from('current'), width: 1, height: 1 }),
    comparePngSnapshots: () => ({ changed: true, digest: 'digest-1', changedRatio: 1 }),
    parseWeChatSnapshotWithVision: async () => ({
      contact: '暗夜',
      messages: [
        { content: '吃了没?', isSelf: false, uiId: 'customer-old' },
        { content: '刚刚好计划 上午看数据复盘 下午搞个活动脑暴 你呢?', isSelf: true, uiId: 'self-old' },
        { content: '我在复盘', isSelf: false, uiId: 'customer-latest' }
      ],
      snapshotDigest: 'digest-1'
    }),
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  const result = await driver.poll()

  assert.equal(result.ok, true)
  assert.deepEqual(result.messages.map((message) => ({
    content: message.content,
    isSelf: message.is_self,
    triggerReply: message.trigger_reply
  })), [
    { content: '我在复盘', isSelf: false, triggerReply: true }
  ])
}

async function testPollSkipsBackendSelfMessagesAfterKnownSelfReply() {
  const { WeChatNativeDriver } = loadNativeDriver({
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => ({ dataUrl: 'data:image/png;base64,current', png: Buffer.from('current'), width: 1, height: 1 }),
    comparePngSnapshots: () => ({ changed: true, digest: 'digest-1', changedRatio: 1 }),
    parseWeChatSnapshotWithVision: async () => ({
      contact: '暗夜',
      messages: [
        { content: '刚刚好计划 上午看数据复盘 下午搞个活动脑暴 你呢?', isSelf: true, uiId: 'self-known' },
        { content: '数据一般', isSelf: true, uiId: 'backend-self' }
      ],
      snapshotDigest: 'digest-1'
    }),
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  await driver.send({ target: '暗夜', content: '刚刚好计划 上午看数据复盘 下午搞个活动脑暴 你呢?' })
  const result = await driver.poll()

  assert.equal(result.ok, true)
  assert.deepEqual(result.messages, [])
}

async function testNativePollAllowsNextReadAfterOnePointFiveSeconds() {
  const originalNow = Date.now
  let nowMs = 10_000
  Date.now = () => nowMs
  let parseCount = 0
  try {
    const { WeChatNativeDriver } = loadNativeDriver({
      findWeChatWindow: async () => testWindow,
      captureWeChatWindow: async () => ({ dataUrl: 'data:image/png;base64,current', png: Buffer.from(`current-${parseCount}`), width: 1, height: 1 }),
      comparePngSnapshots: () => ({ changed: true, digest: `digest-${parseCount + 1}`, changedRatio: 1 }),
      parseWeChatSnapshotWithVision: async () => {
        parseCount += 1
        return {
          contact: '鏆楀',
          messages: [{ content: `瀹㈡埛娑堟伅-${parseCount}`, isSelf: false, uiId: `customer-${parseCount}` }],
          snapshotDigest: `digest-${parseCount}`
        }
      },
      pasteAndSendText: async () => true
    })
    const driver = new WeChatNativeDriver()

    await driver.start()
    await driver.poll()
    nowMs += 1_400
    const skippedResult = await driver.poll()
    nowMs += 100
    await driver.poll()

    assert.deepEqual(skippedResult.messages, [])
    assert.equal(parseCount, 2)
  } finally {
    Date.now = originalNow
  }
}

async function testPollClicksUnreadConversationWhenScreenshotUnchanged() {
  const clickedCandidates = []
  let parseCount = 0
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
      id: 'unread-1',
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
        messages: [{ content: '有新消息', isSelf: false, uiId: 'new-session-message' }],
        snapshotDigest: `digest-after-click-${parseCount}`
      }
    },
    pasteAndSendText: async () => true
  })
  const driver = new WeChatNativeDriver()

  await driver.start()
  const result = await driver.poll()

  assert.deepEqual(clickedCandidates, ['unread-1'])
  assert.equal(parseCount, 1)
  assert.equal(result.messages.length, 1)
  assert.equal(result.messages[0].contact, '新会话')
  assert.equal(result.messages[0].trigger_reply, true)
}

async function testPollHandlesRepeatedCustomerTextWithDifferentUiIds() {
  const originalNow = Date.now
  let nowMs = 20_000
  Date.now = () => nowMs
  let pollIndex = 0
  try {
    const { WeChatNativeDriver } = loadNativeDriver({
      findWeChatWindow: async () => testWindow,
      captureWeChatWindow: async () => ({ dataUrl: 'data:image/png;base64,current', png: Buffer.from(`current-${pollIndex}`), width: 1, height: 1 }),
      comparePngSnapshots: () => ({ changed: true, digest: `digest-${pollIndex + 1}`, changedRatio: 1 }),
      parseWeChatSnapshotWithVision: async () => {
        pollIndex += 1
        return {
          contact: '重复文本客户',
          messages: [
            { content: '你好', isSelf: false, uiId: 'customer-repeat-1' },
            { content: '你好', isSelf: false, uiId: 'customer-repeat-2' }
          ].slice(0, pollIndex),
          snapshotDigest: `digest-${pollIndex}`
        }
      },
      pasteAndSendText: async () => true
    })
    const driver = new WeChatNativeDriver()

    await driver.start()
    await driver.poll()
    nowMs += 1_500
    const result = await driver.poll()

    assert.equal(result.messages.length, 1)
    assert.equal(result.messages[0].ui_id, 'customer-repeat-2')
  } finally {
    Date.now = originalNow
  }
}

async function testNativeSendUsesHumanizedClickPath() {
  const clicks = []
  const { WeChatNativeDriver } = loadNativeDriver({
    findWeChatWindow: async () => testWindow,
    captureWeChatWindow: async () => ({ dataUrl: 'data:image/png;base64,current', png: Buffer.from('current'), width: 1, height: 1 }),
    comparePngSnapshots: () => ({ changed: false, digest: 'digest-1', changedRatio: 0 }),
    parseWeChatSnapshotWithVision: async () => ({ contact: '客户', messages: [], snapshotDigest: 'digest-1' }),
    pasteAndSendText: async (_window, content) => {
      clicks.push(content)
      return true
    }
  })
  const driver = new WeChatNativeDriver()

  const result = await driver.send({ target: '客户', content: '稍等，我看一下' })

  assert.equal(result.ok, true)
  assert.deepEqual(clicks, ['稍等，我看一下'])
}

await testStopDiscardsInFlightPollMessages()
await testNativeSendReturnsSelfMessageForDisplay()
await testEnterpriseChannelUsesEnterpriseWindowLocator()
await testFirstPollOnlyReportsLatestCustomerMessage()
await testPollSkipsBackendSelfMessagesAfterKnownSelfReply()
await testNativePollAllowsNextReadAfterOnePointFiveSeconds()
await testPollClicksUnreadConversationWhenScreenshotUnchanged()
await testPollHandlesRepeatedCustomerTextWithDifferentUiIds()
await testNativeSendUsesHumanizedClickPath()
