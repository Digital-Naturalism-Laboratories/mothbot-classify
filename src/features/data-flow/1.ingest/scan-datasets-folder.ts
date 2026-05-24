import { toast } from 'sonner'
import {
  type DatasetRegistryEntry,
  setDatasetsRegistry,
} from '~/stores/datasets-registry'
import { requireDatasetsFolderHandle } from './datasets-folder-handle'
import type { FileSystemDirectoryHandleLike } from '~/features/mothbox-next/adapters/dinalab-mothbox-v1/browser-adapter-io'
import { openMothboxNextPackageFromHandle } from './open-mothbox-next-package'

type DirectoryHandleWithIter = FileSystemDirectoryHandleLike & {
  kind?: 'directory' | 'file'
  values?: () => AsyncIterable<unknown>
  getDirectoryHandle?: (name: string, opts?: { create?: boolean }) => Promise<FileSystemDirectoryHandleLike>
  getFileHandle?: (name: string, opts?: { create?: boolean }) => Promise<{ getFile?: () => Promise<File> }>
}

export async function scanDatasetsFolder(): Promise<DatasetRegistryEntry[]> {
  const handle = (await requireDatasetsFolderHandle()) as DirectoryHandleWithIter | null
  if (!handle) {
    setDatasetsRegistry([])
    return []
  }

  const entries = await collectPackageEntriesFromDatasetsFolder(handle)
  const sorted = entries.sort((a, b) => a.folderName.localeCompare(b.folderName))
  setDatasetsRegistry(sorted)
  return sorted
}

async function collectPackageEntriesFromDatasetsFolder(
  handle: DirectoryHandleWithIter,
): Promise<DatasetRegistryEntry[]> {
  const entries: DatasetRegistryEntry[] = []
  if (typeof handle.values !== 'function') return entries

  for await (const child of handle.values()) {
    const candidate = child as DirectoryHandleWithIter
    if (candidate?.kind !== 'directory') continue

    const folderName = candidate.name?.trim()
    if (!folderName) continue

    const manifestInfo = await readManifestSummary(candidate)
    if (!manifestInfo.hasManifest) continue

    entries.push({
      folderName,
      datasetId: manifestInfo.datasetId,
      hasManifest: true,
    })
  }

  return entries
}

async function readManifestSummary(directory: DirectoryHandleWithIter) {
  try {
    const manifestHandle = await directory.getFileHandle?.('dataset.json', { create: false })
    if (!manifestHandle) return { hasManifest: false }

    let datasetId: string | undefined
    try {
      const file = await manifestHandle.getFile?.()
      if (file) {
        const text = await file.text()
        const parsed = JSON.parse(text)
        const id = (parsed as { dataset_id?: unknown })?.dataset_id
        if (typeof id === 'string' && id.trim()) datasetId = id.trim()
      }
    } catch {
      // ignore manifest parse failures; we still know the package exists
    }

    return { hasManifest: true, datasetId }
  } catch {
    return { hasManifest: false }
  }
}

export async function openDatasetByFolderName(params: { folderName: string }): Promise<boolean> {
  const { folderName } = params
  const root = (await requireDatasetsFolderHandle()) as DirectoryHandleWithIter | null
  if (!root) {
    toast.error('Datasets folder is not set.')
    return false
  }

  let subdir: FileSystemDirectoryHandleLike | undefined
  try {
    subdir = await root.getDirectoryHandle?.(folderName, { create: false })
  } catch {
    subdir = undefined
  }

  if (!subdir) {
    toast.error(`Could not open dataset folder “${folderName}”.`)
    return false
  }

  const opened = await openMothboxNextPackageFromHandle(subdir)
  return opened.ok
}
