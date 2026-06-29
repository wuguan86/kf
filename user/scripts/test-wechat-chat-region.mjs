import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import ts from 'typescript'

const require = createRequire(import.meta.url)

function loadDetector(width, height, bitmap) {
  const source = readFileSync(resolve('src/main/services/wechat-native/chatRegionDetector.ts'), 'utf8')
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
      return {
        nativeImage: {
          createFromBuffer: () => ({
            isEmpty: () => false,
            getSize: () => ({ width, height }),
            toBitmap: () => bitmap
          })
        }
      }
    }
    return require(id)
  }
  const run = new Function('require', 'module', 'exports', compiled)
  run(localRequire, module, module.exports)
  return module.exports
}

function loadWindowCapture() {
  return require(resolve('scripts/wechat-window-capture.cjs'))
}

function createWechatLayoutBitmap(width, height, options = {}) {
  const listWidth = options.listWidth ?? Math.round(width * 0.47)
  const inputTop = options.inputTop ?? Math.round(height * 0.60)
  const contentRight = options.contentRight ?? width
  const bitmap = Buffer.alloc(width * height * 4, 248)
  const paintRect = (rect, color) => {
    for (let y = rect.y; y < rect.y + rect.height; y += 1) {
      for (let x = rect.x; x < rect.x + rect.width; x += 1) {
        const index = (y * width + x) * 4
        bitmap[index] = color[0]
        bitmap[index + 1] = color[1]
        bitmap[index + 2] = color[2]
        bitmap[index + 3] = 255
      }
    }
  }

  paintRect({ x: 0, y: 0, width, height }, [35, 35, 35])
  paintRect({ x: 0, y: 0, width: Math.min(listWidth, contentRight), height }, [236, 236, 236])
  paintRect({ x: listWidth, y: 0, width: 2, height }, [208, 208, 208])
  paintRect({ x: listWidth + 2, y: 0, width: contentRight - listWidth - 2, height: inputTop }, [238, 238, 238])
  paintRect({ x: listWidth + 2, y: inputTop, width: contentRight - listWidth - 2, height: 2 }, [214, 214, 214])
  paintRect({ x: listWidth + 2, y: inputTop + 2, width: contentRight - listWidth - 2, height: height - inputTop - 2 }, [251, 251, 251])
  if (options.chatContentEdgeX) {
    const edgeX = options.chatContentEdgeX
    paintRect({ x: edgeX, y: Math.round(height * 0.18), width: 3, height: Math.round(height * 0.58) }, [120, 120, 120])
    paintRect({ x: edgeX + 3, y: Math.round(height * 0.18), width: 70, height: Math.round(height * 0.58) }, [245, 245, 245])
  }
  return bitmap
}

function testDetectsChatRegionAcrossWindowSizes() {
  const cases = [
    { width: 1343, height: 728, listWidth: 702, inputTop: 442 },
    { width: 1600, height: 900, listWidth: 832, inputTop: 548 },
    { width: 1180, height: 760, listWidth: 612, inputTop: 468 },
    { width: 1600, height: 867, listWidth: 805, inputTop: 462 }
  ]

  for (const testCase of cases) {
    const bitmap = createWechatLayoutBitmap(testCase.width, testCase.height, {
      listWidth: testCase.listWidth,
      inputTop: testCase.inputTop
    })
    const { detectCurrentChatSnapshotRegion } = loadDetector(testCase.width, testCase.height, bitmap)
    const result = detectCurrentChatSnapshotRegion({
      png: Buffer.from(`window-${testCase.width}-${testCase.height}`),
      width: testCase.width,
      height: testCase.height,
      scaleFactor: 1
    })

    assert.equal(result.source, 'dynamic')
    assert.ok(result.region.x >= testCase.listWidth + 2, `expected region to start after sidebar, got ${result.region.x}`)
    assert.ok(result.region.x <= testCase.listWidth + 30, `expected region to stay inside chat body, got ${result.region.x}`)
    assert.ok(result.region.y >= 40, `expected region top to avoid extra header space, got ${result.region.y}`)
    assert.ok(result.region.y <= 120, `expected region top near chat header, got ${result.region.y}`)
    assert.ok(result.region.y + result.region.height <= testCase.inputTop + 4, `expected region to end above input box, got ${result.region.y + result.region.height}`)
  }
}

function testDetectsInputTopAfterWindowResizeMakesComposerHigher() {
  const width = 1600
  const height = 867
  const inputTop = 462
  const bitmap = createWechatLayoutBitmap(width, height, {
    listWidth: 805,
    inputTop
  })
  const { detectCurrentChatSnapshotRegion } = loadDetector(width, height, bitmap)
  const result = detectCurrentChatSnapshotRegion({ png: Buffer.from('resized-window'), width, height, scaleFactor: 1 })

  assert.equal(result.source, 'dynamic')
  assert.ok(result.region.y + result.region.height <= inputTop, `expected resized window region to end above input box, got ${result.region.y + result.region.height}`)
}

function testDetectsChatRegionWithDifferentDpiScale() {
  const bitmap = createWechatLayoutBitmap(1343, 728)
  const { detectCurrentChatSnapshotRegion } = loadDetector(1343, 728, bitmap)
  const base = detectCurrentChatSnapshotRegion({ png: Buffer.from('dpi-base-window'), width: 1343, height: 728, scaleFactor: 1 })
  const scaled = detectCurrentChatSnapshotRegion({ png: Buffer.from('dpi-scaled-window'), width: 1343, height: 728, scaleFactor: 1.5 })

  assert.equal(base.source, 'dynamic')
  assert.equal(scaled.source, 'dynamic')
  assert.ok(scaled.region.height <= base.region.height, 'expected higher DPI to shrink usable body height a bit')
  assert.equal(base.region.x, scaled.region.x)
  assert.equal(base.region.y, scaled.region.y)
}

function testKeepsScaledDpiPaddingAboveInputBox() {
  const width = 1600
  const height = 867
  const scaleFactor = 1.5
  const inputTop = 548
  const bitmap = createWechatLayoutBitmap(width, height, {
    listWidth: 832,
    inputTop
  })
  const { detectCurrentChatSnapshotRegion } = loadDetector(width, height, bitmap)
  const result = detectCurrentChatSnapshotRegion({ png: Buffer.from('dpi-padding-window'), width, height, scaleFactor })

  assert.equal(result.source, 'dynamic')
  assert.ok(Math.abs(result.inputTopY - inputTop) <= 2, `expected detected input top near ${inputTop}, got ${result.inputTopY}`)
  assert.ok(
    result.region.y + result.region.height <= result.inputTopY - Math.round(8 * scaleFactor),
    `expected region bottom to keep DPI scaled input padding, got ${result.region.y + result.region.height}`
  )
}

function testTrimsDarkPixelsOutsideWechatRightEdge() {
  const width = 744
  const height = 728
  const contentRight = 736
  const bitmap = createWechatLayoutBitmap(width, height, {
    listWidth: 263,
    inputTop: 615,
    contentRight
  })
  const { detectCurrentChatSnapshotRegion } = loadDetector(width, height, bitmap)
  const result = detectCurrentChatSnapshotRegion({ png: Buffer.from('right-edge-window'), width, height, scaleFactor: 1 })

  assert.equal(result.source, 'dynamic')
  assert.ok(result.region.x + result.region.width <= contentRight, `expected right edge outside dark captured pixels, got ${result.region.x + result.region.width}`)
  assert.ok(result.region.x + result.region.width >= contentRight - 6, `expected right edge to keep WeChat border, got ${result.region.x + result.region.width}`)
}

function testPrefersContinuousSidebarDividerOverChatContentEdge() {
  const width = 745
  const height = 728
  const listWidth = 250
  const bitmap = createWechatLayoutBitmap(width, height, {
    listWidth,
    inputTop: 588,
    chatContentEdgeX: 371,
    contentRight: 737
  })
  const { detectCurrentChatSnapshotRegion } = loadDetector(width, height, bitmap)
  const result = detectCurrentChatSnapshotRegion({ png: Buffer.from('content-edge-window'), width, height, scaleFactor: 1 })

  assert.equal(result.source, 'dynamic')
  assert.ok(result.region.x >= listWidth + 2, `expected region to start after sidebar divider, got ${result.region.x}`)
  assert.ok(result.region.x <= listWidth + 24, `expected region to keep left avatar area, got ${result.region.x}`)
}

function testPicksWechatWindowSourceInsteadOfFirstSource() {
  const { pickWeChatWindowSource } = loadWindowCapture()
  const sources = [
    { name: 'screen:0:0', thumbnail: { id: 'screen' } },
    { name: '寰俊', thumbnail: { id: 'wechat' } }
  ]
  const picked = pickWeChatWindowSource(sources, '寰俊')
  assert.equal(picked?.thumbnail.id, 'wechat')
}

testDetectsChatRegionAcrossWindowSizes()
testDetectsInputTopAfterWindowResizeMakesComposerHigher()
testDetectsChatRegionWithDifferentDpiScale()
testKeepsScaledDpiPaddingAboveInputBox()
testTrimsDarkPixelsOutsideWechatRightEdge()
testPrefersContinuousSidebarDividerOverChatContentEdge()
testPicksWechatWindowSourceInsteadOfFirstSource()
