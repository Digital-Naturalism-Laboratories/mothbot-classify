import { toast } from 'sonner'
import { requireDatasetsFolderHandle } from './datasets-folder-handle'
import { openMothboxNextPackageFromHandle } from './open-mothbox-next-package'
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

  let subdir: FileSystemDirectoryHandleLike | undefined
  try {
    subdir = await root.getDirectoryHandle?.(folderName, { create: false })
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
