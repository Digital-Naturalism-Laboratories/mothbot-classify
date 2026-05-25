import type { IndexedFile } from '~/stores/entities/photos'
import type { PackageDataAccess } from './load-package-data'
import type { PackageFileAccess } from './validate-dataset-package'
import { findPackageManifestInIndexedFiles, isPackageIndexedFiles } from './load-package-data'
import { normalizePackageRelativePath, toPackageRelativePath } from './package-paths'
import type { PatchRecord } from './records'
import type { PackageTextWriter } from './persist/persist-human-classifications'
import { joinRelativePaths } from './package-paths'

export { isPackageIndexedFiles }

/**
 * When a package folder is indexed via the File System Access API, paths are often
 * prefixed with the picked directory name (e.g. my-dataset/dataset.json). Package
 * loaders expect paths relative to the package root (dataset.json at the top).
 */
function basenameFromPath(path: string) {
  const normalized = path.replaceAll('\\', '/').replace(/\/+$/, '')
  const segments = normalized.split('/').filter(Boolean)
  return segments[segments.length - 1] ?? ''
}

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
  const file = await handle?.getFile?.()
  if (!file) throw new Error(`Cannot read ${entry.path}`)
  return readBlobText(file)
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
  const normalized = normalizePackageRelativePath(filePath)
  const rel = toPackageRelativePath({ packageRoot, filePath: normalized })
  const entry = byPath[normalized] ?? byPath[rel]
  if (entry) {
    if (entry.file) return true
    const handle = entry.handle as { getFile?: () => Promise<File> } | undefined
    return !!(await handle?.getFile?.())
  }

  const dirPrefix = (rel || normalized).replace(/\/+$/, '')
  if (!dirPrefix) return false

  return Object.keys(byPath).some((candidate) => candidate.startsWith(`${dirPrefix}/`))
}

export function buildAssetPathIndex(params: {
  patches: PatchRecord[]
  byRelativePath: Record<string, IndexedFile>
}): Record<string, IndexedFile> {
  const { patches, byRelativePath } = params
  const indexedByAssetPath: Record<string, IndexedFile> = {}

  for (const patch of patches) {
    const rel = normalizePackageRelativePath(patch.asset_path)
    const hit = byRelativePath[rel]
    if (hit) indexedByAssetPath[patch.asset_path] = hit
  }

  return indexedByAssetPath
}

export function detectIngestMode(files: Array<{ path: string; name: string }>): 'mothbox-next' | 'legacy' {
  return isPackageIndexedFiles(files) ? 'mothbox-next' : 'legacy'
}

export function manifestRelativePath(packageRoot: string): string {
  return packageRoot ? joinRelativePaths(packageRoot, 'dataset.json') : 'dataset.json'
}
