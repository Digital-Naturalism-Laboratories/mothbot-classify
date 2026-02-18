import { ensureReadWritePermission } from '~/features/data-flow/3.persist/files.persistence'

type FileSystemFileHandleLike = {
  getFile: () => Promise<File>
  name?: string
}

type FileSystemDirectoryHandleLike = {
  values: () => AsyncIterable<FileSystemFileHandleLike | FileSystemDirectoryHandleLike>
  name?: string
}

export type IndexedPickedFile = {
  file?: File
  handle?: unknown
  path: string
  name: string
  size: number
}

type NormalizePathsResult = { ok: true; files: IndexedPickedFile[] } | { ok: false; levelsUp: number }

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
  void ensureReadWritePermission(dirHandle as any)

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

  const sample = findPatchesSamplePath({ files })
  if (!sample) return { ok: true, files }

  const sampleSegments = sample.split('/').filter(Boolean)
  const patchesIndex = sampleSegments.findIndex((segment) => segment.toLowerCase() === 'patches')
  if (patchesIndex < 0) return { ok: true, files }

  const stripCountA = patchesIndex - 4
  const stripCountB = patchesIndex - 3
  const candidateStripCounts = [stripCountA, stripCountB].filter((stripCount) => stripCount >= 0)
  if (candidateStripCounts.length === 0) {
    const levelsUp = Math.max(1, Math.min(...[-stripCountA, -stripCountB].filter((n) => n > 0)))
    return { ok: false, levelsUp }
  }

  const stripCount = Math.min(...candidateStripCounts)
  const nightSegment = sampleSegments[patchesIndex - 1] ?? ''
  if (!isLikelyNightFolderName(nightSegment)) return { ok: false, levelsUp: 1 }

  if (stripCount === 0) return { ok: true, files }

  const adjustedFiles = files.map((entry) => {
    const normalizedPath = (entry.path ?? '').replaceAll('\\', '/').replace(/^\/+/, '')
    const segments = normalizedPath.split('/').filter(Boolean)
    const trimmedPath = segments.slice(stripCount).join('/')
    return { ...entry, path: trimmedPath }
  })
  return { ok: true, files: adjustedFiles }
}

function findPatchesSamplePath(params: { files: IndexedPickedFile[] }) {
  const { files } = params
  for (const entry of files) {
    const normalizedPath = (entry.path ?? '').replaceAll('\\', '/').replace(/^\/+/, '')
    const segments = normalizedPath.split('/').filter(Boolean)
    const patchesIndex = segments.findIndex((segment) => segment.toLowerCase() === 'patches')
    if (patchesIndex < 0) continue
    const next = segments[patchesIndex + 1] ?? ''
    if (next.toLowerCase().endsWith('.jpg')) return normalizedPath
  }
  return ''
}

function isLikelyNightFolderName(name: string) {
  const lower = (name ?? '').toLowerCase()
  if (!lower) return false
  if (/^\d{4}-\d{2}-\d{2}$/.test(lower)) return true
  if (lower.startsWith('night')) return true
  return false
}
