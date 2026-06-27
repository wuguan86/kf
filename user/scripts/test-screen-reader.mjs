import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import ts from 'typescript'

const require = createRequire(import.meta.url)

function loadScreenReader(electronMock) {
  const sourcePath = resolve('src/main/services/wechat-native/screenReader.ts')
  const source = readFileSync(sourcePath, 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true
    }
  }).outputText
  const module = { exports: {} }
  const localRequire = (id) => {
    if (id === 'electron') {
      return electronMock
    }
    return require(id)
  }
  const run = new Function('require', 'module', 'exports', compiled)
  run(localRequire, module, module.exports)
  return module.exports
}

async function testCaptureUsesWindowDisplayScaleFactor() {
  const cropRects = []
  const electronMock = {
    screen: {
      getPrimaryDisplay: () => ({ scaleFactor: 1, size: { width: 1920, height: 1080 } }),
      getDisplayMatching: () => ({ scaleFactor: 1.5, size: { width: 2560, height: 1440 } })
    },
    desktopCapturer: {
      getSources: async () => ([{
        thumbnail: {
          crop: (rect) => {
            cropRects.push(rect)
            return {
              toDataURL: () => 'data:image/png;base64,cropped',
              toPNG: () => Buffer.from('cropped'),
              getSize: () => ({ width: rect.width, height: rect.height })
            }
          }
        }
      }])
    }
  }
  const { captureWeChatWindow } = loadScreenReader(electronMock)

  const screenshot = await captureWeChatWindow({
    hwnd: 100,
    title: '微信',
    className: 'Weixin',
    processName: 'Weixin',
    x: 100,
    y: 200,
    width: 900,
    height: 700
  })

  assert.equal(screenshot.scaleFactor, 1.5)
  assert.deepEqual(cropRects[0], { x: 150, y: 300, width: 1350, height: 1050 })
}

await testCaptureUsesWindowDisplayScaleFactor()
