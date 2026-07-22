/**
 * Loads patch images as `ImageBitmap`s (with transparency preserved) for the
 * mosaic. Prefers the `_nobg.png` silhouette when asked; can require it.
 */
import type { DetectionEntity } from '~/models/detection.types'
import { patchesStore } from '~/stores/entities/5.patches'
import { makeIndexedFileHandle } from '~/stores/entities/photos'

type ParentDir = { getFileHandle?: (name: string) => Promise<{ getFile: () => Promise<File> }> }

export type LoadImagesOptions = { preferNobg: boolean; requireNobg: boolean }

export type LoadedImages = { images: Map<string, ImageBitmap>; nobgUsed: number }

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

  await Promise.allSettled(
    detections.map(async (det) => {
      const patch = patches[det.patchId]
      const imageFile = patch?.imageFile
      if (!imageFile) return

      let file: File | undefined
      let usedNobg = false

      if (opts.preferNobg || opts.requireNobg) {
        file = await nobgFile(imageFile)
        if (file) usedNobg = true
      }
      if (!file) {
        if (opts.requireNobg) return // no silhouette available — skip entirely
        file = imageFile.file
        if (!file) {
          const handle = makeIndexedFileHandle(imageFile)
          file = await handle?.getFile().catch(() => undefined)
        }
      }
      if (!file) return

      try {
        images.set(det.patchId, await createImageBitmap(file))
        if (usedNobg) nobgUsed++
      } catch {
        // skip unreadable images
      }
    }),
  )

  return { images, nobgUsed }
}
