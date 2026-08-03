import type { DatasetRegistryEntry } from '~/stores/datasets-registry'
import { requireDatasetsFolderHandle } from './datasets-folder-handle'
import type { FileSystemDirectoryHandleLike } from '~/features/mothbox-next/adapters/dinalab-mothbox-v1/browser-adapter-io'
import { classifyDatasetFolder, isReservedDatasetsChildFolderName, isParquetFileName, isCsvFileName } from './classify-dataset-folder'
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
  let rootHasMetadataFiles = false

  for await (const child of datasetsRoot.values()) {
    const candidate = child as DirectoryHandleWithIter
    if (candidate?.kind === 'file') {
      const fileName = (candidate as unknown as { name?: string }).name ?? ''
      if (isParquetFileName(fileName) || isCsvFileName(fileName)) rootHasMetadataFiles = true
      continue
    }
    if (candidate?.kind !== 'directory') continue

    const folderName = candidate.name?.trim()
    if (!folderName || isReservedDatasetsChildFolderName(folderName)) continue

    childCandidates.push({ directory: candidate, folderName })
  }

  // Look up the datasets-root `_processed` mirror folder once, if present, so
  // sibling source folders (e.g. `night5_6`) can be matched against their
  // mirrored output (e.g. `_processed/night5_6`) instead of being scanned
  // as unrelated, separate datasets.
  let processedRoot: DirectoryHandleWithIter | null = null
  try {
    processedRoot = (await datasetsRoot.getDirectoryHandle?.('_processed', { create: false })) as
      | DirectoryHandleWithIter
      | null
  } catch {
    processedRoot = null
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

      let processedMirrorHandle: DirectoryHandleWithIter | null = null
      if (processedRoot) {
        try {
          processedMirrorHandle = (await processedRoot.getDirectoryHandle?.(folderName, { create: false })) as
            | DirectoryHandleWithIter
            | null
        } catch {
          processedMirrorHandle = null
        }
      }

      // The package may already be set up on the mirror side (e.g.
      // _processed/night5_6/dataset.json), even though the source folder
      // itself (night5_6) has no manifest. Check there before treating this
      // as a folder that still needs migration.
      if (processedMirrorHandle) {
        const mirrorManifestInfo = await readDatasetManifestSummary(processedMirrorHandle)
        if (mirrorManifestInfo.hasManifest) {
          return {
            package: {
              folderName,
              datasetId: mirrorManifestInfo.datasetId,
              hasManifest: true as const,
              packagePath: `_processed/${folderName}`,
            },
            pending: null,
          }
        }
      }

      const kind = await classifyDatasetFolder({ directory, folderName, processedMirrorHandle, rootHasMetadataFiles })
      if (kind !== 'package' && kind !== 'skip') {
        return { package: null, pending: { folderName, kind, processedMirrorHandle } }
      }

      return { package: null, pending: null }
    }),
  )

  for (const item of classified) {
    if (item.package) packages.push(item.package)
    if (item.pending) pendingMigration.push(item.pending)
  }

  // Fallback: if the root contains only a `_processed/` folder (no source siblings),
  // enumerate `_processed/` directly and register any subfolder with a dataset.json.
  // This lets collaborators open a shared processed-only folder without source images.
  if (processedRoot && typeof processedRoot.values === 'function') {
    const alreadyRegistered = new Set(packages.map((p) => p.folderName))
    for await (const child of processedRoot.values()) {
      const candidate = child as DirectoryHandleWithIter
      if (candidate?.kind !== 'directory') continue
      const folderName = candidate.name?.trim()
      if (!folderName || alreadyRegistered.has(folderName)) continue
      const manifestInfo = await readDatasetManifestSummary(candidate)
      if (manifestInfo.hasManifest) {
        packages.push({
          folderName,
          datasetId: manifestInfo.datasetId,
          hasManifest: true,
          packagePath: `_processed/${folderName}`,
        })
      }
    }
  }

  return { packages, pendingMigration }
}
