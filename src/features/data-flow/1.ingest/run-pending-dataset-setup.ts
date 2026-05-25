import type { DatasetRegistryEntry } from '~/stores/datasets-registry'
import { datasetsRegistryStore, setDatasetsRegistry } from '~/stores/datasets-registry'
import { mergeDatasetRegistryEntries } from './merge-dataset-registry'
import { requireDatasetsFolderHandle } from './datasets-folder-handle'
import { migratePendingDatasetFolders } from './migrate-pending-dataset-folders'
import type { PendingDatasetMigration } from './pending-dataset-migration-types'
import { formatPendingDatasetSetupError } from './pending-dataset-setup-errors'

export type RunPendingDatasetSetupResult = {
  migrated: DatasetRegistryEntry[]
  errors: Array<{ folderName: string; message: string }>
  registryUpdated: boolean
}

export async function runPendingDatasetSetup(
  pending: PendingDatasetMigration[],
): Promise<RunPendingDatasetSetupResult> {
  const datasetsHandle = await requireDatasetsFolderHandle({ mode: 'readwrite' })
  if (!datasetsHandle) {
    const message = 'Choose your datasets folder from the menu, then try again.'
    return {
      migrated: [],
      errors: pending.map((item) => ({ folderName: item.folderName, message })),
      registryUpdated: false,
    }
  }

  const { migrated, errors } = await migratePendingDatasetFolders(pending)

  if (migrated.length === 0) {
    return { migrated, errors, registryUpdated: false }
  }

  setDatasetsRegistry(mergeDatasetRegistryEntries(datasetsRegistryStore.get(), migrated))

  return { migrated, errors, registryUpdated: true }
}

export { formatPendingDatasetSetupError } from './pending-dataset-setup-errors'
