import { toast } from 'sonner'
import { clearMothboxNextPackage } from '~/features/mothbox-next/active-package'
import { resetAllEntityStores } from '~/stores/entities'
import { datasetsRegistryStore, setDatasetsRegistry, setActiveDatasetFolderName } from '~/stores/datasets-registry'
import { requireDatasetsFolderHandle } from './datasets-folder-handle'
import { invalidatePackageSessionCache } from '~/features/data-flow/3.persist/package-session-cache'
import {
  PACKAGE_MANAGED_DIR_NAMES,
  PACKAGE_MANAGED_FILE_NAMES,
} from '~/features/data-flow/1.ingest/reserved-paths'
import type { FileSystemDirectoryHandleLike } from '~/utils/fs-directory-handle'

/**
 * Deletes all Classify-managed files and folders from a dataset package,
 * restoring it to the state before Classify processed it. Specifically removes:
 *   - dataset.json, adapter-report.json  (PACKAGE_MANAGED_FILE_NAMES)
 *   - 00_source/, 01_patches/, 02_records/, 03_classifications/, 04_exports/
 *     (PACKAGE_MANAGED_DIR_NAMES)
 *
 * The original source images, patch crops, and bot-detection JSONs are never
 * touched — only the files Classify itself wrote are removed.
 */
export async function resetDataset(params: { folderName: string }): Promise<void> {
  const { folderName } = params

  const datasetsRoot = (await requireDatasetsFolderHandle({ mode: 'readwrite' })) as
    | (FileSystemDirectoryHandleLike & {
        getDirectoryHandle?: (name: string, opts?: { create?: boolean }) => Promise<FileSystemDirectoryHandleLike>
      })
    | null

  if (!datasetsRoot) {
    throw new Error('Datasets folder is not available. Choose your datasets folder and try again.')
  }

  // Resolve the actual package folder (may be under _processed for the
  // sibling-mirror layout — packagePath carries the real path).
  const registryEntry = datasetsRegistryStore.get().find((e) => e.folderName === folderName)
  const relativePackagePath = registryEntry?.packagePath ?? folderName
  const pathSegments = relativePackagePath.split('/').filter(Boolean)

  let packageHandle: FileSystemDirectoryHandleLike | null = null
  try {
    let current: FileSystemDirectoryHandleLike = datasetsRoot
    for (const segment of pathSegments) {
      const next = await (
        current as { getDirectoryHandle?: (name: string, opts?: { create?: boolean }) => Promise<FileSystemDirectoryHandleLike> }
      ).getDirectoryHandle?.(segment, { create: false })
      if (!next) throw new Error(`Could not find "${segment}".`)
      current = next
    }
    packageHandle = current
  } catch (err) {
    throw new Error(
      `Could not find the package folder for "${folderName}": ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  // Delete all Classify-managed files and directories from the package root.
  const deletionErrors: string[] = []

  for (const name of PACKAGE_MANAGED_FILE_NAMES) {
    try {
      await packageHandle.removeEntry?.(name, { recursive: false })
    } catch (err: unknown) {
      // NotFoundError means it was already gone — that's fine, not an error.
      if ((err as { name?: string })?.name !== 'NotFoundError') {
        deletionErrors.push(`${name}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }

  for (const name of PACKAGE_MANAGED_DIR_NAMES) {
    try {
      await packageHandle.removeEntry?.(name, { recursive: true })
    } catch (err: unknown) {
      if ((err as { name?: string })?.name !== 'NotFoundError') {
        deletionErrors.push(`${name}/: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }

  if (deletionErrors.length > 0) {
    throw new Error(
      `Reset partially failed — some Classify files could not be deleted:\n${deletionErrors.map((e) => `• ${e}`).join('\n')}`,
    )
  }

  // Clear the session cache so the app doesn't try to restore stale data.
  await invalidatePackageSessionCache(folderName)

  // If this dataset was the active one, clear it from all stores.
  const activeFolder = datasetsRegistryStore.get().find((e) => e.folderName === folderName)
  const wasActive = !!activeFolder

  if (wasActive) {
    resetAllEntityStores()
    clearMothboxNextPackage()
    setActiveDatasetFolderName(null)
  }

  // Remove the dataset from the registry — it no longer has a manifest
  // and will be offered as "pending setup" on the next scan.
  setDatasetsRegistry(datasetsRegistryStore.get().filter((e) => e.folderName !== folderName))

  toast.success(`"${folderName}" has been reset`, {
    description: 'Classify files removed. Run Set up to re-index it.',
  })
}
