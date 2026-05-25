import type { FileSystemDirectoryHandleLike } from '~/utils/fs-directory-handle'

type DirectoryWithEntries = FileSystemDirectoryHandleLike & {
  entries?: () => AsyncIterable<[string, FileSystemDirectoryHandleLike]>
}

export async function findRelativeFilesUnderDirectory(
  root: FileSystemDirectoryHandleLike,
  predicate: (fileName: string) => boolean,
): Promise<string[]> {
  const directory = root as DirectoryWithEntries
  const out: string[] = []

  async function walk(dir: FileSystemDirectoryHandleLike, prefix: string) {
    const current = dir as DirectoryWithEntries
    if (!current.entries) return

    for await (const [name, handle] of current.entries()) {
      const rel = prefix ? `${prefix}/${name}` : name
      if (handle?.kind === 'directory') {
        await walk(handle, rel)
        continue
      }
      if (handle?.kind === 'file' && predicate(name)) out.push(rel)
    }
  }

  await walk(directory, '')
  return out
}
