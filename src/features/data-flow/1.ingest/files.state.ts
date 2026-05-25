import { atom } from 'nanostores'

export const selectedFilesStore = atom<File[]>([])
export const directoryFilesStore = atom<File[]>([])
export const indexedFilesStore = atom<Array<{ file?: File; handle?: unknown; path: string; name: string; size: number }>>([])

// Loading state: true while restoring at app start or picking a directory
// We bridge React Query state by writing to this atom in entry points
export const isLoadingFoldersStore = atom<boolean>(false)

// Derived indexes for fast night-level ingest
export type IndexedFile = { file?: File; handle?: unknown; path: string; name: string; size: number }
export const filesByLeafGroupIdStore = atom<Record<string, IndexedFile[]>>({})
export const patchFileMapByNightStore = atom<Record<string, Record<string, IndexedFile>>>({})
