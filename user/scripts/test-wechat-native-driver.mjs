import assert from 'node:assert/strict'
import { readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const testUserDataPath = resolve('.tmp-wechat-native-test')

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
      return { pasteAndSendText: mocks.pasteAndSendText }
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

await testStopDiscardsInFlightPollMessages()
await testNativeSendReturnsSelfMessageForDisplay()
await testFirstPollOnlyReportsLatestCustomerMessage()
await testPollSkipsBackendSelfMessagesAfterKnownSelfReply()
