import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const pageFile = path.join(
  root,
  'src',
  'renderer',
  'src',
  'pages',
  'smart-sales',
  'SmartSalesPage.tsx'
)

const source = fs.readFileSync(pageFile, 'utf8')

function assertIncludes(expected, message) {
  if (!source.includes(expected)) {
    throw new Error(message)
  }
}

function assertNotIncludes(unexpected, message) {
  if (source.includes(unexpected)) {
    throw new Error(message)
  }
}

assertIncludes(
  'const loadList = async (page: number, filters = applied)',
  '客户列表加载函数必须支持显式传入本次查询条件，避免读取到旧的 React 状态'
)
assertIncludes(
  'const nextApplied = { keyword, intentLevel, stage, starred }',
  '查询按钮必须先构造本次条件快照'
)
assertIncludes(
  'loadList(1, nextApplied)',
  '查询按钮必须使用本次条件快照立即加载列表'
)
assertIncludes(
  'const nextApplied = { keyword: \'\', intentLevel: \'\', stage: \'\', starred: \'\' }',
  '重置按钮必须构造空条件快照'
)
assertIncludes(
  'loadList(1, nextApplied)',
  '重置按钮必须使用空条件快照立即加载列表'
)
assertNotIncludes(
  'setTimeout(() => loadList(1), 0)',
  '重置查询不能依赖 setTimeout 等待状态更新'
)

console.log('智能销售客户列表查询条件即时生效检查通过')
