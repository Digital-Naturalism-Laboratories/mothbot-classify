import { ensureReadWritePermission } from '~/features/data-flow/3.persist/files.persistence'
import { isLikelyNightFolderName, parsePathParts } from './ingest-paths'

type FileSystemFileHandleLike = {
  getFile: () => Promise<File>
  name?: string
}

type FileSystemDirectoryHandleLike = {
  values: () => AsyncIterable<FileSystemFileHandleLike | FileSystemDirectoryHandleLike>
  queryPermission?: (options: { mode: 'read' | 'readwrite' }) => Promise<'granted' | 'denied' | 'prompt'> | 'granted' | 'denied' | 'prompt'
  requestPermission?: (options: { mode: 'read' | 'readwrite' }) => Promise<'granted' | 'denied' | 'prompt'> | 'granted' | 'denied' | 'prompt'
  name?: string
}

export type IndexedPickedFile = {
  file?: File
  handle?: unknown
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
  const handle = entry as FileSystemFileHandleLike | undefined
  const hasGetFile = typeof handle?.getFile === 'function'
  return hasGetFile
}

export async function collectFilesWithPathsRecursively(params: {
  directoryHandle: FileSystemDirectoryHandleLike
  pathParts: string[]
  items: IndexedPickedFile[]
}) {
  const { directoryHandle, pathParts, items } = params
  const dirName = (directoryHandle as unknown as { name?: string })?.name ?? ''
  const baseParts = pathParts.length === 0 ? [] : pathParts
  const currentParts = [...baseParts, dirName].filter(Boolean)

  for await (const entry of directoryHandle.values()) {
    const entryName = (entry as unknown as { name?: string })?.name ?? ''
    if (isFileHandle(entry)) {
      const relFromRoot = [...currentParts, entryName].filter(Boolean).join('/')
      items.push({ file: undefined, handle: entry as unknown, path: relFromRoot, name: entryName, size: 0 })
      continue
    }
    const subdir = entry as FileSystemDirectoryHandleLike
    const hasValues = typeof subdir?.values === 'function'
    if (hasValues) {
      await collectFilesWithPathsRecursively({ directoryHandle: subdir, pathParts: currentParts, items })
    }
  }
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
  await collectFilesWithPathsRecursively({ directoryHandle: dirHandle, pathParts: [], items })
  return { indexed: items, directoryHandle: dirHandle }
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
  const samplePaths: string[] = []

  for (const entry of files) {
    const normalizedPath = (entry.path ?? '').replaceAll('\\', '/').replace(/^\/+/, '')
    const segments = normalizedPath.split('/').filter(Boolean)
    const patchesIndex = segments.findIndex((segment) => segment.toLowerCase() === 'patches')
    if (patchesIndex < 0) continue
    const next = segments[patchesIndex + 1] ?? ''
    if (!next.toLowerCase().endsWith('.jpg')) continue
    samplePaths.push(normalizedPath)
    if (samplePaths.length >= limit) break
  }

  return samplePaths
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
