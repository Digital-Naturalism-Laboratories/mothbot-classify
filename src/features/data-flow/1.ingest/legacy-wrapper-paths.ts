import { findRelativeFilesUnderDirectory } from './fs-find-files'
import { isPatchImageFileName, isUnderPackageSource } from './classify-dataset-folder'
import type { FileSystemDirectoryHandleLike } from '~/utils/fs-directory-handle'

/** When all assets live under one top-level subfolder, treat that folder as the legacy source root. */
export function resolveLegacyWrapperDirNameFromRelativePaths(paths: string[]): string | null {
  const legacyPaths = paths.filter((path) => !isUnderPackageSource(path))
  if (!legacyPaths.length) return null
  if (legacyPaths.some((path) => !path.includes('/'))) return null

  const topLevelDirs = new Set(
    legacyPaths.map((path) => path.split('/')[0]).filter((segment): segment is string => !!segment),
  )
  if (topLevelDirs.size !== 1) return null

  return [...topLevelDirs][0] ?? null
}

export async function resolveLegacyContentRootHandleFromPaths(params: {
  packageHandle: FileSystemDirectoryHandleLike
  listRelativePaths: (root: FileSystemDirectoryHandleLike) => Promise<string[]>
}): Promise<FileSystemDirectoryHandleLike> {
  const { packageHandle, listRelativePaths } = params
  const paths = await listRelativePaths(packageHandle)
  const wrapperDirName = resolveLegacyWrapperDirNameFromRelativePaths(paths)
  if (!wrapperDirName) return packageHandle

  try {
    const nested = await packageHandle.getDirectoryHandle?.(wrapperDirName, { create: false })
    return nested ?? packageHandle
  } catch {
    return packageHandle
  }
}

export async function listImagePathsUnderDirectory(root: FileSystemDirectoryHandleLike) {
  return findRelativeFilesUnderDirectory(root, (name) => isPatchImageFileName(name))
}
