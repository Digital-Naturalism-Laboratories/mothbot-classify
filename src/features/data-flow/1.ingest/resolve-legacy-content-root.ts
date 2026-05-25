import { findRelativeFilesUnderDirectory } from './fs-find-files'
import {
  resolveLegacyContentRootHandleFromPaths,
  resolveLegacyWrapperDirNameFromRelativePaths,
} from './legacy-wrapper-paths'
import type { FileSystemDirectoryHandleLike } from '~/utils/fs-directory-handle'

/** When all bot JSON lives under one top-level subfolder, relocate that folder's contents into 00_source/. */
export function resolveLegacyWrapperDirName(botPaths: string[]): string | null {
  return resolveLegacyWrapperDirNameFromRelativePaths(botPaths)
}

export async function resolveLegacyContentRootHandle(
  packageHandle: FileSystemDirectoryHandleLike,
): Promise<FileSystemDirectoryHandleLike> {
  return resolveLegacyContentRootHandleFromPaths({
    packageHandle,
    listRelativePaths: (root) =>
      findRelativeFilesUnderDirectory(root, (name) => name.endsWith('_botdetection.json')),
  })
}
