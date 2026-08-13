import { toast } from 'sonner'
import { requireDatasetsFolderHandle } from './datasets-folder-handle'
import { openMothboxNextPackageFromHandle } from './open-mothbox-next-package'
import { datasetsRegistryStore } from '~/stores/datasets-registry'
import type { FileSystemDirectoryHandleLike } from '~/features/mothbox-next/adapters/dinalab-mothbox-v1/browser-adapter-io'

type DirectoryHandleWithIter = FileSystemDirectoryHandleLike & {
  getDirectoryHandle?: (name: string, opts?: { create?: boolean }) => Promise<FileSystemDirectoryHandleLike>
}

export async function openDatasetByFolderName(params: {
  folderName: string
  showSuccessToast?: boolean
}): Promise<boolean> {
  const { folderName, showSuccessToast } = params
  const root = (await requireDatasetsFolderHandle({ mode: 'read' })) as DirectoryHandleWithIter | null
  if (!root) {
    toast.error('Datasets folder is not set.')
    return false
  }

  // The package's manifest/records may live at a different path than the
  // display folder name (e.g. _processed/night5_6 for the processed-mirror
  // layout, where source images stay in night5_6 but the package output is
  // written into _processed to keep the shareable bundle small).
  const registryEntry = datasetsRegistryStore.get().find((entry) => entry.folderName === folderName)
  const relativePackagePath = registryEntry?.packagePath ?? folderName
  const pathSegments = relativePackagePath.split('/').filter(Boolean)

  let subdir: FileSystemDirectoryHandleLike | undefined = root
  try {
    for (const segment of pathSegments) {
      subdir = await (subdir as DirectoryHandleWithIter)?.getDirectoryHandle?.(segment, { create: false })
      if (!subdir) break
    }
  } catch {
    subdir = undefined
  }

  if (!subdir) {
    toast.error(`Could not open dataset folder “${folderName}”.`)
    return false
  }

  // When the package lives in a different location than the display name
  // (e.g. _processed/night5_6), the display folder itself (night5_6) is the
  // original source location, which may still hold full-size source photos
  // not included in the package's _processed mirror.
  let originalSourceHandle: FileSystemDirectoryHandleLike | undefined
  if (registryEntry?.packagePath && registryEntry.packagePath !== folderName) {
    try {
      originalSourceHandle = await (root as DirectoryHandleWithIter)?.getDirectoryHandle?.(folderName, {
        create: false,
      })
    } catch {
      originalSourceHandle = undefined
    }
  }

  const opened = await openMothboxNextPackageFromHandle(subdir, { showSuccessToast, originalSourceHandle })

  // Mothbot Process can add night folders to a package without updating its
  // records, so check once the package is actually open. Read-only; the user
  // confirms before anything is written. Self-suppresses during a merge.
  if (opened.ok) {
    const { checkForNewNightsInOpenPackage } = await import('./check-for-new-nights')
    await checkForNewNightsInOpenPackage().catch((error) => {
      console.warn('🌀 openDatasetByFolderName: new-night check failed', error)
      return 0
    })
  }

  return opened.ok
}
