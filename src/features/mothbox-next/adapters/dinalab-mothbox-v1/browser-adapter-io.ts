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
  rootMetadataHandle?: FileSystemDirectoryHandleLike | null
}): DinalabAdapterIO {
  const { sourceHandle, packageHandle, rootMetadataHandle } = params

  const makeSourceIO = (handle: FileSystemDirectoryHandleLike): DinalabAdapterIO['source'] => ({
    exists: (relativePath) => fileExistsAt(handle, relativePath),
    readText: (relativePath) => readTextFile(handle, relativePath),
    readBinary: async (relativePath) => (await readFileBlob(handle, relativePath)).arrayBuffer(),
    findFiles: (predicate) => findRelativeFilesUnderDirectory(handle, predicate, { skipLargeDirs: false }),
  })

  return {
    source: makeSourceIO(sourceHandle),
    rootMetadata: rootMetadataHandle ? makeSourceIO(rootMetadataHandle) : undefined,
    package: {
      readText: (relativePath) => readTextFile(packageHandle, relativePath),
      writeText: (relativePath, text) => writeTextFile(packageHandle, relativePath, text),
      copyFromSource: async ({ sourceRelativePath, packageRelativePath }) => {
        const file = await readFileBlob(sourceHandle, sourceRelativePath)
        await writeBlobFile(packageHandle, packageRelativePath, file)
      },
    },
  }
}
