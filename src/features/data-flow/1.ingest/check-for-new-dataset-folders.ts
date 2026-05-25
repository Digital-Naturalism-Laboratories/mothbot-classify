import { discoverDatasetFolders, type PendingDatasetMigration } from './discover-dataset-folders'
import { datasetsRegistryStore } from '~/stores/datasets-registry'
import {
  contentIntegrationInProgressStore,
  dismissedPendingMigrationFoldersStore,
} from '~/stores/pending-dataset-migration'
import { openNewDatasetMigrationDialog } from './new-dataset-migration-dialog'
import { buildPendingSetupPolicy } from './content-integration-policy'
import { shouldPromptContentIntegration } from './content-integration-prompt'

export async function promptUntrackedPendingDatasetSetup(params?: {
  registry?: ReturnType<typeof datasetsRegistryStore.get>
  pendingMigration?: PendingDatasetMigration[]
}) {
  const registry = params?.registry ?? datasetsRegistryStore.get()
  const pendingMigration = params?.pendingMigration ?? (await discoverDatasetFolders()).pendingMigration
  const policy = buildPendingSetupPolicy({
    pendingMigration,
    registry,
    dismissedFolderNames: dismissedPendingMigrationFoldersStore.get(),
  })

  if (
    policy &&
    shouldPromptContentIntegration({ policy, integrationInProgress: contentIntegrationInProgressStore.get() })
  ) {
    openNewDatasetMigrationDialog({ pending: policy.pending })
    return policy.pending
  }

  return []
}
