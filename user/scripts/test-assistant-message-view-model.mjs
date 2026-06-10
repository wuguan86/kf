import assert from 'node:assert/strict'
import fs from 'node:fs'
import Module from 'node:module'
import path from 'node:path'
import ts from 'typescript'

const rootDir = path.resolve(import.meta.dirname, '..')
const modulePath = path.join(rootDir, 'src', 'renderer', 'src', 'pages', 'assistantMessageViewModel.ts')

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

const {
  normalizeIncomingMessageType,
  shouldExtractImageForIncomingMessage,
  buildMessageDisplayPayload
} = testModule.exports

assert.equal(normalizeIncomingMessageType('text'), 'text')
assert.equal(normalizeIncomingMessageType('image'), 'image')
assert.equal(normalizeIncomingMessageType('sticker'), 'sticker')
assert.equal(normalizeIncomingMessageType('unknown'), 'text')

assert.equal(
  shouldExtractImageForIncomingMessage({
    content: '这草地就是昨天的公园呀',
    type: 'text',
    isSelf: false
  }),
  false,
  '后端判定为 text 的消息必须按文字展示，不能触发图片裁剪'
)

assert.equal(
  shouldExtractImageForIncomingMessage({
    content: '[图片]',
    type: 'text',
    isSelf: false
  }),
  false,
  '图片占位文本不能越过后端 type 判定自行触发图片裁剪'
)

assert.equal(
  shouldExtractImageForIncomingMessage({
    content: '[图片]',
    type: 'image',
    isSelf: false
  }),
  true,
  '只有后端判定为 image 的客户消息才触发图片裁剪'
)

assert.equal(
  shouldExtractImageForIncomingMessage({
    content: '这草地就是昨天的公园呀',
    type: 'image',
    isSelf: false
  }),
  false,
  '后端内容已经是文字时，即使 type 异常也不能按截图图片展示'
)

assert.equal(
  buildMessageDisplayPayload({
    content: '[图片]',
    type: 'image',
    imageDataUrl: ''
  }).displayText,
  '[图片]'
)

assert.equal(
  buildMessageDisplayPayload({
    content: '可以的，我把「橘猫」发您。',
    type: 'image',
    imageDataUrl: 'data:image/png;base64,abc'
  }).imageDataUrl,
  'data:image/png;base64,abc',
  '外发图片回显时，文案不是图片占位也要显示图片数据'
)

assert.equal(
  buildMessageDisplayPayload({
    content: '这草地就是昨天的公园呀',
    type: 'text',
    imageDataUrl: 'data:image/png;base64,abc'
  }).displayText,
  '这草地就是昨天的公园呀',
  '文本消息即使带有异常图片数据，也应优先展示后端文本'
)

console.log('assistant message view model tests passed')
