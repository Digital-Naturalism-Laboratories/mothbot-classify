import { toast } from 'sonner'
import { resetAllEntityStores } from '~/stores/entities'
import { pickerErrorStore } from '~/stores/ui'
import { setActiveDatasetFolderName } from '~/stores/datasets-registry'
import { persistPickedDirectory } from '~/features/data-flow/3.persist/files.persistence'
import type { FileSystemDirectoryHandleLike } from '~/features/mothbox-next/adapters/dinalab-mothbox-v1/browser-adapter-io'
import { collectIndexedFromDirectoryHandle } from './files.fs'
import { singlePassIngest } from './files.single-pass'
import { formatFilesystemError } from '~/utils/fs-error'
import { migrateLegacyMorphoLinksInPackage } from '~/features/mothbox-next/morpho-links-package'
import { migratePackageSourceToArchiveIfNeeded } from '~/features/mothbox-next/migrate-package-source-to-archive'
import { normalizeIndexedPathsToPackageRoot } from '~/features/mothbox-next/package-indexed-access'
import { tryRestorePackageFromSessionCache } from '~/features/data-flow/3.persist/restore-package-session-cache'
import { savePackageSessionCacheFromStores } from '~/features/data-flow/3.persist/save-package-session-cache'
import { isMothboxNextPackageOpen } from '~/features/mothbox-next/active-package'

const OPEN_PACKAGE_TOAST_ID = 'open-mothbox-next-package'

export type OpenPackageResult =
  | { ok: true; fromCache?: boolean }
  | { ok: false; message?: string }

export type OpenPackageOptions = {
  /** When false, skip success toast (e.g. background warm on startup). */
  showSuccessToast?: boolean
}

export async function openMothboxNextPackageFromHandle(
  handle: FileSystemDirectoryHandleLike,
  options?: OpenPackageOptions,
): Promise<OpenPackageResult> {
  const folderName = (handle as { name?: string }).name?.trim() || 'dataset'
  const showSuccessToast = options?.showSuccessToast !== false

  toast.loading('Opening dataset…', {
    id: OPEN_PACKAGE_TOAST_ID,
    description: `Reading ${folderName} from disk.`,
  })

  try {
    await persistPickedDirectory(handle)
    resetAllEntityStores()

    const indexed = await collectIndexedFromDirectoryHandle(handle, { hydrateFiles: false })
    const normalizedIndexed = normalizeIndexedPathsToPackageRoot(indexed)

    await migratePackageSourceToArchiveIfNeeded({
      packageHandle: handle,
      indexedPaths: normalizedIndexed.map((file) => file.path),
      showToast: showSuccessToast,
    })

    const restoredFromCache = await tryRestorePackageFromSessionCache({
      folderName,
      indexed: normalizedIndexed,
    })
    if (restoredFromCache) {
      pickerErrorStore.set(null)
      setActiveDatasetFolderName(folderName)

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
    })

    const hydrated = await hydrateIndexedForIngest(normalizedIndexed)
    const ingest = await singlePassIngest({ files: hydrated, pathsAlreadyNormalized: true })
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
