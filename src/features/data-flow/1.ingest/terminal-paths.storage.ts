const DATASETS_ROOT_PATH_KEY = 'mbl/terminal/datasetsRootPath'
const LEGACY_SOURCE_PATH_KEY = 'mbl/terminal/legacySourcePath'
const LAST_LEGACY_FOLDER_NAME_KEY = 'mbl/terminal/lastLegacyFolderName'

export type TerminalFolderPaths = {
  datasetsRootPath: string
  legacySourcePath: string
  lastLegacyFolderName: string
}

export function loadTerminalFolderPaths(): TerminalFolderPaths {
  return {
    datasetsRootPath: readLocalStorage(DATASETS_ROOT_PATH_KEY),
    legacySourcePath: readLocalStorage(LEGACY_SOURCE_PATH_KEY),
    lastLegacyFolderName: readLocalStorage(LAST_LEGACY_FOLDER_NAME_KEY),
  }
}

export function loadSavedLegacySourcePathForFolder(legacyFolderName: string) {
  const trimmedName = legacyFolderName.trim()
  if (!trimmedName) return ''

  const { legacySourcePath } = loadTerminalFolderPaths()
  if (!legacySourcePath) return ''

  const base = basenamePath(legacySourcePath)
  return base === trimmedName ? legacySourcePath : ''
}

export function saveTerminalFolderPaths(paths: Partial<TerminalFolderPaths>) {
  if (paths.datasetsRootPath !== undefined) {
    writeLocalStorage(DATASETS_ROOT_PATH_KEY, paths.datasetsRootPath.trim())
  }
  if (paths.legacySourcePath !== undefined) {
    writeLocalStorage(LEGACY_SOURCE_PATH_KEY, paths.legacySourcePath.trim())
  }
  if (paths.lastLegacyFolderName !== undefined) {
    writeLocalStorage(LAST_LEGACY_FOLDER_NAME_KEY, paths.lastLegacyFolderName.trim())
  }
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

function basenamePath(path: string) {
  const normalized = path.replace(/[/\\]+$/, '')
  const index = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'))
  return index < 0 ? normalized : normalized.slice(index + 1)
}
