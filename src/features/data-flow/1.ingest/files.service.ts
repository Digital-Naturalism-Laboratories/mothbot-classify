import { datasetStore } from '~/stores/dataset'
import { pickerErrorStore } from '~/stores/ui'
import { directoryFilesStore, selectedFilesStore } from './files.state'
import {
  collectFilesWithPathsRecursively,
  normalizePathsToRoot,
  pickDirectoryFilesWithPaths,
  type IndexedPickedFile,
} from './files.fs'
import { validateProjectRootSelection } from './files.validation'
import {
  ensureReadPermission,
  forgetSavedDirectory,
  loadSavedDirectory,
  persistPickedDirectory,
} from '~/features/data-flow/3.persist/files.persistence'
import { applyIndexedFilesState } from './files.initialize'
import { singlePassIngest } from './files.single-pass'
import { resetAllEntityStores } from '~/stores/entities'

export async function openDirectory() {
  console.log('🏁 openDirectory: start picking projects folder')
  const tStart = performance.now()
  const maxRetries = 3
  let retries = 0
  let indexed: IndexedPickedFile[] = []
  let directoryHandle: unknown = null
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

    const normalized = normalizePathsToRoot({ files: indexed })
    if (normalized.ok) {
      indexed = normalized.files
      if (directoryHandle) {
        await persistPickedDirectory(directoryHandle as any)
      }
      break
    }

    retries++
    const msg = `Selected folder is too deep. Please pick ${normalized.levelsUp} level(s) up so project/site/deployment/night are included.`
    pickerErrorStore.set(msg)
    if (retries >= maxRetries) {
      await forgetSavedDirectory()
      return
    }
  }
  const totalPicked = indexed?.length ?? 0

  console.log('🌀 openDirectory: validating folder structure')
  const tValidate = performance.now()
  const validation = validateProjectRootSelection({ files: indexed })
  const validateMs = Math.round(performance.now() - tValidate)
  if (!validation.ok) {
    console.log('🚨 openDirectory: validation failed', { message: validation.message })
    pickerErrorStore.set(validation.message)
    await forgetSavedDirectory()
    return
  }

  const tIndexApply = performance.now()
  applyIndexedFilesState({ indexed })
  const indexApplyMs = Math.round(performance.now() - tIndexApply)

  const tSingle = performance.now()
  await singlePassIngest({ files: indexed })
  const singleMs = Math.round(performance.now() - tSingle)
  const totalMs = Math.round(performance.now() - tStart)
  console.log('✅ openDirectory: ingestion complete', { totalFiles: totalPicked, totalMs })
  console.log('⏱️ openDirectory: timings', { pickMs: totalPickMs, validateMs, indexApplyMs, singleMs, totalMs })
  pickerErrorStore.set(null)
}

export function clearSelections() {
  selectedFilesStore.set([])
  directoryFilesStore.set([])
  datasetStore.set(null)
  resetAllEntityStores()

  void forgetSavedDirectory()
}

export async function tryRestoreFromSavedDirectory() {
  try {
    console.log('🏁 restoreDirectory: attempting to restore previously picked folder')
    const tStart = performance.now()

    const tLoad = performance.now()
    const handle = await loadSavedDirectory()
    const loadMs = Math.round(performance.now() - tLoad)
    console.log('🌀 restoreDirectory: loaded saved directory handle', { ms: loadMs })
    if (!handle) {
      console.log('❌ restoreDirectory: no saved directory handle found')
      return false
    }

    const tPermission = performance.now()
    const granted = await ensureReadPermission(handle as any)
    const permissionMs = Math.round(performance.now() - tPermission)
    console.log('🌀 restoreDirectory: checked read permission', { granted, ms: permissionMs })
    if (!granted) {
      console.log('❌ restoreDirectory: read permission denied')
      return false
    }

    const items: IndexedPickedFile[] = []
    const tCollect = performance.now()
    console.log('🌀 restoreDirectory: starting file collection...')

    await collectFilesWithPathsRecursively({ directoryHandle: handle as any, pathParts: [], items })
    const collectMs = Math.round(performance.now() - tCollect)
    console.log('📂 restoreDirectory: collected files', { total: items.length, ms: collectMs })
    const normalized = normalizePathsToRoot({ files: items })
    if (!normalized.ok) {
      const msg = `Saved folder is too deep. Please pick ${normalized.levelsUp} level(s) up so project/site/deployment/night are included.`
      pickerErrorStore.set(msg)
      return false
    }
    const normalizedItems = normalized.files

    const tValidate = performance.now()
    const validation = validateProjectRootSelection({ files: normalizedItems })
    const validateMs = Math.round(performance.now() - tValidate)
    console.log('🌀 restoreDirectory: validated folder structure', { validateMs })
    if (!validation.ok) {
      console.log('🚨 restoreDirectory: validation failed', { message: validation.message })
      pickerErrorStore.set(validation.message)
      return false
    }

    const tIndexApply = performance.now()
    applyIndexedFilesState({ indexed: normalizedItems })
    const indexApplyMs = Math.round(performance.now() - tIndexApply)
    console.log('🌀 restoreDirectory: applied indexed files', { indexApplyMs })

    const tSingle = performance.now()
    await singlePassIngest({ files: normalizedItems })
    const singleMs = Math.round(performance.now() - tSingle)
    console.log('🌀 restoreDirectory: single pass ingestion', { singleMs })
    const totalMs = Math.round(performance.now() - tStart)
    console.log('✅ restoreDirectory: ingestion complete', { totalFiles: items.length, totalMs })
    console.log('⏱️ restoreDirectory: timings', { loadMs, permissionMs, collectMs, validateMs, indexApplyMs, singleMs, totalMs })
    pickerErrorStore.set(null)
    return true
  } catch {
    return false
  }
}

// moved to files.initialize
