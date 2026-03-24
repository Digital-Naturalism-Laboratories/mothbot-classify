import { describe, expect, it } from 'vitest'
import { extractExifSegmentFromJpeg, injectExifSegmentIntoJpeg, normalizeExifOrientationInSegment } from '~/utils/jpeg-exif'

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
