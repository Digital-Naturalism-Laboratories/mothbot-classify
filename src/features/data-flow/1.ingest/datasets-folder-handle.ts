import { toast } from 'sonner'
import {
  ensureReadPermission,
  ensureReadWritePermission,
  loadDatasetsDirectory,
} from '~/features/data-flow/3.persist/files.persistence'
import type { FileSystemDirectoryHandleLike } from '~/features/mothbox-next/adapters/dinalab-mothbox-v1/browser-adapter-io'

export type RequireDatasetsFolderHandleParams = {
  mode?: 'read' | 'readwrite'
  /** When false, denied permission returns null without a toast (e.g. focus/startup scans). */
  notifyOnDenied?: boolean
}

export async function requireDatasetsFolderHandle(
  params: RequireDatasetsFolderHandleParams = {},
): Promise<FileSystemDirectoryHandleLike | null> {
  const mode = params.mode ?? 'read'
  const notifyOnDenied = params.notifyOnDenied ?? mode === 'readwrite'

  const existing = await loadDatasetsDirectory()
  if (!existing) return null

  const granted =
    mode === 'readwrite' ? await ensureReadWritePermission(existing) : await ensureReadPermission(existing)

  if (!granted) {
    if (notifyOnDenied) {
      toast.error(
        mode === 'readwrite'
          ? 'Could not access the saved datasets folder. Choose it again.'
          : 'Could not read the saved datasets folder. Choose it again.',
      )
    }
    return null
  }

  return existing
}
