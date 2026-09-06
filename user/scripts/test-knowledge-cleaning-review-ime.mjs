import assert from 'node:assert/strict'
import fs from 'node:fs'
import Module from 'node:module'
import { createRequire } from 'node:module'
import path from 'node:path'
import ts from 'typescript'

const rootDir = path.resolve(import.meta.dirname, '..')
const componentPath = path.join(
  rootDir,
  'src',
  'renderer',
  'src',
  'components',
  'knowledge',
  'KnowledgeCleaningReviewTable.tsx'
)

const source = fs.readFileSync(componentPath, 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
    jsx: ts.JsxEmit.ReactJSX
  }
}).outputText

const originalModuleLoad = Module._load
const originalCssLoader = Module._extensions['.css']
const require = createRequire(import.meta.url)
const realReact = require('react')

Module._load = function loadModule(request, parent, isMain) {
  if (request === 'react') {
    return {
      ...realReact,
      useEffect: () => undefined,
      useState: () => [0, () => undefined]
    }
  }
  return originalModuleLoad(request, parent, isMain)
}

Module._extensions['.css'] = (module) => {
  module.exports = new Proxy({}, {
    get: (_, property) => String(property)
  })
}

try {
  const testModule = new Module(componentPath)
  testModule.filename = componentPath
  testModule.paths = Module._nodeModulePaths(path.dirname(componentPath))
  testModule._compile(compiled, componentPath)

  const KnowledgeCleaningReviewTable = testModule.exports.default
  const createItems = (question) => [{
    questions: [question],
    answer: '测试答案',
    status: 'NORMAL',
    warning: ''
  }]

  const beforeComposition = KnowledgeCleaningReviewTable({
    items: createItems('pin'),
    onChange: () => undefined
  })
  const duringComposition = KnowledgeCleaningReviewTable({
    items: createItems('拼'),
    onChange: () => undefined
  })

  assert.deepEqual(
    collectElementKeys(duringComposition),
    collectElementKeys(beforeComposition),
    '问题文本变化时必须保持元素身份稳定，避免中文输入法组合态被组件重建打断'
  )

  console.log('knowledge cleaning review IME tests passed')
} finally {
  Module._load = originalModuleLoad
  if (originalCssLoader) {
    Module._extensions['.css'] = originalCssLoader
  } else {
    delete Module._extensions['.css']
  }
}

function collectElementKeys(node) {
  if (!realReact.isValidElement(node)) return []

  const keys = node.key === null ? [] : [node.key]
  return realReact.Children.toArray(node.props.children).reduce(
    (result, child) => result.concat(collectElementKeys(child)),
    keys
  )
}
