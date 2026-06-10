import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import ts from 'typescript'

const __dirname = dirname(fileURLToPath(import.meta.url))
const sourcePath = resolve(__dirname, '../src/renderer/src/pages/outboundMaterialUtils.ts')

assert.equal(existsSync(sourcePath), true, 'outboundMaterialUtils.ts should exist')

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

const {
  buildMaterialDownloadPath,
  isImageMaterial,
  parseMaterialTags,
  serializeMaterialTags
} = context.module.exports

assert.equal(JSON.stringify(parseMaterialTags(' 报价,售后，案例\n报价 ')), JSON.stringify(['报价', '售后', '案例']))
assert.equal(serializeMaterialTags(['报价', ' 售后 ', '报价', '']), '报价,售后')
assert.equal(isImageMaterial({ fileType: 'IMAGE' }), true)
assert.equal(isImageMaterial({ mimeType: 'image/png' }), true)
assert.equal(isImageMaterial({ extension: 'webp' }), true)
assert.equal(isImageMaterial({ fileType: 'FILE', extension: 'pdf' }), false)
assert.equal(buildMaterialDownloadPath('100 20'), '/api/user/outbound-materials/100%2020/download')

console.log('外发素材工具测试通过')
