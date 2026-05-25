import { atom } from 'nanostores'

export type IndexedFile = {
  file?: File
  handle?: unknown
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
}

export const photosStore = atom<Record<string, PhotoEntity>>({})

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
