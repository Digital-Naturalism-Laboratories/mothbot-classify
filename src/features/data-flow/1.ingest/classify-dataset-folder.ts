import { directoryHasDatasetManifest } from './dataset-manifest'
import { findRelativeFilesUnderDirectory } from './fs-find-files'
import { normalizeIngestRelativePath, PACKAGE_ARCHIVE_DIR } from './reserved-paths'
import type { FileSystemDirectoryHandleLike } from '~/utils/fs-directory-handle'


export const RESERVED_DATASETS_CHILD_NAMES = new Set(['species', '_processed'])

export type DatasetFolderKind =
  | 'package'
  | 'legacy-root'
  | 'source-only'
  | 'mothbox-processed'
  | 'mothbox-processed-sibling'
  | 'ami'
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
  /**
   * True when the datasets root itself contains parquet/CSV metadata files
   * at the top level (sibling to `directory`). AMI datasets sometimes store
   * their metadata snapshot at the root rather than inside the project folder.
   */
  rootHasMetadataFiles?: boolean
}): Promise<DatasetFolderKind> {
  const { directory, folderName, processedMirrorHandle, rootHasMetadataFiles } = params
  if (isReservedDatasetsChildFolderName(folderName)) return 'skip'

  if (await directoryHasDatasetManifest(directory)) return 'package'

  const botPaths = await findRelativeFilesUnderDirectory(directory, (name) => name.endsWith('_botdetection.json'))
  const processedBotPaths = botPaths.filter((path) => isUnderProcessedMirror(path))
  if (processedBotPaths.length > 0) return 'mothbox-processed'

  if (!botPaths.length && processedMirrorHandle) {
    if (await directoryHasSubdirectory(processedMirrorHandle)) return 'mothbox-processed-sibling'
  }

  const imagePaths = await findRelativeFilesUnderDirectory(directory, (name) => isPatchImageFileName(name))
  const metadataPaths = await findRelativeFilesUnderDirectory(directory, (name) => isParquetFileName(name) || isCsvFileName(name))
  if ((metadataPaths.length > 0 || rootHasMetadataFiles) && imagePaths.some(isAmiCropImagePath)) {
    return 'ami'
  }

  if (!botPaths.length) {
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

// Returns true if `dir` contains any subdirectory — used to confirm that a
// sibling `_processed/{name}` folder is a real processed mirror. Any subdir
// signals structured Mothbot output. We avoid recursing to prevent Chrome
// crashes on large flat directories that contain many patch image files.
async function directoryHasSubdirectory(dir: FileSystemDirectoryHandleLike): Promise<boolean> {
  const d = dir as { entries?: () => AsyncIterable<[string, { kind?: string }]> }
  if (!d.entries) return false
  for await (const [, handle] of d.entries()) {
    if ((handle as { kind?: string })?.kind === 'directory') return true
  }
  return false
}
