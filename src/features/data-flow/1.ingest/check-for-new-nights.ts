import { toast } from 'sonner'
import { userSessionStore } from '~/stores/ui'
import { mothboxNextPackageStore } from '~/features/mothbox-next/active-package'
import { createBrowserDinalabAdapterIO } from '~/features/mothbox-next/adapters/dinalab-mothbox-v1/browser-adapter-io'
import { addNewNightsToPackage, detectNewNightFolders } from '~/features/mothbox-next/add-new-nights'
import { activeDatasetFolderNameStore } from '~/stores/datasets-registry'
import { ensureReadPermission, ensureReadWritePermission, persistenceConstants } from '~/features/data-flow/3.persist/files.persistence'
import { idbGet } from '~/utils/index-db'
import { openDatasetByFolderName } from './open-dataset-by-folder'
import type { FileSystemDirectoryHandleLike } from '~/utils/fs-directory-handle'

const NEW_NIGHTS_TOAST_ID = 'new-nights-found'

/**
 * Set while a merge is running. The merge reopens the dataset when it finishes,
 * which would otherwise re-enter the check from `openDatasetByFolderName`.
 */
let suppressCheck = false

type DirectoryHandleWithGet = FileSystemDirectoryHandleLike & {
  getDirectoryHandle?: (name: string, opts?: { create?: boolean }) => Promise<FileSystemDirectoryHandleLike>
}

async function resolveDirectory(
  root: FileSystemDirectoryHandleLike,
  relativePath: string,
): Promise<FileSystemDirectoryHandleLike | null> {
  let dir: FileSystemDirectoryHandleLike | undefined = root
  for (const segment of relativePath.split('/').filter(Boolean)) {
    try {
      dir = await (dir as DirectoryHandleWithGet)?.getDirectoryHandle?.(segment, { create: false })
    } catch {
      return null
    }
    if (!dir) return null
  }
  return dir ?? null
}

/**
 * Looks for night folders that Mothbot Process wrote into the open package but
 * which aren't in its records yet, and offers to add them.
 *
 * Detection is read-only. The merge only runs if the user accepts, and it
 * appends records rather than rebuilding the package, so existing
 * identification work is left untouched.
 */
export async function checkForNewNightsInOpenPackage(): Promise<number> {
  if (suppressCheck) return 0

  // `packageRoot` is '' for a package opened at its own root, so presence of an
  // active package is the signal here — not a non-empty packageRoot.
  const active = mothboxNextPackageStore.get()
  if (!active) return 0

  const folderName = activeDatasetFolderNameStore.get()
  if (!folderName) return 0

  // The persisted `projectsRoot` handle IS the package directory (it's what
  // openMothboxNextPackageFromHandle stored), so resolve from there rather than
  // walking down from the datasets folder.
  const projectsRoot = (await idbGet(
    persistenceConstants.IDB_NAME,
    persistenceConstants.IDB_STORE,
    'projectsRoot',
  )) as FileSystemDirectoryHandleLike | null
  if (!projectsRoot) return 0

  const granted = await ensureReadPermission(projectsRoot as never)
  if (!granted) return 0

  const packageDir = active.packageRoot
    ? await resolveDirectory(projectsRoot, active.packageRoot)
    : projectsRoot
  if (!packageDir) return 0

  // The manifest records where the source tree sits relative to the package.
  const sourcePath = active.manifest?.source?.path ?? './'
  const sourcePrefix = sourcePath === './' || sourcePath === '.' ? '' : sourcePath.replace(/\/+$/, '')
  const sourceDir = sourcePrefix ? await resolveDirectory(packageDir, sourcePrefix) : packageDir
  if (!sourceDir) return 0

  const io = createBrowserDinalabAdapterIO({ sourceHandle: sourceDir, packageHandle: packageDir })

  let detection: Awaited<ReturnType<typeof detectNewNightFolders>>
  try {
    detection = await detectNewNightFolders(io)
  } catch (err) {
    console.warn('🌀 checkForNewNights: detection failed', err)
    return 0
  }

  console.log('🌀 checkForNewNights:', {
    packageRoot: active.packageRoot,
    sourcePrefix,
    newNightFolders: detection.folders,
  })

  if (!detection.folders.length) return 0

  const count = detection.folders.length
  const names = detection.folders.map((folder) => folder.split('/').pop() || folder)
  const preview = names.slice(0, 3).join(', ') + (names.length > 3 ? `, +${names.length - 3} more` : '')

  toast.info(`${count} new night${count === 1 ? '' : 's'} found on disk`, {
    id: NEW_NIGHTS_TOAST_ID,
    description: `${preview} — not yet in this dataset. Existing identifications are kept.`,
    duration: Infinity,
    action: {
      label: 'Add',
      onClick: () => {
        void runAddNewNights({
          io,
          packageDir,
          folders: detection.folders,
          datasetId: active.manifest?.dataset_id || folderName,
          sourcePrefix,
          folderName,
        })
      },
    },
  })

  return count
}

async function runAddNewNights(params: {
  io: ReturnType<typeof createBrowserDinalabAdapterIO>
  packageDir: FileSystemDirectoryHandleLike
  folders: string[]
  datasetId: string
  sourcePrefix: string
  folderName: string
}) {
  const { io, packageDir, folders, datasetId, sourcePrefix, folderName } = params
  const humanClassifierId = (userSessionStore.get()?.initials || 'user').trim().toLowerCase() || 'user'

  toast.loading('Adding new nights…', {
    id: NEW_NIGHTS_TOAST_ID,
    description: `Building records for ${folders.length} night${folders.length === 1 ? '' : 's'}.`,
    duration: Infinity,
    action: undefined,
  })

  suppressCheck = true
  try {
    // Now we actually need to write — ask for it on the package folder itself.
    const writable = await ensureReadWritePermission(packageDir as never)
    if (!writable) {
      toast.error('Write access is needed to add nights', {
        id: NEW_NIGHTS_TOAST_ID,
        description: 'Grant access to the dataset folder and try again.',
        duration: 8000,
        action: undefined,
      })
      return
    }

    const result = await addNewNightsToPackage({
      datasetId,
      io,
      folders,
      humanClassifierId,
      packageRelativeSourcePrefix: sourcePrefix,
      packageSourceLayout: sourcePrefix ? 'archive' : 'in_place',
    })

    if (!result.patchesAdded) {
      toast.error('No new patches were added', {
        id: NEW_NIGHTS_TOAST_ID,
        description: 'The night folders were found but produced no patch records.',
        duration: 8000,
        action: undefined,
      })
      return
    }

    // Records changed on disk, so reopening re-ingests (the session cache
    // fingerprint covers 02_records/ and 03_classifications/).
    await openDatasetByFolderName({ folderName, showSuccessToast: false })

    toast.success(`Added ${result.patchesAdded.toLocaleString()} patches`, {
      id: NEW_NIGHTS_TOAST_ID,
      description: `${result.cameraDaysAdded} new night${result.cameraDaysAdded === 1 ? '' : 's'} merged into this dataset.`,
      duration: 6000,
      action: undefined,
    })
  } catch (err) {
    console.warn('🚨 checkForNewNights: merge failed', err)
    toast.error('Could not add the new nights', {
      id: NEW_NIGHTS_TOAST_ID,
      description: err instanceof Error ? err.message : 'Unknown error.',
      duration: Infinity,
      action: undefined,
    })
  } finally {
    suppressCheck = false
  }
}
