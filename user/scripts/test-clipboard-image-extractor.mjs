import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import ts from 'typescript'

const require = createRequire(import.meta.url)

function loadService() {
  const sourcePath = resolve('src/main/services/WeChatClipboardImageExtractor.ts')
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

function createImage(dataUrl) {
  return {
    isEmpty: () => !dataUrl,
    toDataURL: () => dataUrl
  }
}

function createClipboard({ backupText = '', backupHtml = '', backupImage = '', copiedImage = '' } = {}) {
  const operations = []
  let cleared = false
  let pollCount = 0

  return {
    operations,
    clipboard: {
      readText: () => {
        operations.push('readText')
        return backupText
      },
      readHTML: () => {
        operations.push('readHTML')
        return backupHtml
      },
      readImage: () => {
        operations.push('readImage')
        if (!cleared) {
          return createImage(backupImage)
        }
        pollCount += 1
        return createImage(pollCount >= 2 ? copiedImage : '')
      },
      writeText: (value) => operations.push(`writeText:${value}`),
      writeHTML: (value) => operations.push(`writeHTML:${value}`),
      writeImage: (value) => operations.push(`writeImage:${value.toDataURL()}`),
      clear: () => {
        operations.push('clear')
        cleared = true
      }
    }
  }
}

async function testCopiesImageAndRestoresClipboard() {
  const { WeChatClipboardImageExtractor } = loadService()
  const { clipboard, operations } = createClipboard({
    backupText: '原剪贴板文本',
    backupHtml: '<b>原剪贴板</b>',
    backupImage: 'data:image/png;base64,old',
    copiedImage: 'data:image/png;base64,new'
  })
  const commands = []
  const extractor = new WeChatClipboardImageExtractor({
    clipboard,
    executeWeChatCommand: async (payload) => {
      operations.push(`command:${payload.action}`)
      commands.push(payload)
      return { ok: true }
    },
    sleep: async () => {
      operations.push('sleep')
    }
  })

  const result = await extractor.extractImage({
    senderId: '夏天',
    messageUiId: [42, 7],
    timestamp: 1710000000000,
    timeoutMs: 1000,
    pollIntervalMs: 10
  })

  assert.equal(result, 'data:image/png;base64,new')
  assert.deepEqual(commands, [{
    action: 'copy_image_message',
    target: '夏天',
    messageUiId: [42, 7],
    timestamp: 1710000000000
  }])
  assert.ok(operations.indexOf('clear') < operations.indexOf('command:copy_image_message'))
  assert.ok(operations.includes('writeText:原剪贴板文本'))
  assert.ok(operations.includes('writeHTML:<b>原剪贴板</b>'))
  assert.ok(operations.includes('writeImage:data:image/png;base64,old'))
}

async function testRestoresClipboardWhenCopyFails() {
  const { WeChatClipboardImageExtractor } = loadService()
  const { clipboard, operations } = createClipboard({
    backupText: '原剪贴板文本'
  })
  const extractor = new WeChatClipboardImageExtractor({
    clipboard,
    executeWeChatCommand: async () => {
      operations.push('command:copy_image_message')
      return { ok: false, error: 'copy_failed' }
    },
    sleep: async () => {}
  })

  await assert.rejects(
    () => extractor.extractImage({ senderId: '夏天', timeoutMs: 100, pollIntervalMs: 10 }),
    /复制微信图片失败/
  )
  assert.ok(operations.includes('writeText:原剪贴板文本'))
}

async function testUsesSidecarScreenshotFallbackBeforeClipboardPolling() {
  const { WeChatClipboardImageExtractor } = loadService()
  const { clipboard, operations } = createClipboard({
    backupText: '原剪贴板文本'
  })
  const extractor = new WeChatClipboardImageExtractor({
    clipboard,
    executeWeChatCommand: async () => {
      operations.push('command:copy_image_message')
      return { ok: true, strategy: 'screenshot_fallback', dataUrl: 'data:image/png;base64,screenshot' }
    },
    sleep: async () => {
      operations.push('sleep')
    }
  })

  const result = await extractor.extractImage({ senderId: '夏天', timeoutMs: 100, pollIntervalMs: 10 })

  assert.equal(result, 'data:image/png;base64,screenshot')
  assert.equal(operations.includes('sleep'), false)
  assert.ok(operations.includes('writeText:原剪贴板文本'))
}

await testCopiesImageAndRestoresClipboard()
await testRestoresClipboardWhenCopyFails()
await testUsesSidecarScreenshotFallbackBeforeClipboardPolling()
