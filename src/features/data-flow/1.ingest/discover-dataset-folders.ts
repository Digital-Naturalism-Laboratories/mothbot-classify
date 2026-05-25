import type { DatasetRegistryEntry } from '~/stores/datasets-registry'
import { requireDatasetsFolderHandle } from './datasets-folder-handle'
import type { FileSystemDirectoryHandleLike } from '~/features/mothbox-next/adapters/dinalab-mothbox-v1/browser-adapter-io'
import { classifyDatasetFolder, isReservedDatasetsChildFolderName } from './classify-dataset-folder'
import { readDatasetManifestSummary } from './dataset-manifest'
import type { PendingDatasetMigration } from './pending-dataset-migration-types'

export type { PendingDatasetMigration } from './pending-dataset-migration-types'
export { findUntrackedPendingMigrations } from './untracked-pending-datasets'

type DirectoryHandleWithIter = FileSystemDirectoryHandleLike & {
  kind?: 'directory' | 'file'
  values?: () => AsyncIterable<unknown>
  getFileHandle?: (name: string, opts?: { create?: boolean }) => Promise<{ getFile?: () => Promise<File> }>
}

export type DiscoverDatasetFoldersResult = {
  packages: DatasetRegistryEntry[]
  pendingMigration: PendingDatasetMigration[]
}

export async function discoverDatasetFolders(): Promise<DiscoverDatasetFoldersResult> {
  const handle = (await requireDatasetsFolderHandle({ mode: 'read', notifyOnDenied: false })) as
    | DirectoryHandleWithIter
    | null
  if (!handle) {
    return { packages: [], pendingMigration: [] }
  }

  return discoverDatasetFoldersUnderRoot(handle)
}

export async function discoverDatasetFoldersUnderRoot(
  datasetsRoot: DirectoryHandleWithIter,
): Promise<DiscoverDatasetFoldersResult> {
  const packages: DatasetRegistryEntry[] = []
  const pendingMigration: PendingDatasetMigration[] = []

  if (typeof datasetsRoot.values !== 'function') {
    return { packages, pendingMigration }
  }

  const childCandidates: Array<{ directory: DirectoryHandleWithIter; folderName: string }> = []

  for await (const child of datasetsRoot.values()) {
    const candidate = child as DirectoryHandleWithIter
    if (candidate?.kind !== 'directory') continue

    const folderName = candidate.name?.trim()
    if (!folderName || isReservedDatasetsChildFolderName(folderName)) continue

    childCandidates.push({ directory: candidate, folderName })
  }

  const classified = await Promise.all(
    childCandidates.map(async ({ directory, folderName }) => {
      const manifestInfo = await readDatasetManifestSummary(directory)
      if (manifestInfo.hasManifest) {
        return {
          package: {
            folderName,
            datasetId: manifestInfo.datasetId,
            hasManifest: true as const,
          },
          pending: null,
        }
      }

      const kind = await classifyDatasetFolder({ directory, folderName })
      if (kind === 'legacy-root' || kind === 'source-only' || kind === 'patch-images-only') {
        return { package: null, pending: { folderName, kind } }
      }

      return { package: null, pending: null }
    }),
  )

  for (const item of classified) {
    if (item.package) packages.push(item.package)
    if (item.pending) pendingMigration.push(item.pending)
  }

  return { packages, pendingMigration }
}
