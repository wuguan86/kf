import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import ts from 'typescript'

const require = createRequire(import.meta.url)

function loadSelector() {
  const sourcePath = resolve('src/main/services/wechat-native/inputBackendSelector.ts')
  const source = readFileSync(sourcePath, 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true
    }
  }).outputText
  const module = { exports: {} }
  const run = new Function('require', 'module', 'exports', compiled)
  run(require, module, module.exports)
  return module.exports
}

function loadWechatNativeModule(relativePath) {
  const sourcePath = resolve('src/main/services/wechat-native', relativePath)
  const source = readFileSync(sourcePath, 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true
    }
  }).outputText
  const module = { exports: {} }
  const run = new Function('require', 'module', 'exports', compiled)
  run(require, module, module.exports)
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

function createBackend(name, calls, behavior = {}) {
  return {
    pasteAndSendText: async () => {
      calls.push(`${name}:paste`)
      if (behavior.pasteError) throw new Error(behavior.pasteError)
      return behavior.pasteResult ?? true
    },
    clickConversationCandidate: async () => {
      calls.push(`${name}:click`)
      if (behavior.clickError) throw new Error(behavior.clickError)
      return behavior.clickResult ?? true
    },
    exitConversationToList: async () => {
      calls.push(`${name}:exit`)
      if (behavior.exitError) throw new Error(behavior.exitError)
      return behavior.exitResult ?? true
    },
    returnFromNestedConversation: async () => {
      calls.push(`${name}:nested-return`)
      if (behavior.nestedReturnError) throw new Error(behavior.nestedReturnError)
      return behavior.nestedReturnResult ?? true
    },
    clickMomentsEntry: async () => {
      calls.push(`${name}:moments-entry`)
      if (behavior.momentsEntryError) throw new Error(behavior.momentsEntryError)
      return behavior.momentsEntryResult ?? true
    },
    clickMarketingPoint: async () => {
      calls.push(`${name}:marketing-click`)
      if (behavior.marketingClickError) throw new Error(behavior.marketingClickError)
      return behavior.marketingClickResult ?? true
    },
    pasteMarketingComment: async () => {
      calls.push(`${name}:marketing-comment`)
      if (behavior.marketingCommentError) throw new Error(behavior.marketingCommentError)
      return behavior.marketingCommentResult ?? true
    }
  }
}

async function testUsesNativeBackendFirstOnWindows() {
  const { createInputBackend } = loadSelector()
  const calls = []
  const backend = createInputBackend({
    platform: 'win32',
    nativeBackend: createBackend('native', calls),
    fallbackBackend: createBackend('fallback', calls),
    logger: { warn: () => undefined }
  })

  const result = await backend.pasteAndSendText(testWindow, '你好')

  assert.equal(result, true)
  assert.deepEqual(calls, ['native:paste'])
}

async function testFallsBackWhenNativeBackendThrows() {
  const { createInputBackend } = loadSelector()
  const calls = []
  const warnings = []
  const backend = createInputBackend({
    platform: 'win32',
    nativeBackend: createBackend('native', calls, { pasteError: 'native failed' }),
    fallbackBackend: createBackend('fallback', calls),
    logger: { warn: (...args) => warnings.push(args) }
  })

  const result = await backend.pasteAndSendText(testWindow, '你好')

  assert.equal(result, true)
  assert.deepEqual(calls, ['native:paste', 'fallback:paste'])
  assert.equal(warnings.length, 1)
}

async function testUsesFallbackOutsideWindows() {
  const { createInputBackend } = loadSelector()
  const calls = []
  const backend = createInputBackend({
    platform: 'darwin',
    nativeBackend: createBackend('native', calls),
    fallbackBackend: createBackend('fallback', calls),
    logger: { warn: () => undefined }
  })

  const result = await backend.clickConversationCandidate(testWindow, { id: 'u1' })

  assert.equal(result, true)
  assert.deepEqual(calls, ['fallback:click'])
}

async function testReturnsFromNestedConversationWithFallback() {
  const { createInputBackend } = loadSelector()
  const calls = []
  const warnings = []
  const backend = createInputBackend({
    platform: 'win32',
    nativeBackend: createBackend('native', calls, { nestedReturnError: 'native failed' }),
    fallbackBackend: createBackend('fallback', calls),
    logger: { warn: (...args) => warnings.push(args) }
  })

  const result = await backend.returnFromNestedConversation(testWindow)

  assert.equal(result, true)
  assert.deepEqual(calls, ['native:nested-return', 'fallback:nested-return'])
  assert.equal(warnings.length, 1)
}

async function testClickMomentsEntryUsesFallbackWhenNativeFails() {
  const { createInputBackend } = loadSelector()
  const calls = []
  const warnings = []
  const backend = createInputBackend({
    platform: 'win32',
    nativeBackend: createBackend('native', calls, { momentsEntryResult: false }),
    fallbackBackend: createBackend('fallback', calls),
    logger: { warn: (...args) => warnings.push(args) }
  })

  const result = await backend.clickMomentsEntry(testWindow)

  assert.equal(result, true)
  assert.deepEqual(calls, ['native:moments-entry', 'fallback:moments-entry'])
  assert.equal(warnings.length, 1)
}

function testExitPointTargetsConversationListAndAvoidsWindowCloseButton() {
  const { getConversationListExitPoint } = loadWechatNativeModule('conversationExitPoint.ts')

  const point = getConversationListExitPoint(testWindow)

  assert.equal(point.x, 174)
  assert.equal(point.y, 116)
  assert.ok(point.x < testWindow.x + 300)
  assert.ok(point.y > testWindow.y + 80)
  assert.ok(point.x < testWindow.x + testWindow.width - 120)
  assert.ok(point.y > testWindow.y + 40)
}

function testMomentsEntryPointTargetsLeftSidebarIcon() {
  const { getMomentsEntryPoint } = loadWechatNativeModule('momentsEntryPoint.ts')

  const point = getMomentsEntryPoint(testWindow)

  assert.equal(point.x, 31)
  assert.equal(point.y, 235)
  assert.ok(point.x >= 24)
  assert.ok(point.x <= 34)
  assert.ok(point.y >= 218)
  assert.ok(point.y <= 292)
}

function testNestedReturnPointTargetsTopLeftBackButton() {
  const { getNestedConversationBackPoint } = loadWechatNativeModule('conversationExitPoint.ts')

  const point = getNestedConversationBackPoint(testWindow)

  assert.equal(point.x, 80)
  assert.equal(point.y, 98)
  assert.ok(point.x > testWindow.x + 60)
  assert.ok(point.x < testWindow.x + 120)
  assert.ok(point.y > testWindow.y + 80)
  assert.ok(point.y < testWindow.y + 120)
}

function testExitBackendsDoNotSendEscBecauseWechatMinimizesToTray() {
  const win32Source = readFileSync(resolve('src/main/services/wechat-native/win32InputBackend.ts'), 'utf8')
  const powerShellSource = readFileSync(resolve('src/main/services/wechat-native/powerShellInputBackend.ts'), 'utf8')

  assert.equal(win32Source.includes('VK_ESCAPE'), false)
  assert.equal(powerShellSource.includes('SendWait("{ESC}")'), false)
}

function testMarketingCommentSendPointTargetsMomentsSendButton() {
  const { getMarketingCommentSendPoint } = loadWechatNativeModule('marketingCommentSendPoint.ts')
  const momentsWindow = {
    hwnd: 4000472,
    title: '朋友圈',
    className: 'Qt51514QWindowIcon',
    processName: 'Weixin',
    x: 1135,
    y: 384,
    width: 456,
    height: 558
  }

  const point = getMarketingCommentSendPoint(momentsWindow)

  assert.deepEqual(point, { x: 1513, y: 904 })
  assert.ok(point.x > momentsWindow.x + momentsWindow.width * 0.78)
  assert.ok(point.x < momentsWindow.x + momentsWindow.width - 40)
  assert.ok(point.y > momentsWindow.y + momentsWindow.height * 0.9)
  assert.ok(point.y < momentsWindow.y + momentsWindow.height - 20)
}

function testMarketingCommentInputBackendsClickSendButton() {
  const win32Source = readFileSync(resolve('src/main/services/wechat-native/win32InputBackend.ts'), 'utf8')
  const powerShellSource = readFileSync(resolve('src/main/services/wechat-native/powerShellInputBackend.ts'), 'utf8')
  const win32CommentSource = win32Source.slice(win32Source.indexOf('async pasteMarketingComment'))
  const powerShellCommentSource = powerShellSource.slice(powerShellSource.indexOf('async pasteMarketingComment'))

  assert.match(win32CommentSource, /getMarketingCommentSendPoint\(bounds\)/)
  assert.match(win32CommentSource, /clickAt\(api,\s*sendPoint\.x,\s*sendPoint\.y\)/)
  assert.equal(win32CommentSource.includes('pressKey(api, VK_ENTER)'), false)
  assert.match(powerShellCommentSource, /getMarketingCommentSendPoint\(bounds\)/)
  assert.match(powerShellCommentSource, /Click-HumanLike \$\{sendX\} \$\{sendY\}/)
  assert.equal(powerShellCommentSource.includes('SendWait("{ENTER}")'), false)
}

await testUsesNativeBackendFirstOnWindows()
await testFallsBackWhenNativeBackendThrows()
await testUsesFallbackOutsideWindows()
await testReturnsFromNestedConversationWithFallback()
await testClickMomentsEntryUsesFallbackWhenNativeFails()
testExitPointTargetsConversationListAndAvoidsWindowCloseButton()
testMomentsEntryPointTargetsLeftSidebarIcon()
testNestedReturnPointTargetsTopLeftBackButton()
testExitBackendsDoNotSendEscBecauseWechatMinimizesToTray()
testMarketingCommentSendPointTargetsMomentsSendButton()
testMarketingCommentInputBackendsClickSendButton()
