import type { FileSystemDirectoryHandleLike } from '~/utils/fs-directory-handle'

type DirectoryWithEntries = FileSystemDirectoryHandleLike & {
  entries?: () => AsyncIterable<[string, FileSystemDirectoryHandleLike]>
}

// Image directories must never be iterated — Chrome pre-fetches all entries as
// FileSystemFileHandle objects and crashes when a directory holds thousands of images.
const ENDS_WITH_DATE_RE = /\d{4}-\d{2}-\d{2}$/
const FLAT_IMAGE_DIR_NAMES = new Set(['01_patches'])

export async function findRelativeFilesUnderDirectory(
  root: FileSystemDirectoryHandleLike,
  predicate: (fileName: string) => boolean,
  options?: {
    /**
     * When true (default), skip directories whose names end with a date
     * (e.g. `bowedBarbo_2026-06-04`) and known flat-image dirs (e.g.
     * `01_patches`). This prevents Chrome from crashing when entries() is
     * called on a directory holding thousands of image file handles.
     * Pass false only when the predicate is known to match small files
     * (e.g. `*_botdetection.json`) so the flat dirs are safe to enter.
     */
    skipLargeDirs?: boolean
  },
): Promise<string[]> {
  const skipLargeDirs = options?.skipLargeDirs ?? true
  const directory = root as DirectoryWithEntries
  const out: string[] = []

  async function walk(dir: FileSystemDirectoryHandleLike, prefix: string) {
    const current = dir as DirectoryWithEntries
    if (!current.entries) return

    for await (const [name, handle] of current.entries()) {
      const rel = prefix ? `${prefix}/${name}` : name
      if (handle?.kind === 'directory') {
        if (skipLargeDirs && (ENDS_WITH_DATE_RE.test(name) || FLAT_IMAGE_DIR_NAMES.has(name))) continue
        await walk(handle, rel)
        continue
      }
      if (handle?.kind === 'file' && predicate(name)) out.push(rel)
    }
  }

  await walk(directory, '')
  return out
}
