import type { FileSystemDirectoryHandleLike, FileSystemFileHandleLike } from '~/utils/fs-directory-handle'
import { isReservedDatasetsChildFolderName } from './classify-dataset-folder'
import { PACKAGE_ARCHIVE_DIR } from './reserved-paths'
import { resolveLegacyContentRootHandle } from './resolve-legacy-content-root'

type MoveableHandle = {
  kind?: string
  name?: string
  move?: (
    destination: FileSystemDirectoryHandleLike,
    newName?: string,
  ) => Promise<FileSystemDirectoryHandleLike | FileSystemFileHandleLike | void>
  getFile?: () => Promise<File>
}

type DirectoryWithEntries = FileSystemDirectoryHandleLike & {
  entries?: () => AsyncIterable<[string, MoveableHandle]>
  getDirectoryHandle?: (name: string, opts?: { create?: boolean }) => Promise<FileSystemDirectoryHandleLike>
  removeEntry?: (name: string, options?: { recursive?: boolean }) => Promise<void>
}

export async function moveLegacyContentsIntoPackageSource(params: {
  legacyHandle: FileSystemDirectoryHandleLike
  packageHandle: FileSystemDirectoryHandleLike
}): Promise<{ movedCount: number }> {
  const { packageHandle } = params
  const legacyRoot = await resolveLegacyContentRootHandle(params.legacyHandle)
  const legacy = legacyRoot as DirectoryWithEntries
  const packageDir = packageHandle as DirectoryWithEntries

  const sourceDir = (await packageDir.getDirectoryHandle?.(PACKAGE_ARCHIVE_DIR, { create: true })) as DirectoryWithEntries
  if (!sourceDir) throw new Error(`Could not create ${PACKAGE_ARCHIVE_DIR}/ in the package folder.`)

  if (typeof legacy.entries !== 'function') {
    throw new Error(
      'This folder cannot be relocated automatically (directory entries() is not supported). Move contents into 00_source/ manually, then refresh.',
    )
  }

  const movedCount = await moveDirectoryTreeIntoSource({ sourceDir: legacy, destinationDir: sourceDir })

  if (movedCount === 0) {
    throw new Error('The legacy folder is empty — nothing to move into 00_source/.')
  }

  return { movedCount }
}

/**
 * Browsers do not implement move() on directory handles yet (only files).
 * Relocate by moving each file with FileSystemHandle.move(parent, name) and creating matching folders.
 */
async function moveDirectoryTreeIntoSource(params: {
  sourceDir: DirectoryWithEntries
  destinationDir: DirectoryWithEntries
}): Promise<number> {
  const { sourceDir, destinationDir } = params
  let movedCount = 0

  const entriesIterable = sourceDir.entries?.()
  if (!entriesIterable) return movedCount

  for await (const [name, child] of entriesIterable) {
    if (name === PACKAGE_ARCHIVE_DIR || isReservedDatasetsChildFolderName(name)) continue

    if (isFileHandle(child)) {
      await moveFileIntoDirectory({ file: child, destinationDir, name })
      await tryRemoveSourceEntry(sourceDir, name)
      movedCount++
      continue
    }

    const subDestination = (await destinationDir.getDirectoryHandle?.(name, { create: true })) as DirectoryWithEntries
    if (!subDestination) throw new Error(`Could not create ${name}/ under ${PACKAGE_ARCHIVE_DIR}/.`)

    movedCount += await moveDirectoryTreeIntoSource({ sourceDir: child as DirectoryWithEntries, destinationDir: subDestination })
    await tryRemoveSourceEntry(sourceDir, name)
  }

  return movedCount
}

async function moveFileIntoDirectory(params: {
  file: MoveableHandle
  destinationDir: DirectoryWithEntries
  name: string
}) {
  const { file, destinationDir, name } = params

  if (typeof file.move !== 'function') {
    console.log('🚨 moveFileIntoDirectory: move() unavailable', {
      fileName: name,
      entryKind: file.kind,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    })
    throw new Error(
      `Cannot move file “${name}” — FileSystemHandle.move() is not available. Use Chrome or Edge 122+ (current versions still cannot move whole folders; only files).`,
    )
  }

  try {
    await file.move(destinationDir, name)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.log('🚨 moveFileIntoDirectory: move() failed', { fileName: name, message })
    throw new Error(`Failed to move file “${name}”: ${message}`)
  }
}

async function tryRemoveSourceEntry(sourceDir: DirectoryWithEntries, name: string) {
  if (typeof sourceDir.removeEntry !== 'function') return

  try {
    await sourceDir.removeEntry(name, { recursive: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.log('🚨 moveLegacy: could not remove source entry after move', { name, message })
  }
}

function isFileHandle(handle: MoveableHandle): boolean {
  return handle.kind === 'file' || typeof handle.getFile === 'function'
}

export async function getPackageSourceDirectoryHandle(
  packageHandle: FileSystemDirectoryHandleLike,
): Promise<FileSystemDirectoryHandleLike> {
  const packageDir = packageHandle as DirectoryWithEntries
  const sourceDir = await packageDir.getDirectoryHandle?.(PACKAGE_ARCHIVE_DIR, { create: false })
  if (!sourceDir) throw new Error(`Missing ${PACKAGE_ARCHIVE_DIR}/ in the package folder.`)
  return sourceDir
}
