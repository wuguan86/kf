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
const aiProfileFile = path.join(
  root,
  'src',
  'renderer',
  'src',
  'pages',
  'smart-sales',
  'AiProfileSection.tsx'
)
const basicInfoFile = path.join(
  root,
  'src',
  'renderer',
  'src',
  'pages',
  'smart-sales',
  'BasicInfoSection.tsx'
)
const salesIntentFile = path.join(
  root,
  'src',
  'renderer',
  'src',
  'pages',
  'smart-sales',
  'SalesIntentSection.tsx'
)

const apiSource = fs.readFileSync(apiFile, 'utf8')
const detailSource = fs.readFileSync(detailFile, 'utf8')
const cssSource = fs.readFileSync(cssFile, 'utf8')
const aiProfileSource = fs.readFileSync(aiProfileFile, 'utf8')
const basicInfoSource = fs.readFileSync(basicInfoFile, 'utf8')
const salesIntentSource = fs.readFileSync(salesIntentFile, 'utf8')

function assertIncludes(source, expected, file) {
  if (!source.includes(expected)) {
    throw new Error(`${file} 缺少预期内容：${expected}`)
  }
}

for (const field of ['budgetDesc', 'timeDesc', 'painPoints', 'competitors']) {
  assertIncludes(apiSource, `${field}: string | null`, 'smartSales.ts')
}

for (const label of ['预算描述', '购买时间', '核心痛点', '提及竞品', '最近事件']) {
  assertIncludes(salesIntentSource, label, 'SalesIntentSection.tsx')
}

assertIncludes(salesIntentSource, 'SalesInsightSection', 'SalesIntentSection.tsx')
assertIncludes(apiSource, 'basicInfoSuggestion: BasicInfoSuggestion | null', 'smartSales.ts')
assertIncludes(apiSource, 'communicationStyle: string | null', 'smartSales.ts')
assertIncludes(apiSource, 'confirmBasicInfo', 'smartSales.ts')
assertIncludes(apiSource, 'updateAiProfile', 'smartSales.ts')
assertIncludes(detailSource, 'BasicInfoSection', 'CustomerProfileDetail.tsx')
assertIncludes(aiProfileSource, 'AI 沟通辅助画像', 'AiProfileSection.tsx')
assertIncludes(basicInfoSource, 'AI 提取结果需人工确认后存入', 'BasicInfoSection.tsx')
assertIncludes(salesIntentSource, 'salesInsightEmpty', 'SalesIntentSection.tsx')
assertIncludes(detailSource, '暂无', 'CustomerProfileDetail.tsx')
assertIncludes(cssSource, '.salesInsightGrid', 'CustomerProfileDetail.module.css')
assertIncludes(cssSource, '.salesInsightEmpty', 'CustomerProfileDetail.module.css')

console.log('智能销售客户详情字段展示检查通过')
