import { directoryHasDatasetManifest } from './dataset-manifest'
import { findRelativeFilesUnderDirectory } from './fs-find-files'
import { normalizeIngestRelativePath, PACKAGE_ARCHIVE_DIR } from './reserved-paths'
import type { FileSystemDirectoryHandleLike } from '~/utils/fs-directory-handle'

export const RESERVED_DATASETS_CHILD_NAMES = new Set(['species'])

export type DatasetFolderKind = 'package' | 'legacy-root' | 'source-only' | 'patch-images-only' | 'skip'

export function isPatchImageFileName(fileName: string) {
  return /\.(jpg|jpeg|png)$/i.test(fileName ?? '')
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
  if (!botPaths.length) {
    const imagePaths = await findRelativeFilesUnderDirectory(directory, (name) => isPatchImageFileName(name))
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
