/** Optional archive folder for legacy source (user-organized). */
export const PACKAGE_ARCHIVE_DIR = '00_source'

/** Mothbox-next managed paths at package root — not foreign deployments. */
export const PACKAGE_MANAGED_DIR_NAMES = new Set([
  PACKAGE_ARCHIVE_DIR,
  '01_patches',
  '02_records',
  '03_classifications',
  '04_exports',
])

export const PACKAGE_MANAGED_FILE_NAMES = new Set(['dataset.json', 'adapter-report.json'])

export function isReservedPackageChildName(name: string): boolean {
  const trimmed = name.trim()
  if (!trimmed) return true
  const lower = trimmed.toLowerCase()
  if (PACKAGE_MANAGED_DIR_NAMES.has(lower)) return true
  if (PACKAGE_MANAGED_FILE_NAMES.has(lower)) return true
  return false
}

export function normalizeIngestRelativePath(path: string): string {
  return (path ?? '').replaceAll('\\', '/').replace(/^\/+/, '')
}

export function isPackageArchiveRelativePath(path: string): boolean {
  const normalized = normalizeIngestRelativePath(path)
  return normalized === PACKAGE_ARCHIVE_DIR || normalized.startsWith(`${PACKAGE_ARCHIVE_DIR}/`)
}

export function isPackageArchivePatchMediaPath(path: string): boolean {
  const normalized = normalizeIngestRelativePath(path).toLowerCase()
  if (!normalized.startsWith(`${PACKAGE_ARCHIVE_DIR}/`)) return false
  if (!normalized.includes('/patches/')) return false
  return /\.(jpg|jpeg|png)$/i.test(normalized)
}

export function excludePackageArchiveIndexedFiles<T extends { path: string }>(files: T[]): T[] {
  return files.filter((entry) => {
    if (!isPackageArchiveRelativePath(entry.path)) return true
    return isPackageArchivePatchMediaPath(entry.path)
  })
}

export function toPackageArchiveRelativePath(path: string): string {
  const normalized = normalizeIngestRelativePath(path)
  if (!normalized || isPackageArchiveRelativePath(normalized)) return normalized
  return `${PACKAGE_ARCHIVE_DIR}/${normalized}`
}

export function stripPackageArchivePrefix(path: string): string {
  const normalized = normalizeIngestRelativePath(path)
  if (normalized === PACKAGE_ARCHIVE_DIR) return ''
  const prefix = `${PACKAGE_ARCHIVE_DIR}/`
  if (normalized.startsWith(prefix)) return normalized.slice(prefix.length)
  return normalized
}

export function packageArchivePathCandidates(logicalPath: string): string[] {
  const normalized = normalizeIngestRelativePath(logicalPath)
  if (!normalized) return []
  if (isPackageArchiveRelativePath(normalized)) {
    const stripped = stripPackageArchivePrefix(normalized)
    return stripped ? [normalized, stripped] : [normalized]
  }
  return [normalized, toPackageArchiveRelativePath(normalized)]
}

export function rowQualifiesForArchiveRelocation(params: {
  botPath: string
  indexedPathSet: Set<string>
}): boolean {
  const normalized = normalizeIngestRelativePath(params.botPath)
  if (!normalized || isPackageArchiveRelativePath(normalized)) return false

  const archivedPath = toPackageArchiveRelativePath(normalized)
  const archiveHit = params.indexedPathSet.has(archivedPath)
  const inPlaceHit = params.indexedPathSet.has(normalized)
  return archiveHit && !inPlaceHit
}

export function deriveSourcePhotoAssetPathFromBotPath(botPath: string): string | undefined {
  const normalized = normalizeIngestRelativePath(botPath)
  if (!normalized.endsWith('_botdetection.json')) return undefined
  return normalized.replace(/_botdetection\.json$/i, '.jpg')
}
