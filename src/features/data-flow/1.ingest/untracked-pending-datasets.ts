import type { DatasetRegistryEntry } from '~/stores/datasets-registry'
import type { PendingDatasetMigration } from './pending-dataset-migration-types'

export function findUntrackedPendingMigrations(params: {
  pendingMigration: PendingDatasetMigration[]
  registry: DatasetRegistryEntry[]
  dismissedFolderNames?: Iterable<string>
}): PendingDatasetMigration[] {
  const { pendingMigration, registry, dismissedFolderNames } = params
  const tracked = new Set(registry.map((entry) => entry.folderName))
  const dismissed = dismissedFolderNames ? new Set(dismissedFolderNames) : new Set<string>()

  return pendingMigration.filter(
    (item) => !tracked.has(item.folderName) && !dismissed.has(item.folderName),
  )
}
