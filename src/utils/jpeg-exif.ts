import { parseTimestampFromText } from '~/models/detection-time'

const JPEG_MIME_TYPE = 'image/jpeg'
const TIFF_START = 10
const DATE_TIME_ORIGINAL_TAG = 0x9003
const EXIF_IFD_POINTER_TAG = 0x8769
const ASCII_TYPE = 2
const LONG_TYPE = 4

/** IFD pointer tags whose inline value is itself a TIFF-relative offset to another IFD. */
const IFD_POINTER_TAGS = new Set([0x8769, 0x8825, 0xa005])
/** Non-IFD tags whose inline value is still a TIFF-relative offset (e.g. thumbnail data). */
const RAW_OFFSET_TAGS = new Set([0x0201])
const TYPE_SIZES: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 }

export async function preserveJpegExifMetadata(params: { originalFile: File; resizedBlob: Blob }) {
  const { originalFile, resizedBlob } = params
  if (!isJpegFile(originalFile)) return resizedBlob

  const originalBytes = await readBlobBytes(originalFile)
  const exifSegment = extractExifSegmentFromJpeg(originalBytes)
  const exifSegmentWithDate = ensureExifSegmentHasCaptureDate(exifSegment, originalFile.name)
  if (!exifSegmentWithDate) return resizedBlob

  const resizedBytes = await readBlobBytes(resizedBlob)
  const normalizedExifSegment = normalizeExifOrientationInSegment(exifSegmentWithDate)
  const mergedBytes = injectExifSegmentIntoJpeg({
    jpegBytes: resizedBytes,
    exifSegment: normalizedExifSegment,
  })

  return new Blob([mergedBytes.buffer], { type: JPEG_MIME_TYPE })
}

/**
 * Trail camera JPEGs sometimes lack a DateTimeOriginal tag, but the capture
 * time is always encoded in the source filename. Falls back to that when the
 * EXIF (or the file) doesn't already carry the date.
 */
function ensureExifSegmentHasCaptureDate(exifSegment: Uint8Array | null, fileName: string): Uint8Array | null {
  if (exifSegment && exifSegmentHasDateTimeOriginal(exifSegment)) return exifSegment

  const timestamp = parseTimestampFromText(fileName)
  if (timestamp == null) return exifSegment

  return writeDateTimeOriginalIntoExifSegment(exifSegment, new Date(timestamp))
}

export function extractExifSegmentFromJpeg(jpegBytes: Uint8Array) {
  if (!isJpegBytes(jpegBytes)) return null

  let offset = 2

  while (offset + 4 <= jpegBytes.length) {
    if (jpegBytes[offset] !== 0xff) break

    const marker = jpegBytes[offset + 1]
    if (marker === 0xda || marker === 0xd9) break

    const segmentLength = readBigEndianUint16(jpegBytes, offset + 2)
    if (segmentLength < 2 || offset + 2 + segmentLength > jpegBytes.length) break

    if (marker === 0xe1 && isExifSegment(jpegBytes, offset + 4)) {
      return jpegBytes.slice(offset, offset + 2 + segmentLength)
    }

    offset += 2 + segmentLength
  }

  return null
}

export function normalizeExifOrientationInSegment(exifSegment: Uint8Array) {
  const normalized = exifSegment.slice()
  const tiffStart = TIFF_START
  if (normalized.length < tiffStart + 8) return normalized

  const byteOrder = getExifByteOrder(normalized, tiffStart)
  if (!byteOrder) return normalized

  const ifdOffset = readUint32(normalized, tiffStart + 4, byteOrder)
  const ifdStart = tiffStart + ifdOffset
  if (ifdStart + 2 > normalized.length) return normalized

  const entryCount = readUint16(normalized, ifdStart, byteOrder)

  for (let index = 0; index < entryCount; index += 1) {
    const entryOffset = ifdStart + 2 + index * 12
    if (entryOffset + 12 > normalized.length) break

    const tag = readUint16(normalized, entryOffset, byteOrder)
    const type = readUint16(normalized, entryOffset + 2, byteOrder)
    const count = readUint32(normalized, entryOffset + 4, byteOrder)

    if (tag !== 0x0112 || type !== 3 || count !== 1) continue

    writeUint16(normalized, entryOffset + 8, 1, byteOrder)
    writeUint16(normalized, entryOffset + 10, 0, byteOrder)
    break
  }

  return normalized
}

/** Whether the EXIF SubIFD already has a DateTimeOriginal (0x9003) tag. */
export function exifSegmentHasDateTimeOriginal(exifSegment: Uint8Array): boolean {
  const tiffStart = TIFF_START
  if (exifSegment.length < tiffStart + 8) return false

  const byteOrder = getExifByteOrder(exifSegment, tiffStart)
  if (!byteOrder) return false

  const ifd0Offset = readUint32(exifSegment, tiffStart + 4, byteOrder)
  const ifd0Start = tiffStart + ifd0Offset
  if (ifd0Start + 2 > exifSegment.length) return false

  const exifPointerEntry = findEntryInIfd(exifSegment, byteOrder, ifd0Start, EXIF_IFD_POINTER_TAG)
  if (!exifPointerEntry) return false

  const subIfdOffset = readUint32(exifSegment, exifPointerEntry.entryOffset + 8, byteOrder)
  const subIfdStart = tiffStart + subIfdOffset
  if (subIfdStart + 2 > exifSegment.length) return false

  return findEntryInIfd(exifSegment, byteOrder, subIfdStart, DATE_TIME_ORIGINAL_TAG) !== null
}

/**
 * Writes DateTimeOriginal into an EXIF segment, creating the Exif SubIFD (and
 * the segment itself) if it doesn't already exist. Assumes the caller has
 * already checked the tag isn't already present.
 */
export function writeDateTimeOriginalIntoExifSegment(exifSegment: Uint8Array | null, date: Date): Uint8Array {
  const dateBytes = encodeExifDateTimeAscii(date)
  const tiffStart = TIFF_START

  if (!exifSegment) return buildMinimalExifSegmentWithDateTimeOriginal(dateBytes)

  const byteOrder = getExifByteOrder(exifSegment, tiffStart)
  if (!byteOrder || exifSegment.length < tiffStart + 8) return exifSegment

  const ifd0Offset = readUint32(exifSegment, tiffStart + 4, byteOrder)
  const ifd0Start = tiffStart + ifd0Offset
  if (ifd0Start + 2 > exifSegment.length) return exifSegment

  const exifPointerEntry = findEntryInIfd(exifSegment, byteOrder, ifd0Start, EXIF_IFD_POINTER_TAG)

  if (exifPointerEntry) {
    const subIfdOffset = readUint32(exifSegment, exifPointerEntry.entryOffset + 8, byteOrder)
    const subIfdStart = tiffStart + subIfdOffset
    if (subIfdStart + 2 > exifSegment.length) return exifSegment

    const subIfdEntryCount = readUint16(exifSegment, subIfdStart, byteOrder)

    return insertEntryIntoIfd(exifSegment, tiffStart, byteOrder, subIfdStart, subIfdEntryCount, {
      tag: DATE_TIME_ORIGINAL_TAG,
      type: ASCII_TYPE,
      count: dateBytes.length,
      appendBytes: dateBytes,
    })
  }

  // No Exif SubIFD yet: append a new one (with the date entry inside it) and
  // point IFD0 at it.
  const ifd0EntryCount = readUint16(exifSegment, ifd0Start, byteOrder)
  const appendStart = exifSegment.length + 12
  const subIfdLength = 2 + 12 + 4
  const dateStart = appendStart + subIfdLength
  const dateTiffRelativeOffset = dateStart - tiffStart

  const subIfdBytes = new Uint8Array(subIfdLength)
  writeUint16(subIfdBytes, 0, 1, byteOrder)
  writeUint16(subIfdBytes, 2, DATE_TIME_ORIGINAL_TAG, byteOrder)
  writeUint16(subIfdBytes, 4, ASCII_TYPE, byteOrder)
  writeUint32(subIfdBytes, 6, dateBytes.length, byteOrder)
  writeUint32(subIfdBytes, 10, dateTiffRelativeOffset, byteOrder)
  writeUint32(subIfdBytes, 14, 0, byteOrder)

  return insertEntryIntoIfd(exifSegment, tiffStart, byteOrder, ifd0Start, ifd0EntryCount, {
    tag: EXIF_IFD_POINTER_TAG,
    type: LONG_TYPE,
    count: 1,
    appendBytes: concatBytes(subIfdBytes, dateBytes),
  })
}

/**
 * Inserts a new 12-byte entry into an existing IFD, growing the segment and
 * rebasing every other TIFF-relative offset in the structure (other IFDs'
 * external values, IFD-chain pointers, EXIF/GPS/thumbnail pointers) that
 * pointed at or past the insertion point.
 */
function insertEntryIntoIfd(
  bytes: Uint8Array,
  tiffStart: number,
  byteOrder: 'little' | 'big',
  targetIfdStart: number,
  targetEntryCount: number,
  entry: { tag: number; type: number; count: number; appendBytes: Uint8Array },
): Uint8Array {
  const insertionPoint = targetIfdStart + 2 + targetEntryCount * 12
  const offsetFields = collectOffsetFields(bytes, tiffStart, byteOrder)
  const shift = 12

  const newBytes = new Uint8Array(bytes.length + shift + entry.appendBytes.length)
  newBytes.set(bytes.subarray(0, insertionPoint), 0)
  newBytes.set(bytes.subarray(insertionPoint), insertionPoint + shift)
  if (entry.appendBytes.length > 0) newBytes.set(entry.appendBytes, bytes.length + shift)

  const value = bytes.length + shift - tiffStart // appended data always starts here

  writeUint16(newBytes, insertionPoint, entry.tag, byteOrder)
  writeUint16(newBytes, insertionPoint + 2, entry.type, byteOrder)
  writeUint32(newBytes, insertionPoint + 4, entry.count, byteOrder)
  writeUint32(newBytes, insertionPoint + 8, value, byteOrder)

  writeUint16(newBytes, targetIfdStart, targetEntryCount + 1, byteOrder)

  for (const fieldPosition of offsetFields) {
    const oldValue = readUint32(bytes, fieldPosition, byteOrder)
    const pointsPastInsertion = tiffStart + oldValue >= insertionPoint
    const newValue = pointsPastInsertion ? oldValue + shift : oldValue
    const newPosition = fieldPosition >= insertionPoint ? fieldPosition + shift : fieldPosition
    writeUint32(newBytes, newPosition, newValue, byteOrder)
  }

  // The APP1 segment length (JPEG container-level, always big-endian, covers
  // everything after the 2-byte marker) must reflect the grown segment.
  const app1Length = newBytes.length - 2
  newBytes[2] = (app1Length >> 8) & 0xff
  newBytes[3] = app1Length & 0xff

  return newBytes
}

/** Every TIFF-relative offset field reachable from IFD0 (IFD chain, EXIF/GPS/Interop/thumbnail). */
function collectOffsetFields(bytes: Uint8Array, tiffStart: number, byteOrder: 'little' | 'big'): number[] {
  const positions: number[] = []
  const visited = new Set<number>()

  const ifd0Offset = readUint32(bytes, tiffStart + 4, byteOrder)
  visitIfd(tiffStart + ifd0Offset)

  return positions

  function visitIfd(ifdStart: number) {
    if (ifdStart + 2 > bytes.length || visited.has(ifdStart)) return
    visited.add(ifdStart)

    const entryCount = readUint16(bytes, ifdStart, byteOrder)

    for (let index = 0; index < entryCount; index += 1) {
      const entryOffset = ifdStart + 2 + index * 12
      if (entryOffset + 12 > bytes.length) break

      const tag = readUint16(bytes, entryOffset, byteOrder)
      const type = readUint16(bytes, entryOffset + 2, byteOrder)
      const count = readUint32(bytes, entryOffset + 4, byteOrder)
      const unitSize = TYPE_SIZES[type] ?? 1
      const totalBytes = unitSize * count
      const valueFieldOffset = entryOffset + 8
      const isIfdPointer = IFD_POINTER_TAGS.has(tag)
      const isRawOffset = RAW_OFFSET_TAGS.has(tag)

      if (totalBytes > 4 || isIfdPointer || isRawOffset) positions.push(valueFieldOffset)

      if (isIfdPointer) {
        const childOffset = readUint32(bytes, valueFieldOffset, byteOrder)
        visitIfd(tiffStart + childOffset)
      }
    }

    const nextIfdFieldOffset = ifdStart + 2 + entryCount * 12
    if (nextIfdFieldOffset + 4 > bytes.length) return

    positions.push(nextIfdFieldOffset)
    const nextIfdOffset = readUint32(bytes, nextIfdFieldOffset, byteOrder)
    if (nextIfdOffset !== 0) visitIfd(tiffStart + nextIfdOffset)
  }
}

function findEntryInIfd(bytes: Uint8Array, byteOrder: 'little' | 'big', ifdStart: number, tag: number) {
  const entryCount = readUint16(bytes, ifdStart, byteOrder)

  for (let index = 0; index < entryCount; index += 1) {
    const entryOffset = ifdStart + 2 + index * 12
    if (entryOffset + 12 > bytes.length) break
    if (readUint16(bytes, entryOffset, byteOrder) === tag) return { entryOffset }
  }

  return null
}

/** Builds a brand-new minimal EXIF APP1 segment containing only DateTimeOriginal. */
function buildMinimalExifSegmentWithDateTimeOriginal(dateBytes: Uint8Array): Uint8Array {
  const byteOrder = 'little' as const
  const tiffStart = TIFF_START
  const ifd0Start = tiffStart + 8
  const ifd0Length = 2 + 12 + 4
  const subIfdStart = ifd0Start + ifd0Length
  const subIfdLength = 2 + 12 + 4
  const dateStart = subIfdStart + subIfdLength
  const totalLength = dateStart + dateBytes.length

  const segment = new Uint8Array(totalLength)
  segment[0] = 0xff
  segment[1] = 0xe1
  const app1Length = totalLength - 2
  segment[2] = (app1Length >> 8) & 0xff
  segment[3] = app1Length & 0xff
  segment[4] = 0x45
  segment[5] = 0x78
  segment[6] = 0x69
  segment[7] = 0x66
  segment[8] = 0x00
  segment[9] = 0x00

  segment[tiffStart] = 0x49
  segment[tiffStart + 1] = 0x49
  writeUint16(segment, tiffStart + 2, 0x002a, byteOrder)
  writeUint32(segment, tiffStart + 4, 8, byteOrder)

  writeUint16(segment, ifd0Start, 1, byteOrder)
  writeUint16(segment, ifd0Start + 2, EXIF_IFD_POINTER_TAG, byteOrder)
  writeUint16(segment, ifd0Start + 4, LONG_TYPE, byteOrder)
  writeUint32(segment, ifd0Start + 6, 1, byteOrder)
  writeUint32(segment, ifd0Start + 10, subIfdStart - tiffStart, byteOrder)
  writeUint32(segment, ifd0Start + 14, 0, byteOrder)

  writeUint16(segment, subIfdStart, 1, byteOrder)
  writeUint16(segment, subIfdStart + 2, DATE_TIME_ORIGINAL_TAG, byteOrder)
  writeUint16(segment, subIfdStart + 4, ASCII_TYPE, byteOrder)
  writeUint32(segment, subIfdStart + 6, dateBytes.length, byteOrder)
  writeUint32(segment, subIfdStart + 10, dateStart - tiffStart, byteOrder)
  writeUint32(segment, subIfdStart + 14, 0, byteOrder)

  segment.set(dateBytes, dateStart)

  return segment
}

/** `YYYY:MM:DD HH:MM:SS\0` — the EXIF ASCII DateTimeOriginal format, in local wall-clock time. */
function encodeExifDateTimeAscii(date: Date): Uint8Array {
  const pad = (value: number) => String(value).padStart(2, '0')
  const text =
    `${date.getFullYear()}:${pad(date.getMonth() + 1)}:${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`

  const encoded = new TextEncoder().encode(text)
  const withNullTerminator = new Uint8Array(encoded.length + 1)
  withNullTerminator.set(encoded, 0)
  return withNullTerminator
}

export function injectExifSegmentIntoJpeg(params: { jpegBytes: Uint8Array; exifSegment: Uint8Array }) {
  const { jpegBytes, exifSegment } = params
  if (!isJpegBytes(jpegBytes) || exifSegment.length === 0) return jpegBytes

  const insertOffset = getExifInsertOffset(jpegBytes)

  const merged = new Uint8Array(jpegBytes.length + exifSegment.length)
  merged.set(jpegBytes.slice(0, insertOffset), 0)
  merged.set(exifSegment, insertOffset)
  merged.set(jpegBytes.slice(insertOffset), insertOffset + exifSegment.length)

  return merged
}

function getExifInsertOffset(jpegBytes: Uint8Array) {
  if (!isJpegBytes(jpegBytes)) return 0

  let offset = 2

  while (offset + 4 <= jpegBytes.length) {
    if (jpegBytes[offset] !== 0xff) break

    const marker = jpegBytes[offset + 1]
    if (marker !== 0xe0) break

    const segmentLength = readBigEndianUint16(jpegBytes, offset + 2)
    if (segmentLength < 2 || offset + 2 + segmentLength > jpegBytes.length) break

    offset += 2 + segmentLength
  }

  return offset
}

function isExifSegment(bytes: Uint8Array, offset: number) {
  return (
    bytes[offset] === 0x45 &&
    bytes[offset + 1] === 0x78 &&
    bytes[offset + 2] === 0x69 &&
    bytes[offset + 3] === 0x66 &&
    bytes[offset + 4] === 0x00 &&
    bytes[offset + 5] === 0x00
  )
}

function isJpegFile(file: File) {
  return file.type === JPEG_MIME_TYPE || /\.jpe?g$/i.test(file.name)
}

function isJpegBytes(bytes: Uint8Array) {
  return bytes[0] === 0xff && bytes[1] === 0xd8
}

function getExifByteOrder(bytes: Uint8Array, offset: number) {
  const first = bytes[offset]
  const second = bytes[offset + 1]

  if (first === 0x49 && second === 0x49) return 'little'
  if (first === 0x4d && second === 0x4d) return 'big'

  return null
}

function readBigEndianUint16(bytes: Uint8Array, offset: number) {
  return (bytes[offset] << 8) | bytes[offset + 1]
}

function readUint16(bytes: Uint8Array, offset: number, byteOrder: 'little' | 'big') {
  if (byteOrder === 'little') return bytes[offset] | (bytes[offset + 1] << 8)
  return (bytes[offset] << 8) | bytes[offset + 1]
}

function readUint32(bytes: Uint8Array, offset: number, byteOrder: 'little' | 'big') {
  if (byteOrder === 'little') {
    return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)
  }

  return (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]
}

function writeUint16(bytes: Uint8Array, offset: number, value: number, byteOrder: 'little' | 'big') {
  if (byteOrder === 'little') {
    bytes[offset] = value & 0xff
    bytes[offset + 1] = (value >> 8) & 0xff
    return
  }

  bytes[offset] = (value >> 8) & 0xff
  bytes[offset + 1] = value & 0xff
}

function writeUint32(bytes: Uint8Array, offset: number, value: number, byteOrder: 'little' | 'big') {
  if (byteOrder === 'little') {
    bytes[offset] = value & 0xff
    bytes[offset + 1] = (value >> 8) & 0xff
    bytes[offset + 2] = (value >> 16) & 0xff
    bytes[offset + 3] = (value >> 24) & 0xff
    return
  }

  bytes[offset] = (value >> 24) & 0xff
  bytes[offset + 1] = (value >> 16) & 0xff
  bytes[offset + 2] = (value >> 8) & 0xff
  bytes[offset + 3] = value & 0xff
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

async function readBlobBytes(blob: Blob) {
  if (typeof blob.arrayBuffer === 'function') {
    return new Uint8Array(await blob.arrayBuffer())
  }

  const arrayBuffer = await readBlobBytesWithFileReader(blob)
  return new Uint8Array(arrayBuffer)
}

function readBlobBytesWithFileReader(blob: Blob) {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      const result = reader.result
      if (!(result instanceof ArrayBuffer)) {
        reject(new Error('Could not read blob bytes'))
        return
      }

      resolve(result)
    }

    reader.onerror = () => {
      reject(reader.error ?? new Error('Could not read blob bytes'))
    }

    reader.readAsArrayBuffer(blob)
  })
}
