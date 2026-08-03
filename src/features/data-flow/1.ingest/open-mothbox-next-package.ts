import { toast } from 'sonner'
import { resetAllEntityStores } from '~/stores/entities'
import { pickerErrorStore } from '~/stores/ui'
import { setActiveDatasetFolderName } from '~/stores/datasets-registry'
import { persistPickedDirectory } from '~/features/data-flow/3.persist/files.persistence'
import type { FileSystemDirectoryHandleLike } from '~/features/mothbox-next/adapters/dinalab-mothbox-v1/browser-adapter-io'
import { collectIndexedFromDirectoryHandle } from './files.fs'
import { singlePassIngest } from './files.single-pass'
import { overlayHumanDetections } from './overlay-human-detections'
import { formatFilesystemError } from '~/utils/fs-error'
import { migrateLegacyMorphoLinksInPackage } from '~/features/mothbox-next/morpho-links-package'
import { migratePackageSourceToArchiveIfNeeded } from '~/features/mothbox-next/migrate-package-source-to-archive'
import { normalizeIndexedPathsToPackageRoot } from '~/features/mothbox-next/package-indexed-access'
import { tryRestorePackageFromSessionCache } from '~/features/data-flow/3.persist/restore-package-session-cache'
import { savePackageSessionCacheFromStores } from '~/features/data-flow/3.persist/save-package-session-cache'
import { isMothboxNextPackageOpen } from '~/features/mothbox-next/active-package'
import { cancelDatasetAutoLoad, OPEN_PACKAGE_TOAST_ID } from './dataset-auto-load'

/** Cancel button attached to the "Opening dataset…" toast. */
const CANCEL_LOAD_ACTION = { label: 'Cancel', onClick: () => cancelDatasetAutoLoad() }

export type OpenPackageResult =
  | { ok: true; fromCache?: boolean }
  | { ok: false; message?: string }

export type OpenPackageOptions = {
  /** When false, skip success toast (e.g. background warm on startup). */
  showSuccessToast?: boolean
  /**
   * Sibling folder holding the original (primary) source data, when the
   * package lives in a different location (e.g. _processed/<name> mirror).
   * Indexed read-only and merged in just for resolving full-size source
   * photos that aren't included in the package's own files.
   */
  originalSourceHandle?: FileSystemDirectoryHandleLike
}

export async function openMothboxNextPackageFromHandle(
  handle: FileSystemDirectoryHandleLike,
  options?: OpenPackageOptions,
): Promise<OpenPackageResult> {
  const folderName = (handle as { name?: string }).name?.trim() || 'dataset'
  const showSuccessToast = options?.showSuccessToast !== false
  const originalSourceHandle = options?.originalSourceHandle

  toast.loading('Opening dataset…', {
    id: OPEN_PACKAGE_TOAST_ID,
    description: `Reading ${folderName} from disk.`,
    duration: Infinity,
    action: CANCEL_LOAD_ACTION,
  })

  try {
    await persistPickedDirectory(handle)
    resetAllEntityStores()

    const indexed = await collectIndexedFromDirectoryHandle(handle, { hydrateFiles: false })
    const normalizedIndexed = normalizeIndexedPathsToPackageRoot(indexed)

    // Index the sibling original-source folder (if any) read-only, purely
    // to make full-size source photos resolvable. Failures here are
    // non-fatal — the dataset still opens, just without source photos.
    let extraSourceResolutionFiles: Awaited<ReturnType<typeof collectIndexedFromDirectoryHandle>> = []
    if (originalSourceHandle) {
      try {
        extraSourceResolutionFiles = await collectIndexedFromDirectoryHandle(originalSourceHandle, {
          hydrateFiles: false,
        })
      } catch (err) {
        console.warn('🚨 openMothboxNextPackage: could not index original source folder', err)
        extraSourceResolutionFiles = []
      }
      // If the source folder only contained date-named subdirectories (all skipped during
      // scanning), extraSourceResolutionFiles is empty and the handle is lost. Add a
      // synthetic sentinel so originalSourceHandle survives into sourceResolutionByPath for
      // virtual photo navigation via rootDir.
      if (!extraSourceResolutionFiles.some((f) => (f as { rootDir?: unknown }).rootDir)) {
        extraSourceResolutionFiles = [
          ...extraSourceResolutionFiles,
          { path: '___source_root___', name: '___source_root___', size: 0, rootDir: originalSourceHandle },
        ]
      }
    }

    await migratePackageSourceToArchiveIfNeeded({
      packageHandle: handle,
      indexedPaths: normalizedIndexed.map((file) => file.path),
      showToast: showSuccessToast,
    })

    const restoredFromCache = await tryRestorePackageFromSessionCache({
      folderName,
      indexed: normalizedIndexed,
      extraSourceResolutionFiles,
    })
    if (restoredFromCache) {
      pickerErrorStore.set(null)
      setActiveDatasetFolderName(folderName)

      // Human detections aren't in the records, so the cache restore rebuilt only
      // the bot patches. Re-derive the x-anylabeling HumanDetection overlay from
      // those (their parentDir navigators point back into the night folders).
      await overlayHumanDetections()

      const morphoLinks = await migrateLegacyMorphoLinksInPackage({ packageHandle: handle })
      if (morphoLinks.importedCount > 0) {
        console.log('✅ openPackage: migrated morpho links', morphoLinks)
        await savePackageSessionCacheFromStores({ folderName })
      }

      if (showSuccessToast) {
        toast.success('Dataset opened', {
          id: OPEN_PACKAGE_TOAST_ID,
          description: `Restored from cache · ${folderName}`,
        })
      } else {
        toast.dismiss(OPEN_PACKAGE_TOAST_ID)
      }

      return { ok: true, fromCache: true }
    }

    toast.loading('Opening dataset…', {
      id: OPEN_PACKAGE_TOAST_ID,
      description: `Loading ${normalizedIndexed.length.toLocaleString()} file${normalizedIndexed.length === 1 ? '' : 's'}…`,
      duration: Infinity,
      action: CANCEL_LOAD_ACTION,
    })

    const hydrated = await hydrateIndexedForIngest(normalizedIndexed)
    const hydratedExtraSourceResolutionFiles = extraSourceResolutionFiles.length
      ? await hydrateIndexedForIngest(extraSourceResolutionFiles)
      : []
    const ingest = await singlePassIngest({
      files: hydrated,
      pathsAlreadyNormalized: true,
      extraSourceResolutionFiles: hydratedExtraSourceResolutionFiles,
    })
    if (!ingest.ok) {
      const message = formatFilesystemError(ingest.message)
      pickerErrorStore.set(message)
      toast.error('Could not open dataset', { id: OPEN_PACKAGE_TOAST_ID, description: message })
      return { ok: false, message }
    }

    pickerErrorStore.set(null)
    setActiveDatasetFolderName(folderName)

    const morphoLinks = await migrateLegacyMorphoLinksInPackage({ packageHandle: handle })
    if (morphoLinks.importedCount > 0) {
      console.log('✅ openPackage: migrated morpho links', morphoLinks)
    }

    if (isMothboxNextPackageOpen()) {
      await savePackageSessionCacheFromStores({ folderName })
    }

    if (showSuccessToast) {
      toast.success('Dataset opened', {
        id: OPEN_PACKAGE_TOAST_ID,
        description: `Mothbox-next package · ${folderName}`,
      })
    } else {
      toast.dismiss(OPEN_PACKAGE_TOAST_ID)
    }

    return { ok: true }
  } catch (err) {
    const message = formatFilesystemError(err)
    pickerErrorStore.set(message)
    toast.error('Could not open dataset', { id: OPEN_PACKAGE_TOAST_ID, description: message })
    return { ok: false, message }
  }
}

async function hydrateIndexedForIngest(
  indexed: Awaited<ReturnType<typeof collectIndexedFromDirectoryHandle>>,
) {
  const { hydrateIndexedHandleFiles } = await import('./files.fs')
  return hydrateIndexedHandleFiles(indexed)
}
