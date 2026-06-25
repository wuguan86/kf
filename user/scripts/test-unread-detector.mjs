import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import ts from 'typescript'

const require = createRequire(import.meta.url)

function createBitmap(width, height) {
  const bitmap = Buffer.alloc(width * height * 4, 255)
  return {
    bitmap,
    fillRect(left, top, rectWidth, rectHeight, color) {
      for (let y = top; y < top + rectHeight; y += 1) {
        for (let x = left; x < left + rectWidth; x += 1) {
          const index = (y * width + x) * 4
          bitmap[index] = color.blue
          bitmap[index + 1] = color.green
          bitmap[index + 2] = color.red
          bitmap[index + 3] = 255
        }
      }
    },
    drawRedSquare(left, top, size) {
      for (let y = top; y < top + size; y += 1) {
        for (let x = left; x < left + size; x += 1) {
          const index = (y * width + x) * 4
          bitmap[index] = 40
          bitmap[index + 1] = 40
          bitmap[index + 2] = 230
          bitmap[index + 3] = 255
        }
      }
    }
  }
}

function loadUnreadDetector(width, height, bitmap) {
  const sourcePath = resolve('src/main/services/wechat-native/unreadDetector.ts')
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

function testFindsUnreadRedDotInConversationList() {
  const width = 400
  const height = 300
  const image = createBitmap(width, height)
  image.drawRedSquare(53, 62, 10)
  const { findUnreadConversationCandidates } = loadUnreadDetector(width, height, image.bitmap)

  const candidates = findUnreadConversationCandidates(
    { dataUrl: '', png: Buffer.from('mock'), width, height },
    { hwnd: 1, title: '微信', className: 'Weixin', processName: 'Weixin', x: 10, y: 20, width: 800, height: 600 },
    'personal'
  )

  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].centerX, 126)
  assert.equal(candidates[0].centerY, 154)
}

function testIgnoresRedDotOutsideConversationList() {
  const width = 400
  const height = 300
  const image = createBitmap(width, height)
  image.drawRedSquare(260, 72, 10)
  const { findUnreadConversationCandidates } = loadUnreadDetector(width, height, image.bitmap)

  const candidates = findUnreadConversationCandidates(
    { dataUrl: '', png: Buffer.from('mock'), width, height },
    { hwnd: 1, title: '微信', className: 'Weixin', processName: 'Weixin', x: 10, y: 20, width: 800, height: 600 },
    'personal'
  )

  assert.deepEqual(candidates, [])
}

function testIgnoresLargeRedAvatarBlockInConversationList() {
  const width = 400
  const height = 300
  const image = createBitmap(width, height)
  image.drawRedSquare(72, 120, 34)
  const { findUnreadConversationCandidates } = loadUnreadDetector(width, height, image.bitmap)

  const candidates = findUnreadConversationCandidates(
    { dataUrl: '', png: Buffer.from('mock'), width, height },
    { hwnd: 1, title: '寰俊', className: 'Weixin', processName: 'Weixin', x: 10, y: 20, width: 800, height: 600 },
    'personal'
  )

  assert.deepEqual(candidates, [])
}

function testIgnoresSmallRedIconInsideAvatarArea() {
  const width = 400
  const height = 300
  const image = createBitmap(width, height)
  image.drawRedSquare(42, 72, 8)
  const { findUnreadConversationCandidates } = loadUnreadDetector(width, height, image.bitmap)

  const candidates = findUnreadConversationCandidates(
    { dataUrl: '', png: Buffer.from('mock'), width, height },
    { hwnd: 1, title: '微信', className: 'Weixin', processName: 'Weixin', x: 10, y: 20, width: 800, height: 600 },
    'personal'
  )

  assert.deepEqual(candidates, [])
}

function testKeepsUnreadRedDotWhenLeftSidebarHasGreenIcon() {
  const width = 400
  const height = 300
  const image = createBitmap(width, height)
  image.fillRect(8, 54, 18, 36, { red: 7, green: 193, blue: 96 })
  image.drawRedSquare(53, 62, 10)
  const { findUnreadConversationCandidates } = loadUnreadDetector(width, height, image.bitmap)

  const candidates = findUnreadConversationCandidates(
    { dataUrl: '', png: Buffer.from('mock'), width, height },
    { hwnd: 1, title: '寰俊', className: 'Weixin', processName: 'Weixin', x: 10, y: 20, width: 800, height: 600 },
    'personal'
  )

  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].centerX, 126)
  assert.equal(candidates[0].centerY, 154)
}

function testIgnoresRedIconInsideSelectedConversationRow() {
  const width = 400
  const height = 300
  const image = createBitmap(width, height)
  image.fillRect(30, 62, 120, 44, { red: 7, green: 193, blue: 96 })
  image.drawRedSquare(118, 76, 8)
  const { findUnreadConversationCandidates } = loadUnreadDetector(width, height, image.bitmap)

  const candidates = findUnreadConversationCandidates(
    { dataUrl: '', png: Buffer.from('mock'), width, height },
    { hwnd: 1, title: '微信', className: 'Weixin', processName: 'Weixin', x: 10, y: 20, width: 800, height: 600 },
    'personal'
  )

  assert.deepEqual(candidates, [])
}

testFindsUnreadRedDotInConversationList()
testIgnoresRedDotOutsideConversationList()
testIgnoresLargeRedAvatarBlockInConversationList()
testIgnoresSmallRedIconInsideAvatarArea()
testKeepsUnreadRedDotWhenLeftSidebarHasGreenIcon()
testIgnoresRedIconInsideSelectedConversationRow()
