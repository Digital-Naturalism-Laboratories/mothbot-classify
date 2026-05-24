import { atom } from 'nanostores'

export type DatasetRegistryEntry = {
  folderName: string
  datasetId?: string
  hasManifest: boolean
}

export const datasetsRegistryStore = atom<DatasetRegistryEntry[]>([])
export const activeDatasetFolderNameStore = atom<string | null>(null)

export function setDatasetsRegistry(entries: DatasetRegistryEntry[]) {
  datasetsRegistryStore.set(entries)
}

export function clearDatasetsRegistry() {
  datasetsRegistryStore.set([])
  activeDatasetFolderNameStore.set(null)
}

export function setActiveDatasetFolderName(folderName: string | null) {
  activeDatasetFolderNameStore.set(folderName ? folderName.trim() || null : null)
}
