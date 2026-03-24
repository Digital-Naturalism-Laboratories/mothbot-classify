import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createStandardizedImageBlob,
  getStandardizedImageDimensions,
  useStandardizedImageDownloadUrl,
} from '~/utils/use-standardized-image-download-url'

describe('getStandardizedImageDimensions', () => {
  it('scales landscape images down to a 1000px longest side', () => {
    const result = getStandardizedImageDimensions({
      width: 2400,
      height: 1200,
      maxLongSide: 1000,
    })

    expect(result).toEqual({ width: 1000, height: 500 })
  })

  it('scales portrait images down to a 1000px longest side', () => {
    const result = getStandardizedImageDimensions({
      width: 800,
      height: 2000,
      maxLongSide: 1000,
    })

    expect(result).toEqual({ width: 400, height: 1000 })
  })

  it('scales smaller images up to a 1000px longest side', () => {
    const result = getStandardizedImageDimensions({
      width: 600,
      height: 400,
      maxLongSide: 1000,
    })

    expect(result).toEqual({ width: 1000, height: 667 })
  })
})

describe('createStandardizedImageBlob', () => {
  const originalCreateElement = document.createElement.bind(document)
  const drawImage = vi.fn()
  const getContext = vi.fn()
  const toBlob = vi.fn()
  const createObjectURL = vi.fn()
  const revokeObjectURL = vi.fn()

  let imageWidth = 2400
  let imageHeight = 1200
  let objectUrlCount = 0

  class MockImage {
    naturalWidth: number
    naturalHeight: number
    onload: null | (() => void) = null
    onerror: null | (() => void) = null

    constructor() {
      this.naturalWidth = imageWidth
      this.naturalHeight = imageHeight
    }

    set src(_value: string) {
      queueMicrotask(() => this.onload?.())
    }
  }

  beforeEach(() => {
    imageWidth = 2400
    imageHeight = 1200
    objectUrlCount = 0

    drawImage.mockReset()
    getContext.mockReset()
    toBlob.mockReset()
    createObjectURL.mockReset()
    revokeObjectURL.mockReset()

    getContext.mockReturnValue({ drawImage })
    toBlob.mockImplementation((callback: BlobCallback, type?: string) => {
      callback?.(new Blob(['resized'], { type: type ?? 'image/jpeg' }))
    })
    createObjectURL.mockImplementation(() => `blob:mock-${++objectUrlCount}`)

    vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
      if (tagName === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext,
          toBlob,
        } as unknown as HTMLCanvasElement
      }

      return originalCreateElement(tagName)
    }) as typeof document.createElement)

    vi.stubGlobal('Image', MockImage)
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL,
      revokeObjectURL,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('creates a resized jpeg blob for larger images', async () => {
    const file = new File(['original'], 'patch.png', { type: 'image/png' })

    const result = await createStandardizedImageBlob({ file, maxLongSide: 1000 })

    expect(result).toBeInstanceOf(Blob)
    expect(result).not.toBe(file)
    expect(result.type).toBe('image/jpeg')
    expect(drawImage).toHaveBeenCalledWith(expect.any(MockImage), 0, 0, 1000, 500)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-1')
  })

  it('creates a resized blob when the image is smaller than 1000px', async () => {
    imageWidth = 600
    imageHeight = 400

    const file = new File(['original'], 'patch.jpg', { type: 'image/jpeg' })

    const result = await createStandardizedImageBlob({ file, maxLongSide: 1000 })

    expect(result).toBeInstanceOf(Blob)
    expect(result).not.toBe(file)
    expect(drawImage).toHaveBeenCalledWith(expect.any(MockImage), 0, 0, 1000, 667)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-1')
  })
})

describe('useStandardizedImageDownloadUrl', () => {
  const originalCreateElement = document.createElement.bind(document)
  const createObjectURL = vi.fn()
  const revokeObjectURL = vi.fn()

  let imageWidth = 2400
  let imageHeight = 1200
  let objectUrlCount = 0

  class MockImage {
    naturalWidth: number
    naturalHeight: number
    onload: null | (() => void) = null
    onerror: null | (() => void) = null

    constructor() {
      this.naturalWidth = imageWidth
      this.naturalHeight = imageHeight
    }

    set src(_value: string) {
      queueMicrotask(() => this.onload?.())
    }
  }

  beforeEach(() => {
    imageWidth = 2400
    imageHeight = 1200
    objectUrlCount = 0

    createObjectURL.mockReset()
    revokeObjectURL.mockReset()
    createObjectURL.mockImplementation(() => `blob:hook-${++objectUrlCount}`)

    vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
      if (tagName === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => ({ drawImage: vi.fn() }),
          toBlob: (callback: BlobCallback, type?: string) => callback?.(new Blob(['resized'], { type: type ?? 'image/jpeg' })),
        } as unknown as HTMLCanvasElement
      }

      return originalCreateElement(tagName)
    }) as typeof document.createElement)

    vi.stubGlobal('Image', MockImage)
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL,
      revokeObjectURL,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('creates and revokes the standardized download URL', async () => {
    const file = new File(['original'], 'patch.jpg', { type: 'image/jpeg' })

    const { result, unmount } = renderHook(() => useStandardizedImageDownloadUrl(file))

    await waitFor(() => {
      expect(result.current).toBe('blob:hook-2')
    })

    unmount()

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:hook-1')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:hook-2')
  })

  it('hydrates file handles before creating the standardized URL', async () => {
    const file = new File(['original'], 'patch.jpg', { type: 'image/jpeg' })
    const handle = { getFile: vi.fn().mockResolvedValue(file) }

    const { result, unmount } = renderHook(() => useStandardizedImageDownloadUrl(undefined, handle))

    await waitFor(() => {
      expect(result.current).toBe('blob:hook-2')
    })

    expect(handle.getFile).toHaveBeenCalledOnce()

    unmount()
  })
})
