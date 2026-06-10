import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import ts from 'typescript'

const __dirname = dirname(fileURLToPath(import.meta.url))
const sourcePath = resolve(__dirname, '../src/renderer/src/pages/mePageUtils.ts')

assert.equal(existsSync(sourcePath), true, 'mePageUtils.ts should exist')

const source = readFileSync(sourcePath, 'utf8')
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020
  }
}).outputText

const context = {
  exports: {},
  module: { exports: {} }
}
context.exports = context.module.exports
vm.runInNewContext(transpiled, context, { filename: sourcePath })

const { buildAvatarSrc } = context.module.exports

assert.equal(
  buildAvatarSrc('https://bot.toutouapp.cn/api', '/api/user/avatar/a.png'),
  'https://bot.toutouapp.cn/api/user/avatar/a.png'
)
assert.equal(
  buildAvatarSrc('https://bot.toutouapp.cn/', 'api/user/avatar/a.png'),
  'https://bot.toutouapp.cn/api/user/avatar/a.png'
)
assert.equal(
  buildAvatarSrc('', '/api/user/avatar/a.png'),
  '/api/user/avatar/a.png'
)
assert.equal(
  buildAvatarSrc('https://bot.toutouapp.cn/api', 'https://third.example.com/a.png'),
  'https://third.example.com/a.png'
)

console.log('个人中心头像地址测试通过')
