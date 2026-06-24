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
  if (directoryPrefix) {
    return Object.keys(byPath).some((indexedPath) => indexedPath.startsWith(directoryPrefix))
  }

  // Image files may not appear in the index when their directory was skipped during scan
  // (Chrome pre-fetches entire directory entry lists and crashes on large flat dirs).
  // If any scanned entry has a rootDir handle, the user granted access to the root
  // directory and buildAssetPathIndex will create virtual navigation entries for all
  // patch images from the NDJSON. Trust the manifest rather than the incomplete scan.
  if (/\.(jpg|jpeg|png|gif|webp)$/i.test(filePath)) {
    if (Object.values(byPath).some((f) => (f as IndexedFile).rootDir)) return true

    // For datasets loaded via the legacy File object path (no handle), check siblings.
    const packageRel = toPackageRelativePath({
      packageRoot,
      filePath: normalizePackageRelativePath(filePath),
    })
    const segs = packageRel.replace(/\\/g, '/').split('/').filter(Boolean)
    if (segs.length >= 2) {
      const parentPrefix = segs.slice(0, -1).join('/') + '/'
      if (Object.keys(byPath).some((p) => p.startsWith(parentPrefix))) return true
    }
  }

  return false
}

function directoryPrefixForExistsCheck(params: { packageRoot: string; filePath: string }) {
  const rel = toPackageRelativePath({ packageRoot: params.packageRoot, filePath: params.filePath })
  const normalized = normalizePackageRelativePath(rel)
  if (!normalized.endsWith('/')) return null
  return normalized
}

async function indexedFileEntryReadable(entry: IndexedFile) {
  if (entry.file) return true

  const handle = entry.handle as { getFile?: () => Promise<File> } | undefined
  if (handle?.getFile) {
    try {
      const file = await handle.getFile()
      return !!file
    } catch {
      return false
    }
  }

  // Image files don't store a direct handle (to avoid Chrome's FS handle limit).
  // parentDir means the file was present during directory enumeration.
  // rootDir means we can navigate to it on demand — trust the manifest.
  if (entry.parentDir || entry.rootDir) return true

  return false
}

export function resolveIndexedEntry(params: {
  byPath: Record<string, IndexedFile>
  packageRoot: string
  filePath: string
  archiveFallback?: boolean
  rootDirs?: unknown[]
}): IndexedFile | undefined {
  const { byPath, packageRoot, filePath, archiveFallback = false, rootDirs } = params
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

  if (rootDirs && rootDirs.length > 0) {
    const fullPath = joinRelativePaths(packageRoot, normalized)
    const segments = fullPath.replace(/\\/g, '/').split('/').filter(Boolean)
    const name = segments[segments.length - 1] ?? ''
    const parentSegments = segments.slice(0, -1)
    // Try each rootDir in sequence — source photos may live in the package itself
    // (rootDir=packageHandle) or in a sibling source folder (rootDir=originalSourceHandle).
    const virtualParentDir = {
      getFileHandle: async (fileName: string) => {
        let lastErr: unknown
        for (const rootDir of rootDirs) {
          try {
            let current = rootDir as Record<string, (n: string) => Promise<unknown>>
            for (const seg of parentSegments) {
              current = (await current['getDirectoryHandle'](seg)) as typeof current
            }
            return await (current as unknown as { getFileHandle: (n: string) => Promise<{ getFile: () => Promise<File> }> }).getFileHandle(fileName)
          } catch (err) {
            lastErr = err
          }
        }
        throw lastErr
      },
    }
    return { file: undefined, handle: undefined, parentDir: virtualParentDir, rootDir: rootDirs[0], path: fullPath, name, size: 0 }
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

  // rootDir is stored on every scanned entry. Use the first one found as a fallback
  // navigator for images in directories that were skipped due to the depth limit.
  const rootDir = Object.values(byRelativePath).find((f) => f.rootDir)?.rootDir

  for (const patch of patches) {
    const hit = resolveIndexedEntry({
      byPath: byRelativePath,
      packageRoot,
      filePath: patch.asset_path,
    })
    if (hit) {
      indexedByAssetPath[patch.asset_path] = hit
    } else if (rootDir) {
      // Image was not collected (directory hit the image-scan limit). Create a virtual
      // entry with a synthetic parentDir that navigates from rootDir on demand.
      // joinRelativePaths prepends packageRoot so the path navigates correctly from rootDir
      // whether the user picked the package folder (packageRoot="") or a parent folder.
      const fullPath = joinRelativePaths(packageRoot, patch.asset_path)
      const segments = fullPath.replace(/\\/g, '/').split('/').filter(Boolean)
      const name = segments[segments.length - 1] ?? ''
      const parentSegments = segments.slice(0, -1)
      const rd = rootDir as { getDirectoryHandle: (n: string) => Promise<unknown> }
      // Virtual parentDir: navigates from rootDir to the parent directory each time
      const virtualParentDir = {
        getFileHandle: async (fileName: string) => {
          let current = rd as Record<string, (n: string) => Promise<unknown>>
          for (const seg of parentSegments) {
            current = (await current['getDirectoryHandle'](seg)) as typeof current
          }
          return (current as unknown as { getFileHandle: (n: string) => Promise<{ getFile: () => Promise<File> }> }).getFileHandle(fileName)
        },
      }
      indexedByAssetPath[patch.asset_path] = {
        file: undefined,
        handle: undefined,
        parentDir: virtualParentDir,
        rootDir,
        path: fullPath,
        name,
        size: 0,
      }
    }
  }

  return indexedByAssetPath
}

export function detectIngestMode(files: Array<{ path: string; name: string }>): 'mothbox-next' | 'legacy' {
  return isPackageIndexedFiles(files) ? 'mothbox-next' : 'legacy'
}

export function manifestRelativePath(packageRoot: string): string {
  return packageRoot ? joinRelativePaths(packageRoot, 'dataset.json') : 'dataset.json'
}
