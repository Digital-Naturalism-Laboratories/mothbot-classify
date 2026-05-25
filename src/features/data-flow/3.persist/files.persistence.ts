import { idbDelete, idbGet, idbPut } from '~/utils/index-db'

const LOCAL_FLAG_KEY = 'mbl/pickedDir'
const LOCAL_NAME_KEY = 'mbl/pickedDirName'
const DATASETS_FLAG_KEY = 'mbl/datasetsDir'
const DATASETS_NAME_KEY = 'mbl/datasetsDirName'
const LAST_ACTIVE_DATASET_FOLDER_NAME_KEY = 'mbl/lastActiveDatasetFolderName'
const IDB_NAME = 'mothbox-local'
const IDB_STORE = 'fs-handles'

type FileSystemDirectoryHandleLike = {
  values: () => AsyncIterable<unknown>
  name?: string
  queryPermission?: (options: { mode: 'read' | 'readwrite' }) => Promise<'granted' | 'denied' | 'prompt'> | 'granted' | 'denied' | 'prompt'
  requestPermission?: (options: {
    mode: 'read' | 'readwrite'
  }) => Promise<'granted' | 'denied' | 'prompt'> | 'granted' | 'denied' | 'prompt'
}

export async function persistPickedDirectory(handle: FileSystemDirectoryHandleLike) {
  try {
    await idbPut(IDB_NAME, IDB_STORE, 'projectsRoot', handle)
    try {
      const name = (handle as unknown as { name?: string })?.name ?? ''
      localStorage.setItem(LOCAL_FLAG_KEY, '1')
      if (name) localStorage.setItem(LOCAL_NAME_KEY, name)
    } catch {
      // ignore localStorage errors
    }
  } catch {
    // ignore idb errors
  }
}

export async function loadSavedDirectory(): Promise<FileSystemDirectoryHandleLike | null> {
  try {
    const saved = (await idbGet(IDB_NAME, IDB_STORE, 'projectsRoot')) as FileSystemDirectoryHandleLike | null
    if (!saved) return null
    return saved
  } catch {
    return null
  }
}

export async function persistDatasetsDirectory(handle: FileSystemDirectoryHandleLike) {
  try {
    await idbPut(IDB_NAME, IDB_STORE, 'datasetsRoot', handle)
    try {
      const name = (handle as unknown as { name?: string })?.name ?? ''
      localStorage.setItem(DATASETS_FLAG_KEY, '1')
      if (name) localStorage.setItem(DATASETS_NAME_KEY, name)
    } catch {
      // ignore localStorage errors
    }
  } catch {
    // ignore idb errors
  }
}

export async function loadDatasetsDirectory(): Promise<FileSystemDirectoryHandleLike | null> {
  try {
    const saved = (await idbGet(IDB_NAME, IDB_STORE, 'datasetsRoot')) as FileSystemDirectoryHandleLike | null
    if (!saved) return null
    return saved
  } catch {
    return null
  }
}

export function loadLastActiveDatasetFolderName(): string | null {
  return readLocalStorage(LAST_ACTIVE_DATASET_FOLDER_NAME_KEY) || null
}

export function saveLastActiveDatasetFolderName(folderName: string | null) {
  const trimmed = folderName?.trim()
  writeLocalStorage(LAST_ACTIVE_DATASET_FOLDER_NAME_KEY, trimmed ?? '')
}

export function clearLastActiveDatasetFolderName() {
  writeLocalStorage(LAST_ACTIVE_DATASET_FOLDER_NAME_KEY, '')
}

function readLocalStorage(key: string) {
  try {
    return localStorage.getItem(key)?.trim() ?? ''
  } catch {
    return ''
  }
}

function writeLocalStorage(key: string, value: string) {
  try {
    if (!value) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // ignore
  }
}

export async function forgetDatasetsDirectory() {
  try {
    await idbDelete(IDB_NAME, IDB_STORE, 'datasetsRoot')
  } catch {
    // ignore idb errors
  }
  try {
    localStorage.removeItem(DATASETS_FLAG_KEY)
    localStorage.removeItem(DATASETS_NAME_KEY)
    clearLastActiveDatasetFolderName()
  } catch {
    // ignore localStorage errors
  }
}

export async function forgetSavedDirectory() {
  try {
    await idbDelete(IDB_NAME, IDB_STORE, 'projectsRoot')
  } catch {
    // ignore idb errors
  }
  try {
    localStorage.removeItem(LOCAL_FLAG_KEY)
    localStorage.removeItem(LOCAL_NAME_KEY)
  } catch {
    // ignore localStorage errors
  }
}

export async function ensureReadPermission(handle: FileSystemDirectoryHandleLike): Promise<boolean> {
  try {
    const query = (await (handle as unknown as { queryPermission?: (o: { mode: 'read' }) => Promise<string> | string }).queryPermission?.({
      mode: 'read',
    })) as 'granted' | 'denied' | 'prompt' | undefined
    if (query === 'granted') return true
    const req = (await (handle as unknown as { requestPermission?: (o: { mode: 'read' }) => Promise<string> | string }).requestPermission?.(
      {
        mode: 'read',
      },
    )) as 'granted' | 'denied' | 'prompt' | undefined
    if (req === 'granted') return true
    return false
  } catch {
    return false
  }
}

export async function ensureReadWritePermission(handle: FileSystemDirectoryHandleLike): Promise<boolean> {
  try {
    const query = (await (
      handle as unknown as { queryPermission?: (o: { mode: 'readwrite' }) => Promise<string> | string }
    ).queryPermission?.({
      mode: 'readwrite',
    })) as 'granted' | 'denied' | 'prompt' | undefined
    if (query === 'granted') return true
    const req = (await (
      handle as unknown as { requestPermission?: (o: { mode: 'readwrite' }) => Promise<string> | string }
    ).requestPermission?.({
      mode: 'readwrite',
    })) as 'granted' | 'denied' | 'prompt' | undefined
    if (req === 'granted') return true
    return false
  } catch {
    return false
  }
}

export const persistenceConstants = {
  LOCAL_FLAG_KEY,
  LOCAL_NAME_KEY,
  DATASETS_FLAG_KEY,
  DATASETS_NAME_KEY,
  LAST_ACTIVE_DATASET_FOLDER_NAME_KEY,
  IDB_NAME,
  IDB_STORE,
}
