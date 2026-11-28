import { type DatasetRegistryEntry, setDatasetsRegistry } from '~/stores/datasets-registry'
import { discoverDatasetFolders } from './discover-dataset-folders'
import { migratePendingDatasetFolders } from './migrate-pending-dataset-folders'
import { promptUntrackedPendingDatasetSetup } from './check-for-new-dataset-folders'

/** What the last scan of the picked folder found, so the picker can explain an empty result. */
export type LastScanSummary = { projectCount: number; pendingCount: number; unprocessedProjectName?: string }
let lastScanSummary: LastScanSummary = { projectCount: 0, pendingCount: 0 }
export function getLastScanSummary(): LastScanSummary {
  return lastScanSummary
}

export type ScanDatasetsFolderOptions = {
  /** When true (default), migrates legacy folders immediately. */
  autoMigrate?: boolean
}

export async function scanDatasetsFolder(options?: ScanDatasetsFolderOptions): Promise<DatasetRegistryEntry[]> {
  const autoMigrate = options?.autoMigrate ?? true
  const { packages, pendingMigration, unprocessedProjectName } = await discoverDatasetFolders()
  lastScanSummary = { projectCount: packages.length, pendingCount: pendingMigration.length, unprocessedProjectName }

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
