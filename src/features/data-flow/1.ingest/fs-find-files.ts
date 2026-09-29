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

// Never entered by the legacy probe: patch-crop folders (no detection JSON) and
// Mothbot Process output mirrors (classified by the regular scan instead).
const LEGACY_PROBE_SKIP_DIR_NAMES = new Set(['patches', '01_patches', '_processed'])
// Stop reading a folder after this many images without a single JSON file:
// it's a raw photo dump, not a night folder with detections next to its photos.
const MAX_IMAGES_WITHOUT_JSON = 500
const IMAGE_FILE_RE = /\.(jpg|jpeg|png)$/i

/**
 * Finds the first file matching `predicate`, descending into date-named folders
 * that {@link findRelativeFilesUnderDirectory} skips by default.
 *
 * Legacy Mothbot projects keep their `*_botdetection.json` files in exactly those
 * folders (`Deployment_2025-01-26/2025-01-26/`), so the default scan never sees
 * them. This stays safe on huge folders: it never enters `patches/` or `_processed/`, gives up on
 * folders full of images with no JSON beside them, and returns on the first hit.
 */
export async function findFirstRelativeFileIncludingDateDirs(
  root: FileSystemDirectoryHandleLike,
  predicate: (fileName: string) => boolean,
  options?: { maxDepth?: number },
): Promise<string | null> {
  const maxDepth = options?.maxDepth ?? 5

  async function walk(dir: FileSystemDirectoryHandleLike, prefix: string, depth: number): Promise<string | null> {
    const current = dir as DirectoryWithEntries
    if (!current.entries) return null

    const subdirectories: Array<[string, FileSystemDirectoryHandleLike]> = []
    let imageCount = 0
    let sawJson = false

    for await (const [name, handle] of current.entries()) {
      if (handle?.kind === 'directory') {
        if (!LEGACY_PROBE_SKIP_DIR_NAMES.has(name.toLowerCase())) subdirectories.push([name, handle])
        continue
      }
      if (handle?.kind !== 'file') continue
      if (predicate(name)) return prefix ? `${prefix}/${name}` : name
      if (name.toLowerCase().endsWith('.json')) sawJson = true
      else if (IMAGE_FILE_RE.test(name) && ++imageCount >= MAX_IMAGES_WITHOUT_JSON && !sawJson) break
    }

    if (depth >= maxDepth) return null
    for (const [name, handle] of subdirectories) {
      const found = await walk(handle, prefix ? `${prefix}/${name}` : name, depth + 1)
      if (found) return found
    }
    return null
  }

  return walk(root, '', 0)
}
