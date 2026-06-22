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

testRegionDiffIgnoresConversationListChanges()
testRegionDiffDetectsCurrentChatChanges()
