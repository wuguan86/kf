import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const apiFile = path.join(root, 'src', 'renderer', 'src', 'api', 'smartSales.ts')
const detailFile = path.join(
  root,
  'src',
  'renderer',
  'src',
  'pages',
  'smart-sales',
  'CustomerProfileDetail.tsx'
)
const cssFile = path.join(
  root,
  'src',
  'renderer',
  'src',
  'pages',
  'smart-sales',
  'CustomerProfileDetail.module.css'
)

const apiSource = fs.readFileSync(apiFile, 'utf8')
const detailSource = fs.readFileSync(detailFile, 'utf8')
const cssSource = fs.readFileSync(cssFile, 'utf8')

function assertIncludes(source, expected, file) {
  if (!source.includes(expected)) {
    throw new Error(`${file} 缺少预期内容：${expected}`)
  }
}

for (const field of ['budgetDesc', 'timeDesc', 'painPoints', 'competitors']) {
  assertIncludes(apiSource, `${field}: string | null`, 'smartSales.ts')
}

for (const label of ['预算描述', '购买时间', '核心痛点', '提及竞品', '最近事件']) {
  assertIncludes(detailSource, label, 'CustomerProfileDetail.tsx')
}

assertIncludes(detailSource, 'SalesInsightSection', 'CustomerProfileDetail.tsx')
assertIncludes(detailSource, 'salesInsightEmpty', 'CustomerProfileDetail.tsx')
assertIncludes(detailSource, '暂无', 'CustomerProfileDetail.tsx')
assertIncludes(cssSource, '.salesInsightGrid', 'CustomerProfileDetail.module.css')
assertIncludes(cssSource, '.salesInsightEmpty', 'CustomerProfileDetail.module.css')

console.log('智能销售客户详情字段展示检查通过')
