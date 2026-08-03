import { type DatasetRegistryEntry, setDatasetsRegistry } from '~/stores/datasets-registry'
import { discoverDatasetFolders } from './discover-dataset-folders'
import { migratePendingDatasetFolders } from './migrate-pending-dataset-folders'
import { promptUntrackedPendingDatasetSetup } from './check-for-new-dataset-folders'

export type ScanDatasetsFolderOptions = {
  /** When true (default), migrates legacy folders immediately. */
  autoMigrate?: boolean
}

export async function scanDatasetsFolder(options?: ScanDatasetsFolderOptions): Promise<DatasetRegistryEntry[]> {
  const autoMigrate = options?.autoMigrate ?? true
  const { packages, pendingMigration } = await discoverDatasetFolders()

  let entries = [...packages]

  if (autoMigrate && pendingMigration.length > 0) {
    const { migrated } = await migratePendingDatasetFolders(pendingMigration)
    entries = [...entries, ...migrated]
  }

  const sorted = entries.sort((a, b) => a.folderName.localeCompare(b.folderName))
  setDatasetsRegistry(sorted)
  await promptUntrackedPendingDatasetSetup({ registry: sorted, pendingMigration })

  return sorted
}

/** Re-scan datasets root and replace registry (drops folders removed from disk). */
export async function refreshRegisteredPackagesFromDisk(): Promise<DatasetRegistryEntry[]> {
  const { packages } = await discoverDatasetFolders()
  const sorted = [...packages].sort((a, b) => a.folderName.localeCompare(b.folderName))
  setDatasetsRegistry(sorted)
  return sorted
}
