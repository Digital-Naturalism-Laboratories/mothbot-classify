import { directoryHasDatasetManifest } from './dataset-manifest'
import { findRelativeFilesUnderDirectory } from './fs-find-files'
import { normalizeIngestRelativePath, PACKAGE_ARCHIVE_DIR } from './reserved-paths'
import type { FileSystemDirectoryHandleLike } from '~/utils/fs-directory-handle'

export const RESERVED_DATASETS_CHILD_NAMES = new Set(['species'])

export type DatasetFolderKind =
  | 'package'
  | 'legacy-root'
  | 'source-only'
  | 'mothbox-processed'
  | 'ami'
  | 'patch-images-only'
  | 'skip'

export function isPatchImageFileName(fileName: string) {
  return /\.(jpg|jpeg|png)$/i.test(fileName ?? '')
}

export function isParquetFileName(fileName: string) {
  return /\.parquet$/i.test(fileName ?? '')
}

export function isCsvFileName(fileName: string) {
  return /\.csv$/i.test(fileName ?? '')
}

export function isReservedDatasetsChildFolderName(folderName: string) {
  const trimmed = folderName.trim()
  if (!trimmed) return true
  return RESERVED_DATASETS_CHILD_NAMES.has(trimmed.toLowerCase())
}

export async function classifyDatasetFolder(params: {
  directory: FileSystemDirectoryHandleLike
  folderName: string
}): Promise<DatasetFolderKind> {
  const { directory, folderName } = params
  if (isReservedDatasetsChildFolderName(folderName)) return 'skip'

  if (await directoryHasDatasetManifest(directory)) return 'package'

  const botPaths = await findRelativeFilesUnderDirectory(directory, (name) => name.endsWith('_botdetection.json'))
  const processedBotPaths = botPaths.filter((path) => isUnderProcessedMirror(path))
  if (processedBotPaths.length > 0) return 'mothbox-processed'

  const imagePaths = await findRelativeFilesUnderDirectory(directory, (name) => isPatchImageFileName(name))
  const metadataPaths = await findRelativeFilesUnderDirectory(directory, (name) => isParquetFileName(name) || isCsvFileName(name))
  if (
    metadataPaths.length > 0 &&
    imagePaths.some((path) => isUnderProcessedMirror(path) && /_crop_[^/]+\.(jpg|jpeg|png)$/i.test(path))
  ) {
    return 'ami'
  }

  if (!botPaths.length) {
    if (imagePaths.length > 0) return 'patch-images-only'
    return 'skip'
  }

  const rootBotPaths = botPaths.filter((path) => !isUnderPackageSource(path))
  if (rootBotPaths.length > 0) return 'legacy-root'

  const sourceBotPaths = botPaths.filter((path) => isUnderPackageSource(path))
  if (sourceBotPaths.length > 0) return 'source-only'

  return 'skip'
}

export function isUnderPackageSource(relativePath: string) {
  const normalized = normalizeIngestRelativePath(relativePath).toLowerCase()
  return normalized === PACKAGE_ARCHIVE_DIR || normalized.startsWith(`${PACKAGE_ARCHIVE_DIR}/`)
}

export function isUnderProcessedMirror(relativePath: string) {
  const parts = normalizeIngestRelativePath(relativePath).toLowerCase().split('/').filter(Boolean)
  return parts.includes('_processed')
}
