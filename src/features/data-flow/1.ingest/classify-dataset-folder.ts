import { directoryHasDatasetManifest } from './dataset-manifest'
import { findRelativeFilesUnderDirectory } from './fs-find-files'
import { normalizeIngestRelativePath, PACKAGE_ARCHIVE_DIR } from './reserved-paths'
import type { FileSystemDirectoryHandleLike } from '~/utils/fs-directory-handle'

const DATE_SUFFIX_RE = /\d{4}-\d{2}-\d{2}$/

export const RESERVED_DATASETS_CHILD_NAMES = new Set(['species', '_processed'])

export type DatasetFolderKind =
  | 'package'
  | 'legacy-root'
  | 'source-only'
  | 'mothbox-processed'
  | 'mothbox-processed-sibling'
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
  /**
   * Sibling `_processed/<folderName>` directory, when one exists at the
   * datasets root next to `directory`. Used to detect the case where JSON
   * outputs were moved out of the dataset folder entirely into a mirrored
   * tree, rather than nested in a `_processed` subfolder inside it.
   */
  processedMirrorHandle?: FileSystemDirectoryHandleLike | null
}): Promise<DatasetFolderKind> {
  const { directory, folderName, processedMirrorHandle } = params
  if (isReservedDatasetsChildFolderName(folderName)) return 'skip'

  if (await directoryHasDatasetManifest(directory)) return 'package'

  const botPaths = await findRelativeFilesUnderDirectory(directory, (name) => name.endsWith('_botdetection.json'))
  const processedBotPaths = botPaths.filter((path) => isUnderProcessedMirror(path))
  if (processedBotPaths.length > 0) return 'mothbox-processed'

  if (!botPaths.length && processedMirrorHandle) {
    // Can't scan inside date-named subdirectories: Chrome pre-fetches all
    // FileSystemFileHandle objects for entries() and crashes on large flat dirs.
    // Presence of any date-named subdir in the mirror is a reliable signal that
    // the Legacy Converter moved patches/JSONs there — classify as sibling.
    if (await directoryHasDateSubdirectory(processedMirrorHandle)) return 'mothbox-processed-sibling'
  }

  const imagePaths = await findRelativeFilesUnderDirectory(directory, (name) => isPatchImageFileName(name))
  const metadataPaths = await findRelativeFilesUnderDirectory(directory, (name) => isParquetFileName(name) || isCsvFileName(name))
  if (metadataPaths.length > 0 && imagePaths.some(isAmiCropImagePath)) {
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

export function isAmiCropImagePath(relativePath: string) {
  if (!/_crop_[^/]+\.(jpg|jpeg|png)$/i.test(relativePath)) return false
  const parts = normalizeIngestRelativePath(relativePath).toLowerCase().split('/').filter(Boolean)
  return parts.includes('_processed') || parts.includes('_crops_')
}

async function directoryHasDateSubdirectory(
  dir: FileSystemDirectoryHandleLike,
  remainingDepth = 3,
): Promise<boolean> {
  if (remainingDepth <= 0) return false
  const d = dir as { entries?: () => AsyncIterable<[string, { kind?: string }]> }
  if (!d.entries) return false
  for await (const [name, handle] of d.entries()) {
    if ((handle as { kind?: string })?.kind !== 'directory') continue
    if (DATE_SUFFIX_RE.test(name)) return true
    // Safe to recurse into non-date-named dirs (few entries, no large image dirs)
    if (await directoryHasDateSubdirectory(handle as FileSystemDirectoryHandleLike, remainingDepth - 1)) return true
  }
  return false
}
