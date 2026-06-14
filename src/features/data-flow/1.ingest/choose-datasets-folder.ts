import { toast } from 'sonner'
import {
  ensureReadWritePermission,
  persistDatasetsDirectory,
} from '~/features/data-flow/3.persist/files.persistence'
import { setDatasetsWorkspaceFolderName } from '~/stores/datasets-workspace'
import { isDirectoryPickerAvailable, pickDirectoryHandle } from './directory-picker'
import type { FileSystemDirectoryHandleLike } from '~/features/mothbox-next/adapters/dinalab-mothbox-v1/browser-adapter-io'
import { directoryHasDatasetManifest } from './dataset-manifest'
import { finishDatasetsWorkspaceSetup } from './datasets-workspace-setup'

export { requireDatasetsFolderHandle } from './datasets-folder-handle'

/**
 * Opens the native folder picker and returns the chosen handle.
 *
 * MUST be called synchronously inside a user-gesture handler (click/keypress).
 * Firefox enforces this strictly — any await before showDirectoryPicker will
 * cause a SecurityError. Keep this function free of any awaits before the
 * showDirectoryPicker call so the browser gesture token is still live.
 */
export async function pickDatasetsFolderHandle(): Promise<FileSystemDirectoryHandleLike | null> {
  if (!isDirectoryPickerAvailable()) {
    toast.error('Folder picker is not available in this browser.')
    return null
  }

  return pickDirectoryHandle({
    mode: 'readwrite',
    title: 'datasets folder',
  })
}

/**
 * Finishes setting up the datasets folder after the handle has been obtained.
 * Safe to call from a mutation or any async context.
 */
export async function setupDatasetsFolder(handle: FileSystemDirectoryHandleLike): Promise<boolean> {
  const granted = await ensureReadWritePermission(handle)
  if (!granted) {
    toast.error('Write permission is required on the datasets folder.')
    return false
  }

  await persistDatasetsDirectory(handle)
  const name = (handle as { name?: string }).name?.trim() || 'datasets'
  setDatasetsWorkspaceFolderName(name)
  let speciesFileCount = 0
  try {
    const setup = await finishDatasetsWorkspaceSetup({ autoMigrate: false })
    speciesFileCount = setup.speciesFileCount
  } catch (err) {
    console.warn('🚨 setupDatasetsFolder: workspace setup failed', err)
    toast.error('Datasets folder saved, but scanning packages failed. Try reopening the folder.')
    return false
  }

  toast.success('Datasets folder set', {
    description:
      speciesFileCount > 0
        ? `Packages live here; ${speciesFileCount} species list${speciesFileCount === 1 ? '' : 's'} loaded from ${name}/Species/.`
        : `Legacy datasets will be converted into subfolders here (e.g. ${name}/my-dataset/). Add CSVs under ${name}/Species/ for identify lists.`,
  })
  return true
}

/** @deprecated Use pickDatasetsFolderHandle() + setupDatasetsFolder() separately so
 * the showDirectoryPicker call stays inside the user-gesture handler. */
export async function chooseDatasetsFolder(): Promise<boolean> {
  const handle = await pickDatasetsFolderHandle()
  if (!handle) return false
  return setupDatasetsFolder(handle)
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

  const alreadyPackage = await directoryHasDatasetManifest(packageHandle)
  if (alreadyPackage) {
    throw new Error(
      `"${safeName}" already exists under your datasets folder and contains dataset.json. Pick a different legacy folder or remove/rename that package first.`,
    )
  }

  return packageHandle
}

export function sanitizeDatasetFolderName(name: string): string {
  const trimmed = name.trim() || 'dataset'
  return trimmed.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
}
