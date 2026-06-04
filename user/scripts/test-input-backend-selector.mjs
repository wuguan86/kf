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

await testUsesNativeBackendFirstOnWindows()
await testFallsBackWhenNativeBackendThrows()
await testUsesFallbackOutsideWindows()
