import { toast } from 'sonner'
import { resetAllEntityStores } from '~/stores/entities'
import { pickerErrorStore } from '~/stores/ui'
import { setActiveDatasetFolderName } from '~/stores/datasets-registry'
import { persistPickedDirectory } from '~/features/data-flow/3.persist/files.persistence'
import type { FileSystemDirectoryHandleLike } from '~/features/mothbox-next/adapters/dinalab-mothbox-v1/browser-adapter-io'
import { collectFilesWithPathsRecursively, type IndexedPickedFile } from './files.fs'
import { singlePassIngest } from './files.single-pass'

const OPEN_PACKAGE_TOAST_ID = 'open-mothbox-next-package'

export type OpenPackageResult =
  | { ok: true }
  | { ok: false; message?: string }

export async function openMothboxNextPackageFromHandle(
  handle: FileSystemDirectoryHandleLike,
): Promise<OpenPackageResult> {
  const folderName = (handle as { name?: string }).name?.trim() || 'dataset'

  toast.loading('Opening dataset…', {
    id: OPEN_PACKAGE_TOAST_ID,
    description: `Reading ${folderName} from disk.`,
  })

  try {
    await persistPickedDirectory(handle)
    resetAllEntityStores()

    const indexed = await collectIndexedFromHandle(handle)
    toast.loading('Opening dataset…', {
      id: OPEN_PACKAGE_TOAST_ID,
      description: `Loading ${indexed.length.toLocaleString()} file${indexed.length === 1 ? '' : 's'}…`,
    })

    const ingest = await singlePassIngest({ files: indexed })
    if (!ingest.ok) {
      pickerErrorStore.set(ingest.message)
      toast.error('Could not open dataset', { id: OPEN_PACKAGE_TOAST_ID, description: ingest.message })
      return { ok: false, message: ingest.message }
    }

    pickerErrorStore.set(null)
    setActiveDatasetFolderName(folderName)
    toast.success('Dataset opened', {
      id: OPEN_PACKAGE_TOAST_ID,
      description: `Mothbox-next package · ${folderName}`,
    })
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    pickerErrorStore.set(message)
    toast.error('Could not open dataset', { id: OPEN_PACKAGE_TOAST_ID, description: message })
    return { ok: false, message }
  }
}

async function collectIndexedFromHandle(handle: FileSystemDirectoryHandleLike): Promise<IndexedPickedFile[]> {
  const items: IndexedPickedFile[] = []
  await collectFilesWithPathsRecursively({ directoryHandle: handle as any, pathParts: [], items })

  return Promise.all(
    items.map(async (entry) => {
      if (entry.file) return entry
      const fileHandle = entry.handle as { getFile?: () => Promise<File> } | undefined
      const file = await fileHandle?.getFile?.()
      return { ...entry, file: file ?? entry.file, size: file?.size ?? entry.size }
    }),
  )
}
