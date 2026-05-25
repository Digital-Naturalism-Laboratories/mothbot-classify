import { atom } from 'nanostores'
import { saveLastActiveDatasetFolderName } from '~/features/data-flow/3.persist/files.persistence'
import { invalidatePackageSessionCache } from '~/features/data-flow/3.persist/package-session-cache'
import { mothboxNextPackageStore } from '~/features/mothbox-next/active-package'
import { resetAllEntityStores } from '~/stores/entities'

export type DatasetRegistryEntry = {
  folderName: string
  datasetId?: string
  hasManifest: boolean
}

export const datasetsRegistryStore = atom<DatasetRegistryEntry[]>([])
export const activeDatasetFolderNameStore = atom<string | null>(null)

export function setDatasetsRegistry(entries: DatasetRegistryEntry[]) {
  const activeBefore = activeDatasetFolderNameStore.get()
  datasetsRegistryStore.set(entries)

  if (!activeBefore) return
  if (entries.some((entry) => entry.folderName === activeBefore)) return

  const hadOpenPackage = !!mothboxNextPackageStore.get()
  setActiveDatasetFolderName(null)

  if (hadOpenPackage) {
    resetAllEntityStores()
    void invalidatePackageSessionCache(activeBefore)
  }
}

export function clearDatasetsRegistry() {
  datasetsRegistryStore.set([])
  activeDatasetFolderNameStore.set(null)
}

export function setActiveDatasetFolderName(folderName: string | null) {
  const trimmed = folderName ? folderName.trim() || null : null
  activeDatasetFolderNameStore.set(trimmed)
  saveLastActiveDatasetFolderName(trimmed)
}
