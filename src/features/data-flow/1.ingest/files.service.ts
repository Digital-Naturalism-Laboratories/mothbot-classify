import { datasetStore } from '~/stores/dataset'
import { pickerErrorStore } from '~/stores/ui'
import { directoryFilesStore, selectedFilesStore } from './files.state'
import {
  collectIndexedFromDirectoryHandle,
  normalizeIndexedFilesForIngest,
  pickDirectoryFilesWithPaths,
  type IndexedPickedFile,
} from './files.fs'
import {
  ensureReadPermission,
  forgetSavedDirectory,
  loadSavedDirectory,
  persistPickedDirectory,
} from '~/features/data-flow/3.persist/files.persistence'
import { ingestIndexedFolderFiles } from './ingest-folder-pipeline'
import { resetAllEntityStores } from '~/stores/entities'
import { forgetDatasetsDirectory } from '~/features/data-flow/3.persist/files.persistence'
import { clearDatasetsWorkspace } from '~/stores/datasets-workspace'
import { setActiveDatasetFolderName } from '~/stores/datasets-registry'
import type { FileSystemDirectoryHandleLike } from '~/utils/fs-directory-handle'
import { formatFilesystemError, isFilesystemNotFoundError } from '~/utils/fs-error'

export async function openDirectory() {
  console.log('🏁 openDirectory: start picking projects folder')
  const tStart = performance.now()
  const maxRetries = 3
  let retries = 0
  let indexed: IndexedPickedFile[] = []
  let directoryHandle: FileSystemDirectoryHandleLike | null = null
  let totalPickMs = 0

  while (retries < maxRetries) {
    const tPick = performance.now()
    const pickResult = await pickDirectoryFilesWithPaths()
    const pickMs = Math.round(performance.now() - tPick)
    totalPickMs += pickMs
    indexed = pickResult.indexed
    directoryHandle = pickResult.directoryHandle
    const totalPicked = indexed?.length ?? 0
    console.log('📂 openDirectory: collected files', { totalPicked, pickMs, retries })
    if (!indexed?.length) return

    const normalized = normalizeIndexedFilesForIngest({ files: indexed })
    if (normalized.ok) {
      indexed = normalized.files
      if (directoryHandle) {
        await persistPickedDirectory(directoryHandle)
      }
      break
    }

    retries++
    const msg =
      normalized.message ??
      `Selected folder is too deep. Please pick ${normalized.levelsUp} level(s) up so dataset/deployment/night are included.`
    pickerErrorStore.set(msg)
    if (retries >= maxRetries) {
      await forgetSavedDirectory()
      return
    }
  }

  const tPipeline = performance.now()
  const result = await ingestIndexedFolderFiles({ files: indexed, pathsAlreadyNormalized: true })
  const pipelineMs = Math.round(performance.now() - tPipeline)
  const totalMs = Math.round(performance.now() - tStart)

  if (!result.ok) {
    console.log('🚨 openDirectory: ingest failed', { message: result.message })
    pickerErrorStore.set(result.message)
    if (result.levelsUp) return
    await forgetSavedDirectory()
    return
  }

  console.log('✅ openDirectory: ingestion complete', { totalFiles: result.fileCount, ingestMode: result.ingestMode, totalMs })
  console.log('⏱️ openDirectory: timings', { pickMs: totalPickMs, pipelineMs, totalMs })
}

export function clearSelections() {
  selectedFilesStore.set([])
  directoryFilesStore.set([])
  datasetStore.set(null)
  resetAllEntityStores()
  clearDatasetsWorkspace()

  void forgetSavedDirectory()
  void forgetDatasetsDirectory()
}

export async function tryRestoreLegacyPickedDirectory() {
  try {
    console.log('🏁 restoreLegacyDirectory: attempting to restore legacy picked folder')

    const tStart = performance.now()
    const handle = await loadSavedDirectory()
    if (!handle) {
      console.log('❌ restoreDirectory: no saved directory handle found')
      pickerErrorStore.set(null)
      return false
    }

    const granted = await ensureReadPermission(handle as FileSystemDirectoryHandleLike)
    if (!granted) {
      console.log('❌ restoreDirectory: read permission denied')
      return false
    }

    const tCollect = performance.now()
    const items = await collectIndexedFromDirectoryHandle(handle as FileSystemDirectoryHandleLike)
    const collectMs = Math.round(performance.now() - tCollect)
    console.log('📂 restoreDirectory: collected files', { total: items.length, ms: collectMs })

    const tPipeline = performance.now()
    const result = await ingestIndexedFolderFiles({ files: items })
    const pipelineMs = Math.round(performance.now() - tPipeline)
    const totalMs = Math.round(performance.now() - tStart)

    if (!result.ok) {
      console.log('🚨 restoreDirectory: ingest failed', { message: result.message })
      pickerErrorStore.set(result.message)
      if (isFilesystemNotFoundError(result.message)) await forgetSavedDirectory()
      return false
    }

    console.log('✅ restoreDirectory: ingestion complete', {
      totalFiles: result.fileCount,
      ingestMode: result.ingestMode,
      totalMs,
    })
    console.log('⏱️ restoreDirectory: timings', { collectMs, pipelineMs, totalMs })
    pickerErrorStore.set(null)
    const folderName = (handle as { name?: string }).name?.trim()
    if (folderName) setActiveDatasetFolderName(folderName)
    return true
  } catch (err) {
    const message = formatFilesystemError(err)
    console.log('🚨 restoreDirectory: unexpected error', { message, err })
    pickerErrorStore.set(message)
    if (isFilesystemNotFoundError(err)) await forgetSavedDirectory()
    return false
  }
}
