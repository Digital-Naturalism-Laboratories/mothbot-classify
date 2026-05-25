import { findRelativeFilesUnderDirectory } from './fs-find-files'
import { isReservedPackageChildName } from './reserved-paths'
import type { PatchSourceRecord } from '~/features/mothbox-next/records'
import type { FileSystemDirectoryHandleLike } from '~/utils/fs-directory-handle'

export type ForeignFolderCandidate = {
  folderName: string
  botDetectionFileCount: number
  photosOnly: boolean
}

type DirectoryWithEntries = FileSystemDirectoryHandleLike & {
  kind?: string
  entries?: () => AsyncIterable<[string, FileSystemDirectoryHandleLike]>
}

export async function listForeignFoldersInPackage(
  packageHandle: FileSystemDirectoryHandleLike,
): Promise<ForeignFolderCandidate[]> {
  const packageDir = packageHandle as DirectoryWithEntries
  if (typeof packageDir.entries !== 'function') return []

  const candidates: ForeignFolderCandidate[] = []

  for await (const [name, handle] of packageDir.entries()) {
    if (isReservedPackageChildName(name)) continue
    if (handle?.kind === 'file') continue

    const botPaths = await findRelativeFilesUnderDirectory(handle, (fileName) => fileName.endsWith('_botdetection.json'))
    if (botPaths.length > 0) {
      candidates.push({ folderName: name, botDetectionFileCount: botPaths.length, photosOnly: false })
      continue
    }

    const photoPaths = await findRelativeFilesUnderDirectory(handle, (fileName) => /\.(jpg|jpeg|png)$/i.test(fileName))
    if (photoPaths.length > 0) {
      candidates.push({ folderName: name, botDetectionFileCount: 0, photosOnly: true })
    }
  }

  return candidates.sort((a, b) => a.folderName.localeCompare(b.folderName))
}

export function indexedSourceRootsFromPatchSources(patchSources: PatchSourceRecord[]): Set<string> {
  const roots = new Set<string>()

  for (const source of patchSources) {
    const path = (source.original_patch_path ?? source.original_bot_detection_path ?? '').replaceAll('\\', '/')
    const firstSegment = path.split('/').filter(Boolean)[0]
    if (firstSegment) roots.add(firstSegment)
  }

  return roots
}

export function findUnmergedForeignFolders(params: {
  candidates: ForeignFolderCandidate[]
  indexedSourceRoots: Set<string>
}): ForeignFolderCandidate[] {
  const { candidates, indexedSourceRoots } = params

  return candidates.filter((candidate) => {
    if (candidate.photosOnly) return false
    return !indexedSourceRoots.has(candidate.folderName)
  })
}
