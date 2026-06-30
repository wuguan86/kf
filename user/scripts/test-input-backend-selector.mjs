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

  assert.match(win32CommentSource, /getMarketingCommentSendPoint\(bounds(?:,\s*bounds\.scaleFactor)?\)/)
  assert.match(win32CommentSource, /clickAt\(api,\s*sendPoint\.x,\s*sendPoint\.y\)/)
  assert.equal(win32CommentSource.includes('pressKey(api, VK_ENTER)'), false)
  assert.match(powerShellCommentSource, /getMarketingCommentSendPoint\(bounds(?:,\s*bounds\.scaleFactor)?\)/)
  assert.match(powerShellCommentSource, /Click-HumanLike \$\{sendX\} \$\{sendY\}/)
  assert.equal(powerShellCommentSource.includes('SendWait("{ENTER}")'), false)
}

function testMessageInputPointUsesDynamicInputTopAfterResize() {
  const { getMessageInputClickPoint, getMessageSendButtonPoint } = loadWechatNativeModule('messageInputPoint.ts')
  const logicalInputTopY = 610
  const resizedWindow = {
    ...testWindow,
    x: 120,
    y: 80,
    width: 1180,
    height: 860,
    scaleFactor: 1.5,
    messageInputTopY: logicalInputTopY
  }

  const inputPoint = getMessageInputClickPoint(resizedWindow)
  const sendPoint = getMessageSendButtonPoint(resizedWindow)

  assert.ok(inputPoint.x > resizedWindow.x + resizedWindow.width * 0.55)
  assert.ok(inputPoint.x < resizedWindow.x + resizedWindow.width * 0.75)
  assert.ok(inputPoint.y > resizedWindow.y + logicalInputTopY + 20)
  assert.ok(inputPoint.y < resizedWindow.y + resizedWindow.height - 45)
  assert.ok(sendPoint.x > resizedWindow.x + resizedWindow.width - 100)
  assert.ok(sendPoint.y > inputPoint.y)
}

function testMessageInputPointIgnoresChatBubbleEdgeMisreadAsInputTop() {
  const { getMessageInputClickPoint } = loadWechatNativeModule('messageInputPoint.ts')
  const windowWithMisreadInputTop = {
    ...testWindow,
    x: 0,
    y: 0,
    width: 900,
    height: 840,
    scaleFactor: 1,
    messageInputTopY: 470
  }

  const point = getMessageInputClickPoint(windowWithMisreadInputTop)

  assert.equal(point.y, 768)
}

function testMessageInputPointUsesRealWechatDebugInputTop() {
  const { getMessageInputClickPoint } = loadWechatNativeModule('messageInputPoint.ts')
  const realDebugWindow = {
    ...testWindow,
    x: 160,
    y: 122,
    width: 757,
    height: 702,
    scaleFactor: 1,
    messageInputTopY: 534
  }

  const point = getMessageInputClickPoint(realDebugWindow)

  assert.equal(point.x, 660)
  assert.equal(point.y, 684)
}

function testMessageInputPointFallsBackToScaledBottomOffset() {
  const { getMessageInputClickPoint } = loadWechatNativeModule('messageInputPoint.ts')
  const scaledWindow = {
    ...testWindow,
    x: 30,
    y: 40,
    width: 1000,
    height: 800,
    scaleFactor: 2
  }

  const point = getMessageInputClickPoint(scaledWindow)

  assert.equal(point.x, 690)
  assert.equal(point.y, 768)
}

function testMessageInputPointFollowsResizedWindowBounds() {
  const { getMessageInputClickPoint } = loadWechatNativeModule('messageInputPoint.ts')
  const smallWindow = { ...testWindow, width: 900, height: 700, scaleFactor: 1 }
  const tallWindow = { ...testWindow, width: 900, height: 860, scaleFactor: 1 }

  const smallPoint = getMessageInputClickPoint(smallWindow)
  const tallPoint = getMessageInputClickPoint(tallWindow)

  assert.equal(smallPoint.x, tallPoint.x)
  assert.equal(tallPoint.y - smallPoint.y, 160)
}

function testScreenPointKeepsPointWhenDisplayScaleIsOne() {
  const { toPhysicalScreenPoint } = loadWechatNativeModule('screenPoint.ts')
  const normalWindow = {
    ...testWindow,
    x: 136,
    y: 137,
    width: 757,
    height: 702,
    scaleFactor: 1
  }

  const point = toPhysicalScreenPoint(normalWindow, { x: 636, y: 781 })

  assert.deepEqual(point, { x: 636, y: 781 })
}

function testScreenPointConvertsWindowPointToPhysicalPointForScaledDisplay() {
  const { toPhysicalScreenPoint } = loadWechatNativeModule('screenPoint.ts')
  const scaledWindow = {
    ...testWindow,
    x: 160,
    y: 122,
    width: 757,
    height: 702,
    scaleFactor: 1.25
  }

  const point = toPhysicalScreenPoint(scaledWindow, { x: 660, y: 684 })

  assert.deepEqual(point, { x: 785, y: 825 })
}

function testMessageInputBackendsNormalizeClickPointBeforeNativeInput() {
  const win32Source = readFileSync(resolve('src/main/services/wechat-native/win32InputBackend.ts'), 'utf8')
  const powerShellSource = readFileSync(resolve('src/main/services/wechat-native/powerShellInputBackend.ts'), 'utf8')
  const win32PasteSource = win32Source.slice(win32Source.indexOf('async pasteAndSendText'), win32Source.indexOf('async pasteAndSendAttachments'))
  const powerShellPasteSource = powerShellSource.slice(powerShellSource.indexOf('async pasteAndSendText'), powerShellSource.indexOf('async pasteAndSendAttachments'))

  assert.match(win32PasteSource, /toPhysicalScreenPoint\(bounds,\s*inputPoint\)/)
  assert.match(powerShellPasteSource, /toPhysicalScreenPoint\(bounds,\s*inputPoint\)/)
  assert.match(powerShellPasteSource, /toPhysicalScreenPoint\(bounds,\s*sendPoint\)/)
}

function testUnreadConversationClickBackendsNormalizeClickPointBeforeNativeInput() {
  const win32Source = readFileSync(resolve('src/main/services/wechat-native/win32InputBackend.ts'), 'utf8')
  const powerShellSource = readFileSync(resolve('src/main/services/wechat-native/powerShellInputBackend.ts'), 'utf8')
  const win32ClickSource = win32Source.slice(win32Source.indexOf('async clickConversationCandidate'), win32Source.indexOf('async exitConversationToList'))
  const powerShellClickSource = powerShellSource.slice(powerShellSource.indexOf('async clickConversationCandidate'), powerShellSource.indexOf('async exitConversationToList'))

  assert.match(win32ClickSource, /toPhysicalScreenPoint\(bounds,\s*conversationPoint\)/)
  assert.match(powerShellClickSource, /toPhysicalScreenPoint\(bounds,\s*conversationPoint\)/)
}

function testUnreadConversationClickPointTargetsRowBodyInsteadOfRedBadge() {
  const { getUnreadConversationClickPoint } = loadWechatNativeModule('unreadConversationClickPoint.ts')
  const scaledWindow = {
    ...testWindow,
    x: 125,
    y: 76,
    width: 772,
    height: 771,
    scaleFactor: 1.25
  }
  const unreadBadgeCandidate = {
    id: 'unread-summer',
    x: 232,
    y: 164,
    width: 14,
    height: 14,
    centerX: 239,
    centerY: 171,
    score: 28
  }

  const point = getUnreadConversationClickPoint(scaledWindow, unreadBadgeCandidate)

  assert.ok(point.x >= unreadBadgeCandidate.centerX + 40)
  assert.ok(point.x < scaledWindow.x + scaledWindow.width * 0.38 - 24)
  assert.ok(point.y >= unreadBadgeCandidate.centerY + 24)
  assert.ok(point.y <= unreadBadgeCandidate.centerY + 36)
}

function testTextInputBackendsKeepClipboardLongEnoughForWechatPaste() {
  const win32Source = readFileSync(resolve('src/main/services/wechat-native/win32InputBackend.ts'), 'utf8')
  const powerShellSource = readFileSync(resolve('src/main/services/wechat-native/powerShellInputBackend.ts'), 'utf8')
  const win32PasteSource = win32Source.slice(win32Source.indexOf('async pasteAndSendText'), win32Source.indexOf('async pasteAndSendAttachments'))
  const powerShellPasteSource = powerShellSource.slice(powerShellSource.indexOf('async pasteAndSendText'), powerShellSource.indexOf('async pasteAndSendAttachments'))

  assert.match(win32PasteSource, /WECHAT_TEXT_PASTE_SETTLE_MS/)
  assert.match(powerShellPasteSource, /WECHAT_TEXT_PASTE_SETTLE_MS/)
  assert.match(win32PasteSource, /WECHAT_TEXT_SEND_SETTLE_MS/)
  assert.match(powerShellPasteSource, /WECHAT_TEXT_SEND_SETTLE_MS/)
}

function testWechatNativeDriverUsesScreenshotScaleForUnreadClickPath() {
  const driverSource = readFileSync(resolve('src/main/services/wechat-native/WeChatNativeDriver.ts'), 'utf8')
  const readSnapshotSource = driverSource.slice(driverSource.indexOf('private async readSnapshotIfChanged'), driverSource.indexOf('private normalizeBackendSnapshot'))

  assert.match(readSnapshotSource, /window\.scaleFactor\s*=\s*screenshot\.scaleFactor\s*\|\|\s*1/)
  assert.doesNotMatch(readSnapshotSource, /window\.scaleFactor\s*=\s*getWindowScreenScaleFactor\(window\)/)
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
testMessageInputPointUsesDynamicInputTopAfterResize()
testMessageInputPointIgnoresChatBubbleEdgeMisreadAsInputTop()
testMessageInputPointUsesRealWechatDebugInputTop()
testMessageInputPointFallsBackToScaledBottomOffset()
testMessageInputPointFollowsResizedWindowBounds()
testScreenPointKeepsPointWhenDisplayScaleIsOne()
testScreenPointConvertsWindowPointToPhysicalPointForScaledDisplay()
testMessageInputBackendsNormalizeClickPointBeforeNativeInput()
testUnreadConversationClickBackendsNormalizeClickPointBeforeNativeInput()
testUnreadConversationClickPointTargetsRowBodyInsteadOfRedBadge()
testTextInputBackendsKeepClipboardLongEnoughForWechatPaste()
testWechatNativeDriverUsesScreenshotScaleForUnreadClickPath()
