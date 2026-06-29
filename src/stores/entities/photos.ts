import { atom } from 'nanostores'

export type IndexedFile = {
  file?: File
  handle?: unknown
  /** The immediate parent directory handle — used for lazy sibling resolution. */
  parentDir?: unknown
  /** The top-level picked root directory — fallback when a file wasn't enumerated due to depth limit. */
  rootDir?: unknown
  path: string
  name: string
  size: number
}
export type PhotoEntity = {
  id: string
  name: string
  leafGroupId: string
  imageFile?: IndexedFile
  botDetectionFile?: IndexedFile
  userDetectionFile?: IndexedFile
  /** Detection JSONs archived from previous YOLO model runs (e.g. img_botdetection_Mothbot_v1.json). */
  archivedBotDetectionFiles?: IndexedFile[]
}

export const photosStore = atom<Record<string, PhotoEntity>>({})

type HandleLike = { getFile: () => Promise<File> }

/**
 * Returns a handle-like object for displaying or downloading an indexed image file.
 *
 * Priority:
 * 1. Direct FileSystemFileHandle on the entry (legacy / text files)
 * 2. parentDir.getFileHandle(name) — for images collected during the scan
 * 3. rootDir path navigation — for images in directories skipped by the depth limit
 */
export function makeIndexedFileHandle(entry?: IndexedFile): HandleLike | undefined {
  if (!entry) return undefined
  if (entry.handle) return entry.handle as HandleLike

  const pd = entry.parentDir as { getFileHandle?: (n: string) => Promise<HandleLike> } | undefined
  if (!pd?.getFileHandle || !entry.name) return undefined
  const { name } = entry

  return {
    getFile: async () => {
      const fh = await pd.getFileHandle!(name)
      return fh.getFile()
    },
  }
}

export function clearFileObjectsForLeafGroup(params: { leafGroupId: string }) {
  const { leafGroupId } = params
  const current = photosStore.get() || {}
  const updated: Record<string, PhotoEntity> = {}

  for (const [id, photo] of Object.entries(current)) {
    if (photo.leafGroupId === leafGroupId) {
      updated[id] = {
        ...photo,
        imageFile: photo.imageFile ? { ...photo.imageFile, file: undefined } : undefined,
        botDetectionFile: photo.botDetectionFile ? { ...photo.botDetectionFile, file: undefined } : undefined,
        userDetectionFile: photo.userDetectionFile ? { ...photo.userDetectionFile, file: undefined } : undefined,
      }
    } else {
      updated[id] = photo
    }
  }

  photosStore.set(updated)
}
