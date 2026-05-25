import { loadLastActiveDatasetFolderName } from '~/features/data-flow/3.persist/files.persistence'
import {
  activeDatasetFolderNameStore,
  datasetsRegistryStore,
  setActiveDatasetFolderName,
} from '~/stores/datasets-registry'
import { isMothboxNextPackageOpen } from '~/features/mothbox-next/active-package'
import { openDatasetByFolderName } from './open-dataset-by-folder'
import { resolveDefaultDatasetFolderName } from './resolve-default-dataset-folder'

/** Highlights last-used dataset in the registry without loading package data from disk. */
export function rememberDefaultDatasetSelection(): boolean {
  if (activeDatasetFolderNameStore.get()) return false

  const folderName = resolveDefaultDatasetFolderName({
    entries: datasetsRegistryStore.get(),
    lastUsedFolderName: loadLastActiveDatasetFolderName(),
  })
  if (!folderName) return false

  setActiveDatasetFolderName(folderName)
  return true
}

export async function ensureDefaultDatasetOpen(): Promise<boolean> {
  if (isMothboxNextPackageOpen()) return false

  const folderName = resolveDefaultDatasetFolderName({
    entries: datasetsRegistryStore.get(),
    lastUsedFolderName: loadLastActiveDatasetFolderName(),
  })
  if (!folderName) return false

  return openDatasetByFolderName({ folderName })
}

export async function warmDefaultDatasetInBackground(): Promise<boolean> {
  if (isMothboxNextPackageOpen()) return false

  const folderName = resolveDefaultDatasetFolderName({
    entries: datasetsRegistryStore.get(),
    lastUsedFolderName: loadLastActiveDatasetFolderName(),
  })
  if (!folderName) return false

  return openDatasetByFolderName({ folderName, showSuccessToast: false })
}
