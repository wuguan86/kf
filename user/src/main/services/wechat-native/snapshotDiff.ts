import { createHash } from 'crypto'
import { nativeImage } from 'electron'

const PIXEL_DIFF_THRESHOLD = 30
const CHANGE_RATIO_THRESHOLD = 0.015
const PIXEL_SAMPLE_STEP = 24

export type SnapshotDiffResult = {
  changed: boolean
  digest: string
  changedRatio: number
}

export const calculateSnapshotDigest = (png: Buffer): string => {
  return createHash('sha256').update(png).digest('hex')
}

const compareBitmapSnapshots = (previous: Buffer, current: Buffer): number | null => {
  const previousImage = nativeImage.createFromBuffer(previous)
  const currentImage = nativeImage.createFromBuffer(current)
  const previousSize = previousImage.getSize()
  const currentSize = currentImage.getSize()
  if (
    previousImage.isEmpty() ||
    currentImage.isEmpty() ||
    previousSize.width !== currentSize.width ||
    previousSize.height !== currentSize.height
  ) {
    return null
  }

  const previousBitmap = previousImage.toBitmap()
  const currentBitmap = currentImage.toBitmap()
  const sampleLength = Math.min(previousBitmap.length, currentBitmap.length)
  if (sampleLength === 0 || previousBitmap.length !== currentBitmap.length) {
    return null
  }

  let total = 0
  let changed = 0
  for (let index = 0; index < sampleLength; index += PIXEL_SAMPLE_STEP * 4) {
    total += 1
    const blueDiff = Math.abs(previousBitmap[index] - currentBitmap[index])
    const greenDiff = Math.abs(previousBitmap[index + 1] - currentBitmap[index + 1])
    const redDiff = Math.abs(previousBitmap[index + 2] - currentBitmap[index + 2])
    if (Math.max(redDiff, greenDiff, blueDiff) > PIXEL_DIFF_THRESHOLD) {
      changed += 1
    }
  }
  return total === 0 ? null : changed / total
}

export const comparePngSnapshots = (previous: Buffer | null, current: Buffer): SnapshotDiffResult => {
  const digest = calculateSnapshotDigest(current)
  if (!previous || previous.length === 0) {
    return { changed: true, digest, changedRatio: 1 }
  }
  const changedRatio = compareBitmapSnapshots(previous, current)
  if (changedRatio === null) {
    return { changed: true, digest, changedRatio: 1 }
  }
  return {
    changed: changedRatio >= CHANGE_RATIO_THRESHOLD,
    digest,
    changedRatio
  }
}
