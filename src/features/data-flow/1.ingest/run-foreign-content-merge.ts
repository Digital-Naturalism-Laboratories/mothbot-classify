import type { FileSystemDirectoryHandleLike } from '~/utils/fs-directory-handle'
import { requireDatasetsFolderHandle } from './datasets-folder-handle'
import { mergeForeignFolderIntoPackage } from './merge-foreign-folder-into-package'
import { openMothboxNextPackageFromHandle } from './open-mothbox-next-package'
import { setContentIntegrationInProgress } from '~/stores/pending-dataset-migration'
import type { ForeignFolderCandidate } from './package-foreign-folders'

type DirectoryWithGet = FileSystemDirectoryHandleLike & {
  getDirectoryHandle?: (name: string, opts?: { create?: boolean }) => Promise<FileSystemDirectoryHandleLike>
}

export type RunForeignContentMergeResult = {
  mergedFolderCount: number
  addedPatchCount: number
  reloaded: boolean
}

export async function runForeignContentMerge(params: {
  packageFolderName: string
  foreignFolders: ForeignFolderCandidate[]
}): Promise<RunForeignContentMergeResult> {
  const { packageFolderName, foreignFolders } = params

  const datasetsRoot = await requireDatasetsFolderHandle({ mode: 'readwrite' })
  if (!datasetsRoot) {
    throw new Error('Choose your datasets folder from the menu, then try again.')
  }

  let packageHandle: FileSystemDirectoryHandleLike
  try {
    packageHandle = await (datasetsRoot as DirectoryWithGet).getDirectoryHandle?.(packageFolderName, {
      create: false,
    })
  } catch {
    throw new Error(`Could not open “${packageFolderName}”.`)
  }

  if (!packageHandle) {
    throw new Error(`Could not open “${packageFolderName}”.`)
  }

  setContentIntegrationInProgress(true)

  try {
    let addedPatchCount = 0

    for (const folder of foreignFolders) {
      const result = await mergeForeignFolderIntoPackage({
        packageHandle,
        folderName: packageFolderName,
        foreignFolderName: folder.folderName,
      })
      addedPatchCount += result.addedPatchCount
    }

    await openMothboxNextPackageFromHandle(packageHandle)

    return {
      mergedFolderCount: foreignFolders.length,
      addedPatchCount,
      reloaded: true,
    }
  } finally {
    setContentIntegrationInProgress(false)
  }
}
