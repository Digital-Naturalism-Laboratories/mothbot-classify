import { useEffect, useRef, useState } from 'react'
import { useStore } from '@nanostores/react'
import { toast } from 'sonner'
import { CopyIcon, FolderOpenIcon } from 'lucide-react'
import { Loader } from '~/components/atomic/Loader'
import { Button } from '~/components/ui/button'
import { DialogFooter, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import { closeGlobalDialog, openGlobalDialog } from '~/components/dialogs/global-dialog'
import { pickDirectoryHandle } from '~/features/data-flow/1.ingest/directory-picker'
import { setupDatasetsFolder } from '~/features/data-flow/1.ingest/choose-datasets-folder'
import { requireDatasetsFolderHandle } from '~/features/data-flow/1.ingest/datasets-folder-handle'
import { hydrateDatasetsWorkspaceFromDisk } from '~/features/data-flow/1.ingest/datasets-workspace-setup'
import { useRestoreDirectoryQuery } from '~/features/data-flow/1.ingest/files-queries'
import { openDatasetByFolderName } from '~/features/data-flow/1.ingest/open-dataset-by-folder'
import {
  getRequestedDatasetHandoff,
  requestedRootFolderName,
  type RequestedDatasetHandoff,
} from '~/features/data-flow/1.ingest/requested-dataset-from-url'
import { isDirectoryPickerAvailable } from '~/features/data-flow/1.ingest/directory-picker'
import { loadDatasetsDirectory } from '~/features/data-flow/3.persist/files.persistence'
import { isMothboxNextPackageOpen } from '~/features/mothbox-next/active-package'
import { datasetsRegistryStore } from '~/stores/datasets-registry'
import { datasetsWorkspaceStore } from '~/stores/datasets-workspace'

function isRequestedDatasetInRegistry(folderName: string): boolean {
  return datasetsRegistryStore.get().some((entry) => entry.folderName === folderName)
}

/**
 * Mounted on the home screen. When Mothbot Process handed off a dataset
 * (`?dataset=…&root=…`) that startup could not auto-open — no datasets folder
 * set yet, the wrong one, or file permission needing a fresh grant — show a
 * prompt that names the exact folder to pick. The picker itself can only be
 * opened from a click (browser rule), so the dialog provides the button.
 */
export function ProcessHandoffPrompt() {
  const restoreQuery = useRestoreDirectoryQuery()
  const registry = useStore(datasetsRegistryStore)
  const workspace = useStore(datasetsWorkspaceStore)
  const prompted = useRef(false)

  const restoreSettled = restoreQuery.isSuccess || restoreQuery.isError

  useEffect(() => {
    if (prompted.current || !restoreSettled) return
    const handoff = getRequestedDatasetHandoff()
    if (!handoff) return
    if (isMothboxNextPackageOpen()) return
    // The named dataset is already here — startup auto-open handles it.
    if (handoff.folderName && isRequestedDatasetInRegistry(handoff.folderName)) return
    // No dataset named, but Classify is already pointed at the handed-off
    // folder — nothing to fix, the user just picks from the list.
    const rootName = requestedRootFolderName()
    if (!handoff.folderName && rootName && workspace?.folderName === rootName) return

    prompted.current = true
    void loadDatasetsDirectory().then((saved) => {
      openGlobalDialog({
        component: ProcessHandoffDialog,
        props: {
          handoff,
          hasSavedRoot: !!saved,
          currentRootName: workspace?.folderName ?? null,
        },
        align: 'center',
        className: 'max-w-[460px]',
      })
    })
    // `registry`/`workspace` are read so the effect re-evaluates once restore populates them.
  }, [restoreSettled, registry, workspace])

  return null
}

type Busy = 'reconnect' | 'pick' | null

function ProcessHandoffDialog(props: {
  handoff: RequestedDatasetHandoff
  hasSavedRoot: boolean
  currentRootName: string | null
}) {
  const { handoff, hasSavedRoot, currentRootName } = props
  const [busy, setBusy] = useState<Busy>(null)
  const name = handoff.folderName
  const target = name ?? handoff.rootPath?.split('/').filter(Boolean).pop() ?? 'your dataset'
  const pickerUnsupported = !isDirectoryPickerAvailable()

  const explanation = !hasSavedRoot
    ? 'Classify hasn’t been pointed at your datasets folder on this computer yet.'
    : currentRootName
      ? name
        ? `Classify’s datasets folder is currently “${currentRootName}”, which doesn’t contain “${name}” — or its access needs re-granting.`
        : `Classify’s datasets folder is currently “${currentRootName}”, not the folder you chose in Process.`
      : 'Classify needs access to your datasets folder again.'

  async function copyPath() {
    if (!handoff.rootPath) return
    try {
      await navigator.clipboard.writeText(handoff.rootPath)
      toast.success('Folder path copied', { description: 'In the picker, press ⌘⇧G (Mac) and paste it.' })
    } catch {
      toast.error('Could not copy — select the path above and copy it manually.')
    }
  }

  async function openIfPresent(): Promise<boolean> {
    // With no dataset named, setting the right folder is the whole job.
    if (!name) {
      closeGlobalDialog()
      return true
    }
    if (!isRequestedDatasetInRegistry(name)) return false
    const opened = await openDatasetByFolderName({ folderName: name })
    if (opened) closeGlobalDialog()
    return opened
  }

  /** Re-grant access to the already-saved folder (needs the click gesture) — no picker. */
  async function reconnectSaved() {
    setBusy('reconnect')
    try {
      const root = await requireDatasetsFolderHandle({ mode: 'read', notifyOnDenied: false })
      if (root) {
        await hydrateDatasetsWorkspaceFromDisk()
        if (await openIfPresent()) return
      }
      toast.error(`“${target}” isn’t in the saved folder.`, {
        description: handoff.rootPath ? `Choose ${handoff.rootPath} instead.` : 'Choose the folder that contains it.',
      })
    } finally {
      setBusy(null)
    }
  }

  /** Opens the native picker first thing (must stay inside the click gesture). */
  async function chooseFolder() {
    const handle = await pickDirectoryHandle({ mode: 'readwrite', title: 'datasets folder' })
    if (!handle) return
    setBusy('pick')
    try {
      const ok = await setupDatasetsFolder(handle)
      if (!ok) return
      if (await openIfPresent()) return
      const picked = (handle as { name?: string }).name ?? 'that folder'
      toast.error(`“${target}” isn’t inside “${picked}”.`, {
        description: handoff.rootPath
          ? `Pick ${handoff.rootPath} — the folder Process was pointed at.`
          : `Pick the folder that contains “${target}”.`,
        duration: 10000,
      })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <DialogHeader>
        <DialogTitle>Open “{target}” from Mothbot Process</DialogTitle>
      </DialogHeader>

      <p className='mt-12 text-13 text-neutral-700 text-pretty'>{explanation}</p>

      {pickerUnsupported ? (
        <p className='mt-8 rounded bg-amber-50 px-10 py-8 text-13 text-amber-900 text-pretty'>
          <b>This browser can’t open folders.</b> Classify needs the File System Access API, which only
          Chrome, Edge, and other Chromium browsers support. Copy this page’s address into Chrome to
          continue.
        </p>
      ) : null}

      <p className='mt-8 text-13 text-neutral-700 text-pretty'>
        Point Classify’s datasets folder at{name ? ' the folder that ' : ' '}
        {name ? <b>contains</b> : null}
        {name ? ` “${name}”:` : 'this folder:'}
      </p>
      {handoff.rootPath ? (
        <div className='mt-6 flex items-center gap-6'>
          <code className='flex-1 select-all break-all rounded bg-neutral-100 px-8 py-6 text-12 text-neutral-800'>
            {handoff.rootPath}
          </code>
          <Button variant='outline' type='button' size='sm' onClick={() => void copyPath()} title='Copy path'>
            <CopyIcon size={14} />
          </Button>
        </div>
      ) : (
        <p className='mt-6 text-12 text-neutral-500'>(the folder one level above “{name}”)</p>
      )}
      <p className='mt-6 text-12 text-neutral-500 text-pretty'>
        Tip: in the folder picker, press ⌘⇧G (Mac) or type the path in the address bar (Windows) and paste it.
      </p>

      <DialogFooter className='mt-20'>
        <Button variant='outline' type='button' disabled={busy !== null} onClick={closeGlobalDialog}>
          Not now
        </Button>
        {hasSavedRoot ? (
          <Button variant='outline' type='button' disabled={busy !== null} onClick={() => void reconnectSaved()}>
            {busy === 'reconnect' ? (
              <span className='inline-flex items-center gap-6'>
                <Loader size={14} />
                Reconnecting…
              </span>
            ) : (
              'Reconnect saved folder'
            )}
          </Button>
        ) : null}
        <Button type='button' variant='primary' disabled={busy !== null || pickerUnsupported} onClick={() => void chooseFolder()}>
          {busy === 'pick' ? (
            <span className='inline-flex items-center gap-6'>
              <Loader size={14} />
              Opening…
            </span>
          ) : (
            <span className='inline-flex items-center gap-6'>
              <FolderOpenIcon size={14} />
              Choose datasets folder…
            </span>
          )}
        </Button>
      </DialogFooter>
    </div>
  )
}
