import { ensureReadWritePermission } from '~/features/data-flow/3.persist/files.persistence'
import { isPackageIndexedFiles } from '~/features/mothbox-next/load-package-data'
import { isPackageArchiveRelativePath } from './reserved-paths'
import { normalizeIndexedPathsToPackageRoot } from '~/features/mothbox-next/package-indexed-access'
import { isLikelyNightFolderName, parsePathParts } from './ingest-paths'
import { formatFilesystemError } from '~/utils/fs-error'
import type {
  FileSystemDirectoryHandleLike,
  FileSystemFileHandleLike,
} from '~/utils/fs-directory-handle'

export type IndexedPickedFile = {
  file?: File
  handle?: unknown
  /** The directory handle containing this file — used for lazy sibling resolution (e.g. _nobg.png). */
  parentDir?: unknown
  /** The top-level picked directory handle — fallback for images not enumerated due to depth limit. */
  rootDir?: unknown
  path: string
  name: string
  size: number
}

type NormalizePathsResult = { ok: true; files: IndexedPickedFile[] } | { ok: false; levelsUp: number; message?: string }

export type PickDirectoryFilesResult = {
  indexed: IndexedPickedFile[]
  directoryHandle: FileSystemDirectoryHandleLike | null
}

function isFileHandle(entry: unknown): entry is FileSystemFileHandleLike {
  return typeof (entry as FileSystemFileHandleLike | undefined)?.getFile === 'function'
}

async function* iterateDirectoryEntries(
  directoryHandle: FileSystemDirectoryHandleLike,
): AsyncGenerator<FileSystemDirectoryHandleLike | FileSystemFileHandleLike> {
  if (directoryHandle.values) {
    yield* directoryHandle.values()
    return
  }

  if (directoryHandle.entries) {
    for await (const [, entry] of directoryHandle.entries()) yield entry
  }
}

// Image directories are never iterated — Chrome pre-fetches entire directory contents as
// FileSystemFileHandle objects and crashes when a flat directory holds thousands of images,
// even before JS code can read or discard them. Images are resolved on demand via rootDir.
//
// Three heuristics (any one triggers a skip):
//  1. Pure date name (YYYY-MM-DD): always an image folder in the mothbox-next layout.
//  2. Name ends with a date *and* is inside _processed/ or 00_source/: captures
//     deployment-date folders like "utterCoyote_2026-06-02" that hold flat patch images.
//  3. Named "01_patches": always a flat patch image folder in the mothbox-next package
//     layout. Patches are listed in patches.ndjson and resolved via rootDir on demand.
const DATE_DIR_RE = /^\d{4}-\d{2}-\d{2}$/
const ENDS_WITH_DATE_RE = /\d{4}-\d{2}-\d{2}$/
const FLAT_IMAGE_DIR_NAMES = new Set(['01_patches'])

export async function collectFilesWithPathsRecursively(params: {
  directoryHandle: FileSystemDirectoryHandleLike
  pathToDirectory: string[]
  items: IndexedPickedFile[]
  rootDir?: FileSystemDirectoryHandleLike
  /**
   * When true, a folder that can't be read is logged and skipped instead of
   * aborting the whole walk. Used by the species-list scan, where one
   * unreadable folder shouldn't wipe out every CSV found elsewhere.
   */
  skipUnreadableDirectories?: boolean
}) {
  const { directoryHandle, pathToDirectory, items, skipUnreadableDirectories } = params
  const rootDir = params.rootDir ?? directoryHandle

  try {
    await collectDirectoryEntries({ directoryHandle, pathToDirectory, items, rootDir, skipUnreadableDirectories })
  } catch (err) {
    const folderLabel = [...pathToDirectory, (directoryHandle as { name?: string }).name]
      .filter(Boolean)
      .join('/') || 'dataset root'
    if (skipUnreadableDirectories) {
      console.warn(`🌀 skipping unreadable folder “${folderLabel}”: ${formatFilesystemError(err)}`)
      return
    }
    throw new Error(`Could not read folder “${folderLabel}”: ${formatFilesystemError(err)}`)
  }
}

async function collectDirectoryEntries(params: {
  directoryHandle: FileSystemDirectoryHandleLike
  pathToDirectory: string[]
  items: IndexedPickedFile[]
  rootDir: FileSystemDirectoryHandleLike
  skipUnreadableDirectories?: boolean
}) {
  const { directoryHandle, pathToDirectory, items, rootDir, skipUnreadableDirectories } = params

  for await (const entry of iterateDirectoryEntries(directoryHandle)) {
    const entryName = (entry as unknown as { name?: string })?.name ?? ''

    if (!isFileHandle(entry)) {
      // Never iterate image directories — Chrome pre-fetches all entries as
      // FileSystemFileHandle objects and crashes before JS can act on them.
      //
      // Skip if:
      //  (a) pure YYYY-MM-DD name — always an image date folder, never a package
      //  (b) name ends with a date AND it is NOT a direct child of _processed/
      //      (direct children of _processed/ are package folders, not image dirs)
      const isPureDate = DATE_DIR_RE.test(entryName)
      const endsWithDate = ENDS_WITH_DATE_RE.test(entryName)
      const isDirectChildOfProcessed =
        pathToDirectory.length > 0 && pathToDirectory[pathToDirectory.length - 1] === '_processed'
      const isFlatImageDir = FLAT_IMAGE_DIR_NAMES.has(entryName)
      if (isPureDate || (endsWithDate && !isDirectChildOfProcessed) || isFlatImageDir) continue

      const subdir = entry as FileSystemDirectoryHandleLike
      if (typeof subdir?.values === 'function') {
        await collectFilesWithPathsRecursively({
          directoryHandle: subdir,
          pathToDirectory: [...pathToDirectory, entryName],
          items,
          rootDir,
          skipUnreadableDirectories,
        })
      }
      continue
    }

    // _nobg.png: loaded lazily in the patch detail dialog — skip entirely.
    if (entryName.endsWith('_nobg.png')) continue

    const isImageFile = /\.(jpg|jpeg|png|gif|webp)$/i.test(entryName)
    const relFromRoot = [...pathToDirectory, entryName].filter(Boolean).join('/')
    // Don't store the image FileSystemFileHandle — use parentDir for lazy resolution.
    items.push({
      file: undefined,
      handle: isImageFile ? undefined : (entry as unknown),
      parentDir: directoryHandle,
      rootDir,
      path: relFromRoot,
      name: entryName,
      size: 0,
    })
  }
}

export async function collectIndexedFromDirectoryHandle(
  handle: FileSystemDirectoryHandleLike,
  options?: { hydrateFiles?: boolean },
): Promise<IndexedPickedFile[]> {
  const items: IndexedPickedFile[] = []
  await collectFilesWithPathsRecursively({ directoryHandle: handle, pathToDirectory: [], items })
  if (options?.hydrateFiles === false) return items
  return hydrateIndexedHandleFiles(items)
}

export async function pickDirectoryFilesWithPaths(): Promise<PickDirectoryFilesResult> {
  const canUsePicker = typeof (window as unknown as { showDirectoryPicker?: unknown })?.showDirectoryPicker === 'function'
  if (!canUsePicker) {
    const files = await fallbackPickDirectoryFiles()
    const indexed = indexFilesWithPath({ files })
    return { indexed, directoryHandle: null }
  }
  // @ts-expect-error: showDirectoryPicker is not in all TS lib versions
  const dirHandle: FileSystemDirectoryHandleLike | null = await window.showDirectoryPicker?.().catch(() => null)
  if (!dirHandle) return { indexed: [], directoryHandle: null }

  // Try to proactively request RW so we can save later without prompting again
  void ensureReadWritePermission(dirHandle)

  const items: IndexedPickedFile[] = []
  await collectFilesWithPathsRecursively({ directoryHandle: dirHandle, pathToDirectory: [], items })
  return { indexed: await hydrateIndexedHandleFiles(items), directoryHandle: dirHandle }
}

export async function hydrateIndexedHandleFiles(items: IndexedPickedFile[]): Promise<IndexedPickedFile[]> {
  const hydrated: IndexedPickedFile[] = []

  for (const entry of items) {
    if (entry.file) {
      hydrated.push(entry)
      continue
    }

    const fileHandle = entry.handle as { getFile?: () => Promise<File> } | undefined
    if (!fileHandle?.getFile) {
      hydrated.push(entry)
      continue
    }

    // Skip eager file-open for images — useObjectUrl and readIndexedEntryText both resolve
    // lazily from the stored handle. Opening all image handles up-front on a large dataset
    // can exceed Chrome's File System Access API file-handle limit and crash the browser.
    if (/\.(jpg|jpeg|png|gif|webp)$/i.test(entry.name)) {
      hydrated.push(entry)
      continue
    }

    try {
      const file = await fileHandle.getFile()
      hydrated.push({ ...entry, file, size: file.size ?? entry.size })
    } catch (err) {
      const name = (err as { name?: string })?.name
      console.warn('🚨 hydrateIndexedHandleFiles: unreadable file, keeping handle only', {
        path: entry.path,
        name,
      })
      hydrated.push(entry)
    }
  }

  return hydrated
}

export async function fallbackPickDirectoryFiles(): Promise<File[]> {
  const input = document.createElement('input')
  input.type = 'file'
  input.setAttribute('webkitdirectory', '')
  input.style.position = 'fixed'
  input.style.left = '-9999px'

  const files = await new Promise<File[]>((resolve) => {
    input.onchange = () => {
      const list = Array.from(input.files ?? [])
      resolve(list)
      input.remove()
    }
    document.body.appendChild(input)
    input.click()
  })

  return files
}

export function indexFilesWithPath(params: { files: File[] }) {
  const { files } = params
  const indexed = files.map((file) => {
    const path = getFileWebkitRelativePath(file) || file?.name || ''
    const entry = { file, handle: undefined as unknown, path, name: file?.name ?? '', size: file?.size ?? 0 }
    return entry
  })
  return indexed
}

export function getFileWebkitRelativePath(file: File) {
  const anyFile = file as File & { webkitRelativePath?: string }
  const rel = anyFile?.webkitRelativePath ?? ''
  return rel
}

/**
 * Normalizes indexed picker paths for ingest.
 * Legacy trees use project/deployment/night discovery; mothbox-next packages use dataset.json + package-relative paths.
 */
export function normalizeIndexedFilesForIngest(params: { files: IndexedPickedFile[] }): NormalizePathsResult {
  const { files } = params
  if (!Array.isArray(files) || files.length === 0) return { ok: true, files: [] }

  if (isPackageIndexedFiles(files)) {
    return { ok: true, files: normalizeIndexedPathsToPackageRoot(files) as IndexedPickedFile[] }
  }

  return normalizePathsToRoot({ files })
}

export function normalizePathsToRoot(params: { files: IndexedPickedFile[] }): NormalizePathsResult {
  const { files } = params
  if (!Array.isArray(files) || files.length === 0) return { ok: true, files: [] }

  const samplePaths = collectPatchesSamplePaths({ files, limit: 200 })
  if (samplePaths.length === 0) return { ok: true, files }

  const candidateStripCounts = Array.from(
    new Set(
      samplePaths
        .map((path) => {
          const segments = path.split('/').filter(Boolean)
          const patchesIndex = segments.findIndex((segment) => segment.toLowerCase() === 'patches')
          if (patchesIndex < 0) return -1
          return patchesIndex - 3
        })
        .filter((n) => Number.isInteger(n)),
    ),
  )

  const validCandidates = candidateStripCounts.filter((stripCount) => stripCount >= 0)
  if (validCandidates.length === 0) {
    const levelsNeeded = candidateStripCounts.filter((n) => n < 0).map((n) => Math.abs(n))
    const levelsUp = Math.max(1, ...levelsNeeded)
    return { ok: false, levelsUp }
  }

  const stripCount = selectBestStripCount({ candidateStripCounts: validCandidates, samplePaths })
  if (stripCount === null) return { ok: false, levelsUp: 1 }

  const evaluation = evaluateStripCount({ stripCount, samplePaths })
  if (evaluation.validRatio < 0.8) {
    return {
      ok: false,
      levelsUp: 1,
      message: `Could not confidently detect dataset root. Parsed ${(evaluation.validRatio * 100).toFixed(
        0,
      )}% of sample patch paths; expected at least 80%. Sample failed paths: ${evaluation.invalidSamples.join(' | ')}`,
    }
  }

  const nightHeuristicMismatches = collectNightHeuristicMismatches({ files, stripCount, limit: 5 })
  if (nightHeuristicMismatches.count > 0) {
    console.warn('🚨 normalizePathsToRoot: potential unsupported night naming', {
      count: nightHeuristicMismatches.count,
      samplePaths: nightHeuristicMismatches.samples,
    })
  }

  if (stripCount === 0) return { ok: true, files }

  const adjustedFiles = files.map((entry) => {
    const trimmedPath = trimPath({ path: entry.path, stripCount })
    return { ...entry, path: trimmedPath }
  })
  return { ok: true, files: adjustedFiles }
}

function collectPatchesSamplePaths(params: { files: IndexedPickedFile[]; limit: number }) {
  const { files, limit } = params
  const packagePatchPaths: string[] = []
  const legacyPatchPaths: string[] = []

  for (const entry of files) {
    const normalizedPath = (entry.path ?? '').replaceAll('\\', '/').replace(/^\/+/, '')
    if (isPackageArchiveRelativePath(normalizedPath)) continue

    const segments = normalizedPath.split('/').filter(Boolean)
    const patchesIndex = segments.findIndex((segment) => segment.toLowerCase() === 'patches')
    if (patchesIndex < 0) continue
    const next = segments[patchesIndex + 1] ?? ''
    if (!next.toLowerCase().endsWith('.jpg')) continue

    const isCanonicalPackagePatch =
      segments[patchesIndex - 1]?.toLowerCase() === '01_patches' ||
      segments.slice(0, patchesIndex).some((segment) => segment.toLowerCase() === '01_patches')

    if (isCanonicalPackagePatch) {
      packagePatchPaths.push(normalizedPath)
      continue
    }

    legacyPatchPaths.push(normalizedPath)
  }

  const samplePaths = packagePatchPaths.length > 0 ? packagePatchPaths : legacyPatchPaths
  return samplePaths.slice(0, limit)
}

function selectBestStripCount(params: { candidateStripCounts: number[]; samplePaths: string[] }) {
  const { candidateStripCounts, samplePaths } = params
  let bestStripCount: number | null = null
  let bestRatio = -1

  for (const candidate of candidateStripCounts) {
    const evaluation = evaluateStripCount({ stripCount: candidate, samplePaths })
    if (evaluation.validRatio > bestRatio) {
      bestRatio = evaluation.validRatio
      bestStripCount = candidate
      continue
    }
    if (evaluation.validRatio === bestRatio && bestStripCount !== null && candidate > bestStripCount) {
      bestStripCount = candidate
    }
  }

  return bestStripCount
}

function evaluateStripCount(params: { stripCount: number; samplePaths: string[] }) {
  const { stripCount, samplePaths } = params
  if (!samplePaths.length) return { validRatio: 0, invalidSamples: [] as string[] }

  let validCount = 0
  const invalidSamples: string[] = []
  for (const samplePath of samplePaths) {
    const trimmed = trimPath({ path: samplePath, stripCount })
    const parsed = parsePathParts({ path: trimmed })
    if (parsed?.isPatch) {
      validCount++
      continue
    }
    if (invalidSamples.length < 5) invalidSamples.push(trimmed)
  }

  return { validRatio: validCount / samplePaths.length, invalidSamples }
}

function collectNightHeuristicMismatches(params: { files: IndexedPickedFile[]; stripCount: number; limit: number }) {
  const { files, stripCount, limit } = params
  const samples: string[] = []
  let count = 0

  for (const entry of files) {
    const trimmedPath = trimPath({ path: entry.path, stripCount })
    const segments = trimmedPath.split('/').filter(Boolean)
    const patchesIndex = segments.findIndex((segment) => segment.toLowerCase() === 'patches')
    if (patchesIndex < 0) continue

    const patchFile = segments[patchesIndex + 1] ?? ''
    if (!patchFile.toLowerCase().endsWith('.jpg')) continue

    const nightCandidate = segments[patchesIndex - 1] ?? ''
    if (isLikelyNightFolderName(nightCandidate)) continue

    count++
    if (samples.length < limit) samples.push(trimmedPath)
  }

  return { count, samples }
}

function trimPath(params: { path: string; stripCount: number }) {
  const { path, stripCount } = params
  const normalizedPath = (path ?? '').replaceAll('\\', '/').replace(/^\/+/, '')
  const segments = normalizedPath.split('/').filter(Boolean)
  return segments.slice(stripCount).join('/')
}
