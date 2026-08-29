import { describe, expect, it } from 'vitest'
import {
  exifSegmentHasDateTimeOriginal,
  extractExifSegmentFromJpeg,
  injectExifSegmentIntoJpeg,
  normalizeExifOrientationInSegment,
  writeDateTimeOriginalIntoExifSegment,
} from '~/utils/jpeg-exif'

describe('jpeg exif helpers', () => {
  it('extracts the EXIF segment from a jpeg file', () => {
    const jpegBytes = createJpegWithExif({ orientation: 6 })

    const exifSegment = extractExifSegmentFromJpeg(jpegBytes)

    expect(exifSegment).not.toBeNull()
    expect(readOrientationFromExifSegment(exifSegment!)).toBe(6)
  })

  it('normalizes EXIF orientation to 1 before reinserting metadata', () => {
    const exifSegment = createExifSegment({ orientation: 8 })

    const normalized = normalizeExifOrientationInSegment(exifSegment)

    expect(readOrientationFromExifSegment(normalized)).toBe(1)
  })

  it('injects EXIF metadata after the JFIF segment', () => {
    const resizedJpeg = createJfifJpeg()
    const exifSegment = createExifSegment({ orientation: 6 })

    const merged = injectExifSegmentIntoJpeg({ jpegBytes: resizedJpeg, exifSegment })

    expect(merged[0]).toBe(0xff)
    expect(merged[1]).toBe(0xd8)
    expect(merged[2]).toBe(0xff)
    expect(merged[3]).toBe(0xe0)
    expect(merged[20]).toBe(0xff)
    expect(merged[21]).toBe(0xe1)
  })

  it('preserves normalized EXIF metadata when merging into resized jpeg bytes', () => {
    const sourceJpeg = createJpegWithExif({ orientation: 6 })
    const resizedJpeg = createJfifJpeg()
    const exifSegment = extractExifSegmentFromJpeg(sourceJpeg)
    const normalizedExif = normalizeExifOrientationInSegment(exifSegment!)
    const mergedJpeg = injectExifSegmentIntoJpeg({
      jpegBytes: resizedJpeg,
      exifSegment: normalizedExif,
    })
    const mergedExifSegment = extractExifSegmentFromJpeg(mergedJpeg)

    expect(mergedExifSegment).not.toBeNull()
    expect(readOrientationFromExifSegment(mergedExifSegment!)).toBe(1)
  })

  it('reports no DateTimeOriginal when the segment has no Exif SubIFD', () => {
    const exifSegment = createExifSegment({ orientation: 1 })

    expect(exifSegmentHasDateTimeOriginal(exifSegment)).toBe(false)
  })

  it('builds a fresh EXIF segment with DateTimeOriginal when none exists', () => {
    const date = new Date(2025, 5, 29, 4, 59, 5)

    const segment = writeDateTimeOriginalIntoExifSegment(null, date)

    expect(exifSegmentHasDateTimeOriginal(segment)).toBe(true)
    expect(readDateTimeOriginalFromExifSegment(segment)).toBe('2025:06:29 04:59:05')
  })

  it('adds DateTimeOriginal to an existing segment that has no Exif SubIFD, preserving other tags', () => {
    const exifSegment = createExifSegment({ orientation: 6 })
    const date = new Date(2025, 5, 29, 4, 59, 5)

    const updated = writeDateTimeOriginalIntoExifSegment(exifSegment, date)

    expect(exifSegmentHasDateTimeOriginal(updated)).toBe(true)
    expect(readDateTimeOriginalFromExifSegment(updated)).toBe('2025:06:29 04:59:05')
    expect(readOrientationFromExifSegment(updated)).toBe(6)
    expect(readOrientationFromExifSegment(normalizeExifOrientationInSegment(updated))).toBe(1)
  })

  it('adds DateTimeOriginal to an existing Exif SubIFD that lacks it', () => {
    const exifSegment = createExifSegmentWithEmptyExifSubIfd({ orientation: 1 })
    const date = new Date(2025, 5, 29, 4, 59, 5)

    expect(exifSegmentHasDateTimeOriginal(exifSegment)).toBe(false)

    const updated = writeDateTimeOriginalIntoExifSegment(exifSegment, date)

    expect(exifSegmentHasDateTimeOriginal(updated)).toBe(true)
    expect(readDateTimeOriginalFromExifSegment(updated)).toBe('2025:06:29 04:59:05')
    expect(readOrientationFromExifSegment(updated)).toBe(1)
  })

  it('survives injection into a resized jpeg after adding DateTimeOriginal', () => {
    const sourceJpeg = createJpegWithExif({ orientation: 6 })
    const resizedJpeg = createJfifJpeg()
    const exifSegment = extractExifSegmentFromJpeg(sourceJpeg)
    const withDate = writeDateTimeOriginalIntoExifSegment(exifSegment, new Date(2025, 5, 29, 4, 59, 5))
    const normalizedExif = normalizeExifOrientationInSegment(withDate)
    const mergedJpeg = injectExifSegmentIntoJpeg({ jpegBytes: resizedJpeg, exifSegment: normalizedExif })
    const mergedExifSegment = extractExifSegmentFromJpeg(mergedJpeg)

    expect(mergedExifSegment).not.toBeNull()
    expect(readOrientationFromExifSegment(mergedExifSegment!)).toBe(1)
    expect(exifSegmentHasDateTimeOriginal(mergedExifSegment!)).toBe(true)
    expect(readDateTimeOriginalFromExifSegment(mergedExifSegment!)).toBe('2025:06:29 04:59:05')
  })
})

function createJpegWithExif(params: { orientation: number }) {
  const exifSegment = createExifSegment(params)
  const imageData = new Uint8Array([0xff, 0xda, 0x00, 0x08, 0x01, 0x02, 0x03, 0x00, 0xff, 0xd9])

  return concatBytes(new Uint8Array([0xff, 0xd8]), exifSegment, imageData)
}

function createJfifJpeg() {
  const jfifSegment = new Uint8Array([
    0xff, 0xe0, 0x00, 0x10,
    0x4a, 0x46, 0x49, 0x46, 0x00,
    0x01, 0x01, 0x00,
    0x00, 0x01, 0x00, 0x01,
    0x00, 0x00,
  ])
  const imageData = new Uint8Array([0xff, 0xda, 0x00, 0x08, 0x01, 0x02, 0x03, 0x00, 0xff, 0xd9])

  return concatBytes(new Uint8Array([0xff, 0xd8]), jfifSegment, imageData)
}

function createExifSegment(params: { orientation: number }) {
  const { orientation } = params
  const tiffData = new Uint8Array([
    0x49, 0x49, 0x2a, 0x00,
    0x08, 0x00, 0x00, 0x00,
    0x01, 0x00,
    0x12, 0x01,
    0x03, 0x00,
    0x01, 0x00, 0x00, 0x00,
    orientation, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
  ])
  const exifPayload = concatBytes(new Uint8Array([0x45, 0x78, 0x69, 0x66, 0x00, 0x00]), tiffData)
  const segmentLength = exifPayload.length + 2

  return concatBytes(
    new Uint8Array([0xff, 0xe1, (segmentLength >> 8) & 0xff, segmentLength & 0xff]),
    exifPayload,
  )
}

function readOrientationFromExifSegment(exifSegment: Uint8Array) {
  return exifSegment[28] | (exifSegment[29] << 8)
}

function createExifSegmentWithEmptyExifSubIfd(params: { orientation: number }) {
  const { orientation } = params
  const tiffData = new Uint8Array([
    0x49, 0x49, 0x2a, 0x00,
    0x08, 0x00, 0x00, 0x00,
    0x02, 0x00,
    0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, orientation, 0x00, 0x00, 0x00,
    0x69, 0x87, 0x04, 0x00, 0x01, 0x00, 0x00, 0x00, 0x26, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
  ])
  const exifPayload = concatBytes(new Uint8Array([0x45, 0x78, 0x69, 0x66, 0x00, 0x00]), tiffData)
  const segmentLength = exifPayload.length + 2

  return concatBytes(
    new Uint8Array([0xff, 0xe1, (segmentLength >> 8) & 0xff, segmentLength & 0xff]),
    exifPayload,
  )
}

function readDateTimeOriginalFromExifSegment(exifSegment: Uint8Array) {
  const tiffStart = 10
  const readU16 = (offset: number) => exifSegment[offset] | (exifSegment[offset + 1] << 8)
  const readU32 = (offset: number) =>
    exifSegment[offset] |
    (exifSegment[offset + 1] << 8) |
    (exifSegment[offset + 2] << 16) |
    (exifSegment[offset + 3] << 24)

  const ifd0Start = tiffStart + readU32(tiffStart + 4)
  const ifd0EntryCount = readU16(ifd0Start)
  let subIfdStart = -1

  for (let index = 0; index < ifd0EntryCount; index += 1) {
    const entryOffset = ifd0Start + 2 + index * 12
    if (readU16(entryOffset) === 0x8769) {
      subIfdStart = tiffStart + readU32(entryOffset + 8)
      break
    }
  }

  if (subIfdStart === -1) return null

  const subIfdEntryCount = readU16(subIfdStart)

  for (let index = 0; index < subIfdEntryCount; index += 1) {
    const entryOffset = subIfdStart + 2 + index * 12
    if (readU16(entryOffset) !== 0x9003) continue

    const count = readU32(entryOffset + 4)
    const valueOffset = tiffStart + readU32(entryOffset + 8)
    return new TextDecoder().decode(exifSegment.slice(valueOffset, valueOffset + count - 1))
  }

  return null
}

function concatBytes(...chunks: Uint8Array[]) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const merged = new Uint8Array(totalLength)
  let offset = 0

  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.length
  }

  return merged
}
