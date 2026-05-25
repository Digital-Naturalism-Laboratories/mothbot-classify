import { type DatasetRegistryEntry, setDatasetsRegistry } from '~/stores/datasets-registry'
import { discoverDatasetFolders } from './discover-dataset-folders'
import { migratePendingDatasetFolders } from './migrate-pending-dataset-folders'
import { isPatchImagesOnlyKind } from './resolve-setup-kind'
import { promptUntrackedPendingDatasetSetup } from './check-for-new-dataset-folders'

export type ScanDatasetsFolderOptions = {
  /** When true, migrates legacy folders immediately. Patch-image-only folders always need setup confirmation. */
  autoMigrate?: boolean
  /** When true (default), opens the setup dialog for patch-image-only folders after scan. */
  promptPatchImagesSetup?: boolean
}

export async function scanDatasetsFolder(options?: ScanDatasetsFolderOptions): Promise<DatasetRegistryEntry[]> {
  const autoMigrate = options?.autoMigrate ?? true
  const promptPatchImagesSetup = options?.promptPatchImagesSetup ?? true
  const { packages, pendingMigration } = await discoverDatasetFolders()

  let entries = [...packages]

  const pendingAutoMigrate = autoMigrate
    ? pendingMigration.filter((item) => !isPatchImagesOnlyKind(item.kind))
    : []

  if (pendingAutoMigrate.length > 0) {
    const { migrated } = await migratePendingDatasetFolders(pendingAutoMigrate)
    entries = [...entries, ...migrated]
  }

  const sorted = entries.sort((a, b) => a.folderName.localeCompare(b.folderName))
  setDatasetsRegistry(sorted)

  if (promptPatchImagesSetup) {
    await promptUntrackedPendingDatasetSetup({ registry: sorted, pendingMigration })
  }

  return sorted
}

/** Re-scan datasets root and replace registry (drops folders removed from disk). */
export async function refreshRegisteredPackagesFromDisk(): Promise<DatasetRegistryEntry[]> {
  const { packages } = await discoverDatasetFolders()
  const sorted = [...packages].sort((a, b) => a.folderName.localeCompare(b.folderName))
  setDatasetsRegistry(sorted)
  return sorted
}
