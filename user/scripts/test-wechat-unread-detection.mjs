import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import ts from 'typescript'

const require = createRequire(import.meta.url)

function createBitmap(width, height) {
  const bitmap = Buffer.alloc(width * height * 4)
  for (let index = 0; index < bitmap.length; index += 4) {
    bitmap[index] = 240
    bitmap[index + 1] = 240
    bitmap[index + 2] = 240
    bitmap[index + 3] = 255
  }
  return bitmap
}

function paintUnreadBadge(bitmap, imageWidth, centerX, centerY, radius) {
  for (let y = centerY - radius; y <= centerY + radius; y += 1) {
    for (let x = centerX - radius; x <= centerX + radius; x += 1) {
      const horizontalDistance = x - centerX
      const verticalDistance = y - centerY
      if (horizontalDistance * horizontalDistance + verticalDistance * verticalDistance > radius * radius) {
        continue
      }
      const index = (y * imageWidth + x) * 4
      // Electron 位图为 BGRA，颜色接近微信未读角标。
      bitmap[index] = 68
      bitmap[index + 1] = 76
      bitmap[index + 2] = 238
      bitmap[index + 3] = 255
    }
  }
}

function loadUnreadDetector(bitmap, width, height) {
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

function loadPointModule(relativePath) {
  const sourcePath = resolve('src/main/services/wechat-native', relativePath)
  const source = readFileSync(sourcePath, 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true
    }
  }).outputText
  const module = { exports: {} }
  const run = new Function('require', 'module', 'exports', compiled)
  run(require, module, module.exports)
  return module.exports
}

function createWindow(width, height) {
  return {
    hwnd: 100,
    title: '微信',
    className: 'Qt51514QWindowIcon',
    processName: 'Weixin',
    x: 160,
    y: 120,
    width,
    height
  }
}

function testFindsMultipleVisibleUnreadBadges() {
  const width = 1000
  const height = 800
  const bitmap = createBitmap(width, height)
  paintUnreadBadge(bitmap, width, 150, 160, 8)
  paintUnreadBadge(bitmap, width, 150, 260, 8)
  const { findUnreadConversationCandidates } = loadUnreadDetector(bitmap, width, height)

  const candidates = findUnreadConversationCandidates({
    dataUrl: 'data:image/png;base64=multiple-unread',
    png: Buffer.from('multiple-unread'),
    width,
    height,
    scaleFactor: 1
  }, createWindow(width, height), 'personal')

  assert.equal(candidates.length, 2)
  assert.ok(candidates[0].centerY < candidates[1].centerY)
  assert.ok(candidates.every((candidate) => candidate.centerX >= 300 && candidate.centerX <= 320))
}

function testMaps125PercentScreenshotBadgeBackToLogicalWindowPoint() {
  const logicalWidth = 800
  const logicalHeight = 640
  const imageWidth = 1000
  const imageHeight = 800
  const bitmap = createBitmap(imageWidth, imageHeight)
  paintUnreadBadge(bitmap, imageWidth, 150, 200, 10)
  const { findUnreadConversationCandidates } = loadUnreadDetector(bitmap, imageWidth, imageHeight)

  const candidates = findUnreadConversationCandidates({
    dataUrl: 'data:image/png;base64=dpi-125-unread',
    png: Buffer.from('dpi-125-unread'),
    width: imageWidth,
    height: imageHeight,
    scaleFactor: 1.25
  }, createWindow(logicalWidth, logicalHeight), 'personal')

  assert.equal(candidates.length, 1)
  assert.ok(Math.abs(candidates[0].centerX - 280) <= 1)
  assert.ok(Math.abs(candidates[0].centerY - 280) <= 1)
}

function testConvertsUnreadRowClickTo125PercentPhysicalPoint() {
  const { getUnreadConversationClickPoint } = loadPointModule('unreadConversationClickPoint.ts')
  const { toPhysicalScreenPoint } = loadPointModule('screenPoint.ts')
  const bounds = { ...createWindow(800, 640), scaleFactor: 1.25 }
  const logicalClickPoint = getUnreadConversationClickPoint(bounds, {
    id: 'unread-dpi-125',
    x: 272,
    y: 272,
    width: 16,
    height: 16,
    centerX: 280,
    centerY: 280,
    score: 143
  })

  assert.deepEqual(logicalClickPoint, { x: 352, y: 310 })
  assert.deepEqual(toPhysicalScreenPoint(bounds, logicalClickPoint), { x: 400, y: 358 })
}

testFindsMultipleVisibleUnreadBadges()
testMaps125PercentScreenshotBadgeBackToLogicalWindowPoint()
testConvertsUnreadRowClickTo125PercentPhysicalPoint()
