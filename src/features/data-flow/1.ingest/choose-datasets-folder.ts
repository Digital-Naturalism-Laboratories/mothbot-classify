import { toast } from 'sonner'
import {
  ensureReadWritePermission,
  persistDatasetsDirectory,
} from '~/features/data-flow/3.persist/files.persistence'
import { setDatasetsWorkspaceFolderName } from '~/stores/datasets-workspace'
import { isDirectoryPickerAvailable, pickDirectoryHandle } from './directory-picker'
import type { FileSystemDirectoryHandleLike } from '~/features/mothbox-next/adapters/dinalab-mothbox-v1/browser-adapter-io'
import { scanDatasetsFolder } from './scan-datasets-folder'

export { requireDatasetsFolderHandle } from './datasets-folder-handle'

export async function chooseDatasetsFolder(): Promise<boolean> {
  if (!isDirectoryPickerAvailable()) {
    toast.error('Folder picker is not available in this browser.')
    return false
  }

  const handle = await pickDirectoryHandle({
    mode: 'readwrite',
    title: 'datasets folder',
  })
  if (!handle) return false

  const granted = await ensureReadWritePermission(handle)
  if (!granted) {
    toast.error('Write permission is required on the datasets folder.')
    return false
  }

  await persistDatasetsDirectory(handle)
  const name = (handle as { name?: string }).name?.trim() || 'datasets'
  setDatasetsWorkspaceFolderName(name)
  await scanDatasetsFolder().catch(() => null)

  toast.success('Datasets folder set', {
    description: `Legacy datasets will be converted into subfolders here (e.g. ${name}/my-dataset/).`,
  })
  return true
}

export async function getOrCreateDatasetPackageHandle(params: {
  datasetsRoot: FileSystemDirectoryHandleLike
  datasetFolderName: string
}): Promise<FileSystemDirectoryHandleLike> {
  const { datasetsRoot, datasetFolderName } = params
  const safeName = sanitizeDatasetFolderName(datasetFolderName)
  const packageHandle = (await datasetsRoot.getDirectoryHandle?.(safeName, {
    create: true,
  })) as FileSystemDirectoryHandleLike

  if (!packageHandle) throw new Error(`Could not create dataset folder: ${safeName}`)

  const alreadyPackage = await packageHasManifest(packageHandle)
  if (alreadyPackage) {
    throw new Error(
      `“${safeName}” already exists under your datasets folder and contains dataset.json. Pick a different legacy folder or remove/rename that package first.`,
    )
  }

  return packageHandle
}

async function packageHasManifest(packageHandle: FileSystemDirectoryHandleLike): Promise<boolean> {
  try {
    await packageHandle.getFileHandle?.('dataset.json', { create: false })
    return true
  } catch {
    return false
  }
}

export function sanitizeDatasetFolderName(name: string): string {
  const trimmed = name.trim() || 'dataset'
  return trimmed.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
}
