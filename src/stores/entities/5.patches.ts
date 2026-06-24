import { atom } from 'nanostores'
import { IndexedFile } from './photos'

export type PatchEntity = {
  id: string
  name: string
  leafGroupId: string
  photoId: string
  capturedAt?: string
  imageFile?: IndexedFile
  latitude?: string | null
  longitude?: string | null
  botDetectionJsonName?: string
}

export const patchesStore = atom<Record<string, PatchEntity>>({})

export function clearFileObjectsForLeafGroup(params: { leafGroupId: string }) {
  const { leafGroupId } = params
  const current = patchesStore.get() || {}
  const updated: Record<string, PatchEntity> = {}

  for (const [id, patch] of Object.entries(current)) {
    if (patch.leafGroupId === leafGroupId) {
      updated[id] = {
        ...patch,
        imageFile: patch.imageFile ? { ...patch.imageFile, file: undefined } : undefined,
      }
    } else {
      updated[id] = patch
    }
  }

  patchesStore.set(updated)
}
