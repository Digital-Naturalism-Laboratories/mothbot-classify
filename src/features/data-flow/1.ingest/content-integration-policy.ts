import type { PendingDatasetMigration } from './pending-dataset-migration-types'
import type { ForeignFolderCandidate } from './package-foreign-folders'
import { findUntrackedPendingMigrations } from './untracked-pending-datasets'
import {
  findUnmergedForeignFolders,
  indexedSourceRootsFromPatchSources,
  listForeignFoldersInPackage,
} from './package-foreign-folders'
import type { DatasetRegistryEntry } from '~/stores/datasets-registry'
import type { PatchSourceRecord } from '~/features/mothbox-next/records'
import type { FileSystemDirectoryHandleLike } from '~/utils/fs-directory-handle'

export type PendingSetupPolicy = {
  kind: 'pending-setup'
  pending: PendingDatasetMigration[]
}

export type ForeignMergePolicy = {
  kind: 'foreign-merge'
  packageFolderName: string
  foreignFolders: ForeignFolderCandidate[]
  photosOnly: ForeignFolderCandidate[]
}

export type ContentIntegrationPolicy = PendingSetupPolicy | ForeignMergePolicy

export function buildPendingSetupPolicy(params: {
  pendingMigration: PendingDatasetMigration[]
  registry: DatasetRegistryEntry[]
  dismissedFolderNames?: Iterable<string>
}): PendingSetupPolicy | null {
  const pending = findUntrackedPendingMigrations(params)
  if (pending.length === 0) return null
  return { kind: 'pending-setup', pending }
}

export function buildForeignMergePolicy(params: {
  packageFolderName: string
  patchSources: PatchSourceRecord[]
  candidates: ForeignFolderCandidate[]
}): ForeignMergePolicy | null {
  const indexedSourceRoots = indexedSourceRootsFromPatchSources(params.patchSources)
  const foreignFolders = findUnmergedForeignFolders({
    candidates: params.candidates,
    indexedSourceRoots,
  })
  if (foreignFolders.length === 0) return null

  const photosOnly = params.candidates.filter((item) => item.photosOnly)
  return {
    kind: 'foreign-merge',
    packageFolderName: params.packageFolderName,
    foreignFolders,
    photosOnly,
  }
}

export async function detectForeignMergePolicy(params: {
  packageHandle: FileSystemDirectoryHandleLike
  packageFolderName: string
  patchSources: PatchSourceRecord[]
}): Promise<ForeignMergePolicy | null> {
  const candidates = await listForeignFoldersInPackage(params.packageHandle)
  return buildForeignMergePolicy({
    packageFolderName: params.packageFolderName,
    patchSources: params.patchSources,
    candidates,
  })
}
