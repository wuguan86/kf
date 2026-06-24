import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import ts from 'typescript'

const require = createRequire(import.meta.url)

function createBitmap(width, height, changedArea) {
  const bitmap = Buffer.alloc(width * height * 4, 255)
  if (!changedArea) {
    return bitmap
  }
  const startX = Math.max(0, changedArea.x)
  const startY = Math.max(0, changedArea.y)
  const endX = Math.min(width, changedArea.x + changedArea.width)
  const endY = Math.min(height, changedArea.y + changedArea.height)
  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const index = (y * width + x) * 4
      bitmap[index] = 40
      bitmap[index + 1] = 40
      bitmap[index + 2] = 40
      bitmap[index + 3] = 255
    }
  }
  return bitmap
}

function loadSnapshotDiff(width, height, bitmapsByMarker) {
  const sourcePath = resolve('src/main/services/wechat-native/snapshotDiff.ts')
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
      return {
        nativeImage: {
          createFromBuffer: (buffer) => {
            const marker = buffer.toString()
            const bitmap = bitmapsByMarker.get(marker)
            return {
              isEmpty: () => !bitmap,
              getSize: () => ({ width, height }),
              toBitmap: () => bitmap || Buffer.alloc(0)
            }
          }
        }
      }
    }
    return require(id)
  }
  const run = new Function('require', 'module', 'exports', compiled)
  run(localRequire, module, module.exports)
  return module.exports
}

function loadChatRegionDetector(width, height, bitmapsByMarker) {
  const sourcePath = resolve('src/main/services/wechat-native/chatRegionDetector.ts')
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
      return {
        nativeImage: {
          createFromBuffer: (buffer) => {
            const marker = buffer.toString()
            const bitmap = bitmapsByMarker.get(marker)
            return {
              isEmpty: () => !bitmap,
              getSize: () => ({ width, height }),
              toBitmap: () => bitmap || Buffer.alloc(0)
            }
          }
        }
      }
    }
    return require(id)
  }
  const run = new Function('require', 'module', 'exports', compiled)
  run(localRequire, module, module.exports)
  return module.exports
}

function paintRect(bitmap, width, rect, color) {
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

function createWechatLayoutBitmap(width, height, options = {}) {
  const listWidth = options.listWidth ?? 342
  const inputTop = options.inputTop ?? 574
  const bitmap = Buffer.alloc(width * height * 4, 245)
  paintRect(bitmap, width, { x: 0, y: 0, width: listWidth, height }, [236, 236, 236])
  paintRect(bitmap, width, { x: listWidth, y: 0, width: 2, height }, [210, 210, 210])
  paintRect(bitmap, width, { x: listWidth + 2, y: 0, width: width - listWidth - 2, height: inputTop }, [248, 248, 248])
  paintRect(bitmap, width, { x: listWidth + 2, y: inputTop, width: width - listWidth - 2, height: 2 }, [214, 214, 214])
  paintRect(bitmap, width, { x: listWidth + 2, y: inputTop + 2, width: width - listWidth - 2, height: height - inputTop - 2 }, [250, 250, 250])
  return bitmap
}

function testRegionDiffIgnoresConversationListChanges() {
  const width = 900
  const height = 700
  const previous = createBitmap(width, height)
  const current = createBitmap(width, height, { x: 0, y: 80, width: 320, height: 520 })
  const bitmaps = new Map([
    ['previous', previous],
    ['current-left-list', current]
  ])
  const { comparePngSnapshots, comparePngSnapshotRegion } = loadSnapshotDiff(width, height, bitmaps)

  const fullDiff = comparePngSnapshots(Buffer.from('previous'), Buffer.from('current-left-list'))
  const chatDiff = comparePngSnapshotRegion(
    Buffer.from('previous'),
    Buffer.from('current-left-list'),
    { x: 342, y: 70, width: 558, height: 504 },
    0.002
  )

  assert.equal(fullDiff.changed, true)
  assert.equal(chatDiff.changed, false)
  assert.equal(chatDiff.changedRatio, 0)
}

function testRegionDiffDetectsCurrentChatChanges() {
  const width = 900
  const height = 700
  const previous = createBitmap(width, height)
  const current = createBitmap(width, height, { x: 520, y: 480, width: 160, height: 80 })
  const bitmaps = new Map([
    ['previous', previous],
    ['current-chat', current]
  ])
  const { comparePngSnapshotRegion } = loadSnapshotDiff(width, height, bitmaps)

  const chatDiff = comparePngSnapshotRegion(
    Buffer.from('previous'),
    Buffer.from('current-chat'),
    { x: 342, y: 70, width: 558, height: 504 },
    0.002
  )

  assert.equal(chatDiff.changed, true)
  assert.ok(chatDiff.changedRatio >= 0.002)
}

function testDynamicChatRegionFollowsWideContactList() {
  const width = 900
  const height = 700
  const bitmap = createWechatLayoutBitmap(width, height, { listWidth: 456, inputTop: 548 })
  const bitmaps = new Map([['wide-list-layout', bitmap]])
  const { detectCurrentChatSnapshotRegion } = loadChatRegionDetector(width, height, bitmaps)

  const detection = detectCurrentChatSnapshotRegion({
    png: Buffer.from('wide-list-layout'),
    dataUrl: '',
    width,
    height,
    scaleFactor: 1
  })

  assert.equal(detection.source, 'dynamic')
  assert.ok(detection.region.x >= 450, `expected chat region to start after wide contact list, got ${detection.region.x}`)
  assert.ok(detection.region.x <= 470, `expected chat region near detected splitter, got ${detection.region.x}`)
}

function testDynamicChatRegionExcludesInputCaretBlink() {
  const width = 900
  const height = 700
  const previous = createWechatLayoutBitmap(width, height, { listWidth: 342, inputTop: 480 })
  const current = Buffer.from(previous)
  paintRect(current, width, { x: 610, y: 610, width: 2, height: 34 }, [20, 20, 20])
  const bitmaps = new Map([
    ['previous-layout', previous],
    ['current-caret-blink', current]
  ])
  const { comparePngSnapshotRegion } = loadSnapshotDiff(width, height, bitmaps)
  const { detectCurrentChatSnapshotRegion } = loadChatRegionDetector(width, height, bitmaps)
  const detection = detectCurrentChatSnapshotRegion({
    png: Buffer.from('previous-layout'),
    dataUrl: '',
    width,
    height,
    scaleFactor: 1
  })

  const chatDiff = comparePngSnapshotRegion(
    Buffer.from('previous-layout'),
    Buffer.from('current-caret-blink'),
    detection.region,
    0.002
  )

  assert.equal(detection.source, 'dynamic')
  assert.ok(detection.region.y + detection.region.height <= 472, `expected chat region to end above input box, got ${detection.region.y + detection.region.height}`)
  assert.equal(chatDiff.changed, false)
  assert.equal(chatDiff.changedRatio, 0)
}

testRegionDiffIgnoresConversationListChanges()
testRegionDiffDetectsCurrentChatChanges()
testDynamicChatRegionFollowsWideContactList()
testDynamicChatRegionExcludesInputCaretBlink()
