import { toast } from 'sonner'
import type { FileSystemDirectoryHandleLike } from '~/features/mothbox-next/adapters/dinalab-mothbox-v1/browser-adapter-io'
import { isDirectoryPickerAvailable, pickDirectoryHandle } from './directory-picker'
import { convertLegacyToMothboxNextPackage } from './convert-legacy-to-package'
import { scanDatasetsFolder } from './scan-datasets-folder'
import { openMothboxNextPackageFromHandle } from './open-mothbox-next-package'

export type ImportDatasetSourceResult =
  | { ok: true; mode: 'mothbox-next' | 'legacy' }
  | { ok: false; cancelled?: boolean; message?: string }

/**
 * Single entry point for "Add new Dataset Source".
 * Picks one folder, then branches:
 *   - If it contains a dataset.json at the root → open as Mothbox-next package in place.
 *   - Otherwise → run the legacy → Mothbox-next adapter (copies into datasets/<name>/).
 */
export async function importDatasetSourceFromUserPick(): Promise<ImportDatasetSourceResult> {
  if (!isDirectoryPickerAvailable()) {
    toast.error('Folder picker is not available in this browser.')
    return { ok: false, message: 'Folder picker is not available in this browser.' }
  }

  const sourceHandle = await pickDirectoryHandle({ mode: 'read', title: 'dataset source' })
  if (!sourceHandle) return { ok: false, cancelled: true }

  const isPackage = await directoryHasDatasetManifest(sourceHandle)
  if (isPackage) {
    const opened = await openMothboxNextPackageFromHandle(sourceHandle)
    if (!opened.ok) return { ok: false, message: opened.message }
    await scanDatasetsFolder().catch(() => null)
    return { ok: true, mode: 'mothbox-next' }
  }

  const converted = await convertLegacyToMothboxNextPackage({ legacyHandle: sourceHandle })
  if (!converted) return { ok: false, message: 'Legacy dataset conversion did not complete.' }
  await scanDatasetsFolder().catch(() => null)
  return { ok: true, mode: 'legacy' }
}

async function directoryHasDatasetManifest(handle: FileSystemDirectoryHandleLike): Promise<boolean> {
  try {
    const fileHandle = await (handle as { getFileHandle?: (name: string, opts?: { create?: boolean }) => Promise<unknown> })
      .getFileHandle?.('dataset.json', { create: false })
    return !!fileHandle
  } catch {
    return false
  }
}
