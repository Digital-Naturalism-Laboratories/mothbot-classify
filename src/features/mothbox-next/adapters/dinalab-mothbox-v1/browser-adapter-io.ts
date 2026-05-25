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
      findFiles: (predicate) => findRelativeFiles(sourceHandle, predicate),
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

async function findRelativeFiles(
  root: FileSystemDirectoryHandleLike,
  predicate: (fileName: string) => boolean,
): Promise<string[]> {
  const out: string[] = []

  async function walk(dir: FileSystemDirectoryHandleLike, prefix: string) {
    if (!dir.entries) return
    for await (const [name, handle] of dir.entries()) {
      const rel = prefix ? `${prefix}/${name}` : name
      if (handle?.kind === 'directory') {
        await walk(handle as FileSystemDirectoryHandleLike, rel)
        continue
      }
      if (handle?.kind === 'file' && predicate(name)) out.push(rel)
    }
  }

  await walk(root, '')
  return out
}
