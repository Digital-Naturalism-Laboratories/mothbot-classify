/** Archived legacy tree inside a mothbox-next package; not a legacy ingest root. */
export const PACKAGE_ARCHIVE_DIR = '00_source'

export function normalizeIngestRelativePath(path: string): string {
  return (path ?? '').replaceAll('\\', '/').replace(/^\/+/, '')
}

export function isPackageArchiveRelativePath(path: string): boolean {
  const normalized = normalizeIngestRelativePath(path)
  return normalized === PACKAGE_ARCHIVE_DIR || normalized.startsWith(`${PACKAGE_ARCHIVE_DIR}/`)
}

export function excludePackageArchiveIndexedFiles<T extends { path: string }>(files: T[]): T[] {
  return files.filter((entry) => !isPackageArchiveRelativePath(entry.path))
}
