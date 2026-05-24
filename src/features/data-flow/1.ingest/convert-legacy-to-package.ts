import { toast } from 'sonner'
import { collectFilesWithPathsRecursively, type IndexedPickedFile } from './files.fs'
import { persistPickedDirectory } from '~/features/data-flow/3.persist/files.persistence'
import { singlePassIngest } from './files.single-pass'
import { resetAllEntityStores } from '~/stores/entities'
import { pickerErrorStore } from '~/stores/ui'
import { userSessionStore } from '~/stores/ui'
import { setActiveDatasetFolderName } from '~/stores/datasets-registry'
import { runDinalabMothboxV1Adapter } from '~/features/mothbox-next/adapters/dinalab-mothbox-v1/run-adapter'
import { createThrottledProgressCallback } from '~/features/mothbox-next/adapters/dinalab-mothbox-v1/adapter-progress'
import {
  createBrowserDinalabAdapterIO,
  type FileSystemDirectoryHandleLike,
} from '~/features/mothbox-next/adapters/dinalab-mothbox-v1/browser-adapter-io'
import {
  chooseDatasetsFolder,
  getOrCreateDatasetPackageHandle,
  requireDatasetsFolderHandle,
  sanitizeDatasetFolderName,
} from './choose-datasets-folder'
import { isDirectoryPickerAvailable, pickDirectoryHandle } from './directory-picker'

export { isDirectoryPickerAvailable } from './directory-picker'

const CONVERT_LEGACY_TOAST_ID = 'convert-legacy-mothbox-next'

/**
 * 1. Datasets folder (parent of all packages) — use chooseDatasetsFolder() first.
 * 2. Legacy dataset folder (old deployment/night tree with bot JSON + patches).
 * 3. Writes a new package at datasets/<legacy-folder-name>/ and opens it.
 */
export async function convertLegacyToMothboxNextPackage(params?: {
  legacyHandle?: FileSystemDirectoryHandleLike
}): Promise<boolean> {
  if (!isDirectoryPickerAvailable()) {
    toast.error('Folder picker is not available in this browser.')
    return false
  }

  let datasetsRoot = await requireDatasetsFolderHandle()
  if (!datasetsRoot) {
    toast.message('Choose your datasets folder first', {
      description: 'This is the parent folder that will contain every converted dataset.',
    })
    const chosen = await chooseDatasetsFolder()
    if (!chosen) return false
    datasetsRoot = await requireDatasetsFolderHandle()
    if (!datasetsRoot) return false
  }

  const legacyHandle =
    params?.legacyHandle ??
    (await pickDirectoryHandle({
      mode: 'read',
      title: 'legacy dataset',
    }))
  if (!legacyHandle) return false

  const legacyFolderName = (legacyHandle as { name?: string }).name?.trim() || 'dataset'

  let packageHandle: FileSystemDirectoryHandleLike
  try {
    packageHandle = await getOrCreateDatasetPackageHandle({
      datasetsRoot,
      datasetFolderName: legacyFolderName,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    toast.error('Cannot create package folder', { description: message })
    return false
  }

  const datasetId = sanitizeDatasetFolderName(legacyFolderName)
  const user = userSessionStore.get()
  const humanClassifierId = (user?.initials || 'user').trim().toLowerCase() || 'user'

  const reportProgress = createThrottledProgressCallback((progress) => {
    toast.loading(progress.message, {
      id: CONVERT_LEGACY_TOAST_ID,
      description: progress.description ?? `Copying into your datasets folder as “${datasetId}/”.`,
    })
  })

  try {
    toast.loading('Converting legacy dataset…', {
      id: CONVERT_LEGACY_TOAST_ID,
      description: `Copying into your datasets folder as “${datasetId}/”.`,
    })

    const result = await runDinalabMothboxV1Adapter({
      datasetId,
      humanClassifierId,
      archiveSourceTree: true,
      legacySourceRootName: (legacyHandle as { name?: string }).name,
      io: createBrowserDinalabAdapterIO({ sourceHandle: legacyHandle, packageHandle }),
      onProgress: reportProgress,
    })
    reportProgress.flush()

    toast.loading('Opening package…', {
      id: CONVERT_LEGACY_TOAST_ID,
      description: 'Reading files from the new dataset folder…',
    })

    await persistPickedDirectory(packageHandle)
    resetAllEntityStores()
    const indexed = await collectIndexedFromHandle(packageHandle)

    toast.loading('Opening package…', {
      id: CONVERT_LEGACY_TOAST_ID,
      description: `Loading ${indexed.length.toLocaleString()} file${indexed.length === 1 ? '' : 's'} into the app…`,
    })

    const ingest = await singlePassIngest({ files: indexed })
    if (!ingest.ok) {
      pickerErrorStore.set(ingest.message)
      toast.error('Package was created but could not be opened.', {
        id: CONVERT_LEGACY_TOAST_ID,
        description: ingest.message,
      })
      return false
    }

    pickerErrorStore.set(null)
    setActiveDatasetFolderName(datasetId)
    toast.success('Dataset migrated', {
      id: CONVERT_LEGACY_TOAST_ID,
      description: `${result.patchCount.toLocaleString()} patches · ${datasetId}/ (under your datasets folder)`,
    })
    return true
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    pickerErrorStore.set(message)
    toast.error('Conversion failed', { id: CONVERT_LEGACY_TOAST_ID, description: message })
    return false
  }
}

async function collectIndexedFromHandle(handle: FileSystemDirectoryHandleLike): Promise<IndexedPickedFile[]> {
  const items: IndexedPickedFile[] = []
  await collectFilesWithPathsRecursively({ directoryHandle: handle as any, pathParts: [], items })

  return Promise.all(
    items.map(async (entry) => {
      if (entry.file) return entry
      const fileHandle = entry.handle as { getFile?: () => Promise<File> } | undefined
      const file = await fileHandle?.getFile?.()
      return { ...entry, file: file ?? entry.file, size: file?.size ?? entry.size }
    }),
  )
}
