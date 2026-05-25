import { toast } from 'sonner'
import type { DatasetRegistryEntry } from '~/stores/datasets-registry'
import { setContentIntegrationInProgress } from '~/stores/pending-dataset-migration'
import { requireDatasetsFolderHandle } from './datasets-folder-handle'
import type { FileSystemDirectoryHandleLike } from '~/features/mothbox-next/adapters/dinalab-mothbox-v1/browser-adapter-io'
import { buildMothboxPackageFromFolder } from './build-mothbox-package-from-folder'
import { createThrottledProgressCallback } from '~/features/mothbox-next/adapters/dinalab-mothbox-v1/adapter-progress'
import type { PendingDatasetMigration } from './discover-dataset-folders'

const MIGRATE_PENDING_LOADING_TOAST_ID = 'migrate-pending-datasets-loading'

type DirectoryHandleWithIter = FileSystemDirectoryHandleLike & {
  getDirectoryHandle?: (name: string, opts?: { create?: boolean }) => Promise<FileSystemDirectoryHandleLike>
}

export type MigratePendingDatasetFoldersResult = {
  migrated: DatasetRegistryEntry[]
  errors: Array<{ folderName: string; message: string }>
}

export async function migratePendingDatasetFolders(
  pending: PendingDatasetMigration[],
): Promise<MigratePendingDatasetFoldersResult> {
  if (!pending.length) return { migrated: [], errors: [] }

  setContentIntegrationInProgress(true)

  try {
    const root = (await requireDatasetsFolderHandle({ mode: 'readwrite' })) as DirectoryHandleWithIter | null
    if (!root) {
      const message = 'Could not access the datasets folder. Choose it again from the menu.'
      toast.error(message, { duration: 8000 })
      return { migrated: [], errors: pending.map((item) => ({ folderName: item.folderName, message })) }
    }

    const reportProgress = createThrottledProgressCallback((progress) => {
      toast.loading(progress.message, {
        id: MIGRATE_PENDING_LOADING_TOAST_ID,
        description: progress.description,
      })
    })

    toast.loading('Setting up dataset…', {
      id: MIGRATE_PENDING_LOADING_TOAST_ID,
      description: `Preparing ${pending.length} folder${pending.length === 1 ? '' : 's'}…`,
    })

    const migrated: DatasetRegistryEntry[] = []
    const errors: Array<{ folderName: string; message: string }> = []

    for (let index = 0; index < pending.length; index++) {
      const item = pending[index]
      reportProgress({
        phase: 'relocate',
        message: 'Setting up dataset…',
        description: `Preparing ${item.folderName} (${index + 1}/${pending.length})…`,
      })

      let packageHandle: FileSystemDirectoryHandleLike | undefined
      try {
        packageHandle = await root.getDirectoryHandle?.(item.folderName, { create: false })
      } catch {
        packageHandle = undefined
      }

      if (!packageHandle) {
        const message = 'The folder may have been moved or removed.'
        errors.push({ folderName: item.folderName, message })
        toast.error(`Could not find “${item.folderName}”`, { duration: 8000, description: message })
        continue
      }

      try {
        const built = await buildMothboxPackageFromFolder({
          packageHandle,
          folderName: item.folderName,
          kind: item.kind,
          onProgress: reportProgress,
        })
        migrated.push({
          folderName: item.folderName,
          datasetId: built.datasetId,
          hasManifest: true,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.log('🚨 migratePendingDatasetFolders: failed', { folderName: item.folderName, message })
        errors.push({ folderName: item.folderName, message })
        toast.error(`Could not set up “${item.folderName}”`, {
          duration: 8000,
          description: message,
        })
      }
    }

    reportProgress.flush()
    toast.dismiss(MIGRATE_PENDING_LOADING_TOAST_ID)

    if (migrated.length > 0) {
      toast.success('Dataset ready', {
        description: `Prepared ${migrated.length} dataset${migrated.length === 1 ? '' : 's'} (legacy files referenced in place).`,
      })
    }

    return { migrated, errors }
  } finally {
    setContentIntegrationInProgress(false)
  }
}
