import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import ts from 'typescript'

const require = createRequire(import.meta.url)

function loadReplyTiming() {
  const sourcePath = resolve('src/renderer/src/utils/replyTiming.ts')
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

function testLongRepliesWaitLongerThanShortReplies() {
  const { calculateHumanReplyDelayMs } = loadReplyTiming()
  const config = { replyIntervalStartSec: 1, replyIntervalEndSec: 1 }
  const shortDelay = calculateHumanReplyDelayMs('好的', config, () => 0)
  const longDelay = calculateHumanReplyDelayMs('好的，我这边已经帮您整理好了处理方案，稍后会按步骤继续跟进，并同步每一步的结果。', config, () => 0)

  assert.equal(shortDelay, 1_000)
  assert.ok(longDelay > shortDelay)
  assert.ok(longDelay <= 13_000)
}

testLongRepliesWaitLongerThanShortReplies()
