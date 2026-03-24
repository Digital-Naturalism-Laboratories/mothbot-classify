import { useEffect, useState } from 'react'

type HandleLike = { getFile?: () => Promise<File> }

type LoadImageResult = {
  image: HTMLImageElement
  width: number
  height: number
}

export type StandardizedImageDimensionsParams = {
  width: number
  height: number
  maxLongSide: number
}

export type StandardizedImageBlobParams = {
  file: File
  maxLongSide?: number
  quality?: number
}

const DEFAULT_MAX_LONG_SIDE = 1000
const DEFAULT_QUALITY = 0.92
const OUTPUT_MIME_TYPE = 'image/jpeg'

export function useStandardizedImageDownloadUrl(fileOrHandle?: File | null, handle?: HandleLike | unknown, maxLongSide = DEFAULT_MAX_LONG_SIDE) {
  const [url, setUrl] = useState('')

  useEffect(() => {
    let cancelled = false
    let revoke: (() => void) | undefined

    async function createStandardizedUrl() {
      const file = await resolveImageFile({ fileOrHandle, handle })
      if (!file || cancelled) {
        if (!cancelled) setUrl('')
        return
      }

      const blob = await createStandardizedImageBlob({ file, maxLongSide })
      if (cancelled) return

      const objectUrl = URL.createObjectURL(blob)
      revoke = () => URL.revokeObjectURL(objectUrl)
      setUrl(objectUrl)
    }

    void createStandardizedUrl().catch(() => {
      if (cancelled) return
      setUrl('')
    })

    return () => {
      cancelled = true
      revoke?.()
    }
  }, [fileOrHandle, handle, maxLongSide])

  return url
}

export async function createStandardizedImageBlob(params: StandardizedImageBlobParams) {
  const { file, maxLongSide = DEFAULT_MAX_LONG_SIDE, quality = DEFAULT_QUALITY } = params
  const image = await loadImageFromFile(file)
  const dimensions = getStandardizedImageDimensions({
    width: image.width,
    height: image.height,
    maxLongSide,
  })

  if (dimensions.width === image.width && dimensions.height === image.height) return file

  const canvas = document.createElement('canvas')
  canvas.width = dimensions.width
  canvas.height = dimensions.height

  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not create image resize context')

  context.drawImage(image.image, 0, 0, dimensions.width, dimensions.height)

  const blob = await canvasToBlob(canvas, OUTPUT_MIME_TYPE, quality)
  return blob
}

export function getStandardizedImageDimensions(params: StandardizedImageDimensionsParams) {
  const { width, height, maxLongSide } = params

  if (width <= 0 || height <= 0 || maxLongSide <= 0) {
    return { width, height }
  }

  const longestSide = Math.max(width, height)
  if (longestSide === maxLongSide) {
    return { width, height }
  }

  const scale = maxLongSide / longestSide

  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  }
}

async function resolveImageFile(params: { fileOrHandle?: File | null; handle?: HandleLike | unknown }) {
  const { fileOrHandle, handle } = params

  if (fileOrHandle instanceof File) return fileOrHandle

  const fileHandle = handle as HandleLike | undefined
  if (typeof fileHandle?.getFile !== 'function') return undefined

  const file = await fileHandle.getFile()
  return file
}

async function loadImageFromFile(file: File): Promise<LoadImageResult> {
  const objectUrl = URL.createObjectURL(file)

  try {
    const image = await loadImageElement(objectUrl)

    return {
      image,
      width: image.naturalWidth,
      height: image.naturalHeight,
    }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function loadImageElement(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()

    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not decode image'))
    image.src = src
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Could not export resized image'))
        return
      }

      resolve(blob)
    }, type, quality)
  })
}
