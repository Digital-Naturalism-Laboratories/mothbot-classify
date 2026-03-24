const JPEG_MIME_TYPE = 'image/jpeg'

export async function preserveJpegExifMetadata(params: { originalFile: File; resizedBlob: Blob }) {
  const { originalFile, resizedBlob } = params
  if (!isJpegFile(originalFile)) return resizedBlob

  const originalBytes = await readBlobBytes(originalFile)
  const exifSegment = extractExifSegmentFromJpeg(originalBytes)
  if (!exifSegment) return resizedBlob

  const resizedBytes = await readBlobBytes(resizedBlob)
  const normalizedExifSegment = normalizeExifOrientationInSegment(exifSegment)
  const mergedBytes = injectExifSegmentIntoJpeg({
    jpegBytes: resizedBytes,
    exifSegment: normalizedExifSegment,
  })

  return new Blob([mergedBytes.buffer], { type: JPEG_MIME_TYPE })
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
  const tiffStart = 10
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
