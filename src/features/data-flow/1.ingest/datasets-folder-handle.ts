import { toast } from 'sonner'
import {
  ensureReadWritePermission,
  loadDatasetsDirectory,
} from '~/features/data-flow/3.persist/files.persistence'
import type { FileSystemDirectoryHandleLike } from '~/features/mothbox-next/adapters/dinalab-mothbox-v1/browser-adapter-io'

export async function requireDatasetsFolderHandle(): Promise<FileSystemDirectoryHandleLike | null> {
  const existing = await loadDatasetsDirectory()
  if (!existing) return null

  const granted = await ensureReadWritePermission(existing)
  if (!granted) {
    toast.error('Could not access the saved datasets folder. Choose it again.')
    return null
  }

  return existing
}
