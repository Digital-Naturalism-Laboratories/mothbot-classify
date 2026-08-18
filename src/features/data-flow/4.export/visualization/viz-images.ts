/**
 * Loads patch images as `ImageBitmap`s (with transparency preserved) for the
 * mosaic. Prefers the `_nobg.png` silhouette when asked; can require it.
 */
import type { DetectionEntity } from '~/models/detection.types'
import { patchesStore } from '~/stores/entities/5.patches'
import { makeIndexedFileHandle } from '~/stores/entities/photos'

type ParentDir = { getFileHandle?: (name: string) => Promise<{ getFile: () => Promise<File> }> }

export type LoadImagesOptions = { preferNobg: boolean; requireNobg: boolean }

/** Why a detection never made it into the mosaic. */
export type ImageLoadMisses = {
  /** No patch record, or the patch has no indexed image file. */
  noImageFile: number
  /** `requireNobg` was on and no `_nobg.png` exists for the patch. */
  noNobg: number
  /** The file existed but couldn't be read or decoded. */
  readFailed: number
}

export type LoadedImages = {
  images: Map<string, ImageBitmap>
  nobgUsed: number
  misses: ImageLoadMisses
}

/**
 * Cap on in-flight file reads/decodes.
 *
 * Firing one task per detection meant ~28k concurrent File System Access handle
 * requests and `createImageBitmap` decodes on a big night. Enough of them failed
 * that well over half the insects silently never reached the packer.
 */
const LOAD_CONCURRENCY = 48

/** Runs `worker` over `items` with at most `limit` in flight at a time. */
async function mapWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      try {
        await worker(items[index]!)
      } catch {
        // Worker records its own misses; never let one item kill the batch.
      }
    }
  })
  await Promise.all(runners)
}

async function nobgFile(imageFile: { name: string; parentDir?: unknown }): Promise<File | undefined> {
  const parentDir = imageFile.parentDir as ParentDir | undefined
  if (!parentDir?.getFileHandle) return undefined
  const nobgName = imageFile.name.replace(/\.jpe?g$/i, '_nobg.png')
  return parentDir.getFileHandle(nobgName).then((h) => h.getFile()).catch(() => undefined)
}

export async function loadPatchImages(
  detections: Array<Pick<DetectionEntity, 'patchId'>>,
  opts: LoadImagesOptions,
): Promise<LoadedImages> {
  const patches = patchesStore.get()
  const images = new Map<string, ImageBitmap>()
  let nobgUsed = 0
  const misses: ImageLoadMisses = { noImageFile: 0, noNobg: 0, readFailed: 0 }

  await mapWithConcurrency(detections, LOAD_CONCURRENCY, async (det) => {
    const patch = patches[det.patchId]
    const imageFile = patch?.imageFile
    if (!imageFile) {
      misses.noImageFile++
      return
    }

    let file: File | undefined
    let usedNobg = false

    if (opts.preferNobg || opts.requireNobg) {
      file = await nobgFile(imageFile)
      if (file) usedNobg = true
    }
    if (!file) {
      if (opts.requireNobg) {
        misses.noNobg++ // no silhouette available — skip entirely
        return
      }
      file = imageFile.file
      if (!file) {
        const handle = makeIndexedFileHandle(imageFile)
        file = await handle?.getFile().catch(() => undefined)
      }
    }
    if (!file) {
      misses.readFailed++
      return
    }

    try {
      images.set(det.patchId, await createImageBitmap(file))
      if (usedNobg) nobgUsed++
    } catch {
      misses.readFailed++
    }
  })

  const lost = misses.noImageFile + misses.noNobg + misses.readFailed
  if (lost > 0) {
    console.warn('🌀 viz: some patches could not be loaded', { requested: detections.length, loaded: images.size, ...misses })
  }

  return { images, nobgUsed, misses }
}
