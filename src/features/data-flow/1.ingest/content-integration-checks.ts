import { activeDatasetFolderNameStore } from '~/stores/datasets-registry'
import { datasetsRegistryStore } from '~/stores/datasets-registry'
import {
  contentIntegrationCheckInFlightStore,
  contentIntegrationInProgressStore,
  dismissedPendingMigrationFoldersStore,
  setContentIntegrationCheckInFlight,
} from '~/stores/pending-dataset-migration'
import { directoryHasDatasetManifest } from './dataset-manifest'
import { requireDatasetsFolderHandle } from './datasets-folder-handle'
import { discoverDatasetFolders } from './discover-dataset-folders'
import { warmDefaultDatasetInBackground } from './ensure-default-dataset-open'
import { refreshRegisteredPackagesFromDisk } from './scan-datasets-folder'
import {
  buildPendingSetupPolicy,
  detectForeignMergePolicy,
  type ContentIntegrationPolicy,
} from './content-integration-policy'
import { shouldPromptContentIntegration } from './content-integration-prompt'
import { openNewDatasetMigrationDialog } from './new-dataset-migration-dialog'
import { openNewForeignContentDialog } from './new-foreign-content-dialog'
import { readTextFile } from '~/utils/fs-directory-handle'
import { parsePatchSourceRecords } from '~/features/mothbox-next/parse-package-records'
import type { FileSystemDirectoryHandleLike } from '~/utils/fs-directory-handle'

export async function runContentIntegrationChecks(): Promise<ContentIntegrationPolicy[]> {
  if (contentIntegrationCheckInFlightStore.get() || contentIntegrationInProgressStore.get()) return []

  setContentIntegrationCheckInFlight(true)

  try {
    await refreshRegisteredPackagesFromDisk()
    void warmDefaultDatasetInBackground()

    const prompted: ContentIntegrationPolicy[] = []

    const pendingPolicy = await detectPendingSetupPolicy()
    if (shouldPromptContentIntegration({ policy: pendingPolicy, integrationInProgress: false })) {
      openNewDatasetMigrationDialog({ pending: pendingPolicy.pending })
      prompted.push(pendingPolicy)
      return prompted
    }

    const foreignPolicy = await detectActiveForeignMergePolicy()
    if (shouldPromptContentIntegration({ policy: foreignPolicy, integrationInProgress: false })) {
      openNewForeignContentDialog({
        packageFolderName: foreignPolicy.packageFolderName,
        foreignFolders: foreignPolicy.foreignFolders,
        photosOnly: foreignPolicy.photosOnly,
      })
      prompted.push(foreignPolicy)
    }

    return prompted
  } finally {
    setContentIntegrationCheckInFlight(false)
  }
}

export async function detectPendingSetupPolicy() {
  const registry = datasetsRegistryStore.get()
  const { pendingMigration } = await discoverDatasetFolders()
  return buildPendingSetupPolicy({
    pendingMigration,
    registry,
    dismissedFolderNames: dismissedPendingMigrationFoldersStore.get(),
  })
}

export async function detectActiveForeignMergePolicy() {
  const folderName = activeDatasetFolderNameStore.get()
  if (!folderName) return null

  const datasetsRoot = await requireDatasetsFolderHandle({ mode: 'read', notifyOnDenied: false })
  if (!datasetsRoot) return null

  const packageHandle = await datasetsRoot.getDirectoryHandle?.(folderName, { create: false })
  if (!packageHandle) return null

  const hasManifest = await directoryHasDatasetManifest(packageHandle)
  if (!hasManifest) return null

  const patchSources = await readPatchSources(packageHandle)
  return detectForeignMergePolicy({ packageHandle, packageFolderName: folderName, patchSources })
}

async function readPatchSources(packageHandle: FileSystemDirectoryHandleLike) {
  try {
    const text = await readTextFile(packageHandle, '02_records/patch-sources.ndjson')
    return parsePatchSourceRecords(text)
  } catch {
    return []
  }
}
