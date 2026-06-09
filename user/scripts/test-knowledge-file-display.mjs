import assert from 'node:assert/strict'
import fs from 'node:fs'
import Module from 'node:module'
import path from 'node:path'
import ts from 'typescript'

const rootDir = path.resolve(import.meta.dirname, '..')
const modulePath = path.join(rootDir, 'src', 'renderer', 'src', 'components', 'knowledge', 'knowledgeFileDisplay.ts')

const source = fs.readFileSync(modulePath, 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true
  }
}).outputText

const testModule = new Module(modulePath)
testModule.filename = modulePath
testModule.paths = Module._nodeModulePaths(path.dirname(modulePath))
testModule._compile(compiled, modulePath)

const { resolveKnowledgeFileDisplay } = testModule.exports

assert.deepEqual(
  resolveKnowledgeFileDisplay('清洗-抖音避雷.md'),
  { displayName: '抖音避雷.md', aiCleaned: true },
  'AI 清洗文件应去掉清洗前缀，并返回清洗标签状态'
)

assert.deepEqual(
  resolveKnowledgeFileDisplay('抖音避雷.md'),
  { displayName: '抖音避雷.md', aiCleaned: false },
  '普通文件名不能被误判为 AI 清洗文件'
)

assert.deepEqual(
  resolveKnowledgeFileDisplay('清洗-'),
  { displayName: '清洗-', aiCleaned: false },
  '空文件名边界不能显示 AI 清洗标签'
)

console.log('knowledge file display tests passed')
