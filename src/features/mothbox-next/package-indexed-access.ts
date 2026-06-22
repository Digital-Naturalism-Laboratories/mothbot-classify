import type { IndexedFile } from '~/stores/entities/photos'
import type { PackageDataAccess } from './load-package-data'
import type { PackageFileAccess } from './validate-dataset-package'
import { findPackageManifestInIndexedFiles, isPackageIndexedFiles } from './load-package-data'
import { normalizePackageRelativePath, toPackageRelativePath } from './package-paths'
import type { PatchRecord } from './records'
import type { PackageTextWriter } from './persist/persist-human-classifications'
import { joinRelativePaths } from './package-paths'
import { formatFilesystemError, isFilesystemNotFoundError } from '~/utils/fs-error'
import {
  normalizeIngestRelativePath,
  packageArchivePathCandidates,
} from '~/features/data-flow/1.ingest/reserved-paths'

export { isPackageIndexedFiles }

function basenameFromPath(path: string) {
  const normalized = path.replaceAll('\\', '/').replace(/\/+$/, '')
  const segments = normalized.split('/').filter(Boolean)
  return segments[segments.length - 1] ?? ''
}

/**
 * When a package folder is indexed via the File System Access API, paths are often
 * prefixed with the picked directory name (e.g. my-dataset/dataset.json). Package
 * loaders expect paths relative to the package root (dataset.json at the top).
 */
export function normalizeIndexedPathsToPackageRoot<T extends { path: string }>(files: T[]): T[] {
  const manifestInfo = findPackageManifestInIndexedFiles(
    files.map((file) => ({ path: file.path, name: basenameFromPath(file.path) })),
  )
  if (!manifestInfo?.packageRoot) return files

  const prefix = `${manifestInfo.packageRoot.replace(/\/+$/, '')}/`

  return files.map((file) => {
    const normalized = normalizePackageRelativePath(file.path)
    if (!normalized.startsWith(prefix)) return file
    return { ...file, path: normalized.slice(prefix.length) }
  })
}

export function buildIndexedFileMap(files: Array<{ path: string }>): Record<string, IndexedFile> {
  const index: Record<string, IndexedFile> = {}
  for (const file of files) {
    index[normalizePackageRelativePath(file.path)] = file as IndexedFile
  }
  return index
}

export async function readIndexedEntryText(entry: IndexedFile): Promise<string> {
  if (entry.file) return readBlobText(entry.file)
  const handle = entry.handle as { getFile?: () => Promise<File> } | undefined
  try {
    const file = await handle?.getFile?.()
    if (!file) throw new Error(`Cannot read ${entry.path}`)
    return readBlobText(file)
  } catch (err) {
    throw toIndexedFileReadError({ path: entry.path, err })
  }
}

async function readBlobText(file: File | Blob): Promise<string> {
  if (typeof file.text === 'function') return file.text()
  const buffer = await file.arrayBuffer()
  return new TextDecoder().decode(buffer)
}

export function createPackageDataAccessFromIndexedFiles(params: {
  files: IndexedFile[]
  packageRoot: string
}): PackageDataAccess {
  const { files, packageRoot } = params
  const byPath = buildIndexedFileMap(files)

  return {
    readPackageFile: async (packageRelativePath) => {
      const rel = toPackageRelativePath({ packageRoot, filePath: packageRelativePath })
      const entry = byPath[rel]
      if (!entry) throw new Error(`Missing file: ${rel}`)
      return readIndexedEntryText(entry)
    },
    listClassificationFiles: async (classificationsDir) => {
      const prefix = normalizePackageRelativePath(classificationsDir).replace(/\/+$/, '') + '/'
      return Object.keys(byPath)
        .filter((rel) => rel.startsWith(prefix) && rel.endsWith('.ndjson'))
        .sort()
    },
  }
}

export function createPackageDataAccessFromWriter(params: {
  writer: PackageTextWriter
  packageRoot: string
}): PackageDataAccess {
  const { writer, packageRoot } = params

  return {
    readPackageFile: async (packageRelativePath) => {
      const rel = toPackageRelativePath({ packageRoot, filePath: packageRelativePath })
      return writer.readText(rel)
    },
    listClassificationFiles: async (classificationsDir) => {
      return writer.listClassificationNdjsonPaths(classificationsDir)
    },
  }
}

export function createPackageFileAccessFromIndexedFiles(params: {
  files: IndexedFile[]
  packageRoot: string
}): PackageFileAccess {
  const { files, packageRoot } = params
  const byPath = buildIndexedFileMap(files)
  const dataAccess = createPackageDataAccessFromIndexedFiles({ files, packageRoot })

  return {
    readText: (filePath) => dataAccess.readPackageFile(filePath),
    fileExists: async (filePath) => indexedEntryExists({ byPath, packageRoot, filePath }),
  }
}

async function indexedEntryExists(params: {
  byPath: Record<string, IndexedFile>
  packageRoot: string
  filePath: string
}) {
  const { byPath, packageRoot, filePath } = params
  const entry = resolveIndexedEntry({ byPath, packageRoot, filePath })
  if (entry) return indexedFileEntryReadable(entry)

  const directoryPrefix = directoryPrefixForExistsCheck({ packageRoot, filePath })
  if (!directoryPrefix) return false

  return Object.keys(byPath).some((indexedPath) => indexedPath.startsWith(directoryPrefix))
}

function directoryPrefixForExistsCheck(params: { packageRoot: string; filePath: string }) {
  const rel = toPackageRelativePath({ packageRoot: params.packageRoot, filePath: params.filePath })
  const normalized = normalizePackageRelativePath(rel)
  if (!normalized.endsWith('/')) return null
  return normalized
}

async function indexedFileEntryReadable(entry: IndexedFile) {
  if (entry.file) return true

  try {
    const handle = entry.handle as { getFile?: () => Promise<File> } | undefined
    const file = await handle?.getFile?.()
    return !!file
  } catch {
    return false
  }
}

export function resolveIndexedEntry(params: {
  byPath: Record<string, IndexedFile>
  packageRoot: string
  filePath: string
  archiveFallback?: boolean
}): IndexedFile | undefined {
  const { byPath, packageRoot, filePath, archiveFallback = false } = params
  const normalized = normalizePackageRelativePath(filePath)
  const rel = toPackageRelativePath({ packageRoot, filePath: normalized })
  const baseCandidates = uniqueStrings([
    normalized,
    rel,
    stripLeadingPackageRoot({ packageRoot, path: normalized }),
    stripLeadingPackageRoot({ packageRoot, path: rel }),
  ])

  const archiveCandidates = archiveFallback
    ? baseCandidates.flatMap((candidate) => packageArchivePathCandidates(candidate))
    : []

  for (const candidate of uniqueStrings([...baseCandidates, ...archiveCandidates])) {
    const hit = byPath[candidate]
    if (hit) return hit
  }

  return undefined
}

function stripLeadingPackageRoot(params: { packageRoot: string; path: string }) {
  const root = params.packageRoot.replace(/\/+$/, '')
  if (!root) return params.path
  const prefix = `${root}/`
  if (params.path.startsWith(prefix)) return params.path.slice(prefix.length)
  return params.path
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}

function toIndexedFileReadError(params: { path: string; err: unknown }) {
  const { path, err } = params
  if (isFilesystemNotFoundError(err)) {
    return new Error(
      `File not found on disk: ${path}. The dataset may be out of date — try Set up or Refresh datasets again.`,
    )
  }
  return new Error(`Cannot read ${path}: ${formatFilesystemError(err)}`)
}

export function buildAssetPathIndex(params: {
  patches: PatchRecord[]
  byRelativePath: Record<string, IndexedFile>
  packageRoot?: string
}): Record<string, IndexedFile> {
  const { patches, byRelativePath, packageRoot = '' } = params
  const indexedByAssetPath: Record<string, IndexedFile> = {}

  for (const patch of patches) {
    const hit = resolveIndexedEntry({
      byPath: byRelativePath,
      packageRoot,
      filePath: patch.asset_path,
    })
    if (hit) indexedByAssetPath[patch.asset_path] = hit

    // Also index the _nobg.png sibling produced by Mothbot Process pixel mass step
    const nobgAssetPath = patch.asset_path.replace(/\.jpg$/i, '_nobg.png')
    const nobgHit = resolveIndexedEntry({
      byPath: byRelativePath,
      packageRoot,
      filePath: nobgAssetPath,
    })
    if (nobgHit) indexedByAssetPath[nobgAssetPath] = nobgHit
  }

  return indexedByAssetPath
}

export function detectIngestMode(files: Array<{ path: string; name: string }>): 'mothbox-next' | 'legacy' {
  return isPackageIndexedFiles(files) ? 'mothbox-next' : 'legacy'
}

export function manifestRelativePath(packageRoot: string): string {
  return packageRoot ? joinRelativePaths(packageRoot, 'dataset.json') : 'dataset.json'
}
