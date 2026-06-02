import { findRelativeFilesUnderDirectory } from '~/features/data-flow/1.ingest/fs-find-files'
import type { DinalabAdapterIO } from './adapter-io'
import {
  fileExistsAt,
  readFileBlob,
  readTextFile,
  writeBlobFile,
  writeTextFile,
  type FileSystemDirectoryHandleLike,
} from '~/utils/fs-directory-handle'

export type { FileSystemDirectoryHandleLike } from '~/utils/fs-directory-handle'

export function createBrowserDinalabAdapterIO(params: {
  sourceHandle: FileSystemDirectoryHandleLike
  packageHandle: FileSystemDirectoryHandleLike
}): DinalabAdapterIO {
  const { sourceHandle, packageHandle } = params

  return {
    source: {
      exists: (relativePath) => fileExistsAt(sourceHandle, relativePath),
      readText: (relativePath) => readTextFile(sourceHandle, relativePath),
      readBinary: async (relativePath) => (await readFileBlob(sourceHandle, relativePath)).arrayBuffer(),
      findFiles: (predicate) => findRelativeFilesUnderDirectory(sourceHandle, predicate),
    },
    package: {
      writeText: (relativePath, text) => writeTextFile(packageHandle, relativePath, text),
      copyFromSource: async ({ sourceRelativePath, packageRelativePath }) => {
        const file = await readFileBlob(sourceHandle, sourceRelativePath)
        await writeBlobFile(packageHandle, packageRelativePath, file)
      },
    },
  }
}
