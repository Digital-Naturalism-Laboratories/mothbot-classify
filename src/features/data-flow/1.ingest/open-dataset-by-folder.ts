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

  const opened = await openMothboxNextPackageFromHandle(subdir, { showSuccessToast })
  return opened.ok
}
