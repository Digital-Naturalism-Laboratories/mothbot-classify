import { useMemo, useRef, useState } from 'react'
import { useStore } from '@nanostores/react'
import { toast } from 'sonner'
import { ArchiveIcon } from 'lucide-react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import { Button } from '~/components/ui/button'
import { Switch } from '~/components/ui/switch'
import { mothboxNextPackageStore, originalSourceFolderStore } from '~/features/mothbox-next/active-package'
import { leafGroupsStore } from '~/stores/entities/leaf-groups'
import { idbGet } from '~/utils/index-db'
import { ensureReadWritePermission, persistenceConstants } from '~/features/data-flow/3.persist/files.persistence'
import { getFileHandle, readFileBlob, readTextFile, type FileSystemDirectoryHandleLike } from '~/utils/fs-directory-handle'
import { PACKAGE_MORPHO_LINKS_RECORD } from '~/features/mothbox-next/morpho-links-package'
import { PACKAGE_MORPHO_COVERS_RECORD } from '~/features/mothbox-next/morpho-covers-package'
import { PACKAGE_DEVICE_TYPES_RECORD } from '~/features/mothbox-next/device-types-records'
import { formatTodayYyyyMm_Dd, PACKAGE_EXPORTS_FOLDER, sanitizeForFileName } from '../export-utils'
import { planPackageZip, sessionsForExport } from './plan-package-zip'
import { writePackageZip, type PackageZipProgress } from './write-package-zip'

type Props = {
  open: boolean
  onClose: () => void
  /** Sessions ticked when the dialog opens; all when empty. */
  initialLeafGroupIds?: string[]
}

/**
 * Exports the processed side of chosen sessions as a zip for a collaborator. The unzipped
 * folder opens in Classify as a package. Renders nothing while closed.
 */
export function PackageZipDialog(props: Props) {
  if (!props.open) return null
  return <PackageZipDialogBody {...props} />
}

function PackageZipDialogBody(props: Props) {
  const { onClose } = props
  const active = useStore(mothboxNextPackageStore)
  const leafGroups = useStore(leafGroupsStore)
  const loaded = active?.loaded
  const sessions = useMemo(() => (loaded ? sessionsForExport(loaded) : []), [loaded])

  const [chosen, setChosen] = useState<Set<string>>(() => {
    const initial = (props.initialLeafGroupIds ?? []).filter((id) => sessions.some((s) => s.id === id))
    return new Set(initial.length ? initial : sessions.map((s) => s.id))
  })
  const [includeNobg, setIncludeNobg] = useState(true)
  const [includePhotos, setIncludePhotos] = useState(false)
  const [progress, setProgress] = useState<PackageZipProgress | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const chosenPatchCount = sessions.filter((s) => chosen.has(s.id)).reduce((sum, s) => sum + s.patchCount, 0)
  const running = progress !== null

  function toggle(id: string) {
    const next = new Set(chosen)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setChosen(next)
  }

  async function onExport() {
    if (!active || !loaded || !chosen.size) return
    const root = (await idbGet(persistenceConstants.IDB_NAME, persistenceConstants.IDB_STORE, 'projectsRoot')) as
      | FileSystemDirectoryHandleLike
      | null
    if (!root) {
      toast.error('The project folder is not available — reopen the project and try again.')
      return
    }

    const datasetName = sanitizeForFileName(active.manifest.title || active.manifest.dataset_id || 'dataset')
    const scopeName = chosen.size === sessions.length ? 'all-sessions' : `${chosen.size}-session${chosen.size === 1 ? '' : 's'}`
    const fileName = `${datasetName}_${scopeName}_${formatTodayYyyyMm_Dd()}.zip`

    const target = await openZipTarget({ root, fileName })
    if (!target) return

    const extraRecordTexts: Record<string, string> = {}
    for (const path of [PACKAGE_MORPHO_LINKS_RECORD, PACKAGE_MORPHO_COVERS_RECORD, PACKAGE_DEVICE_TYPES_RECORD]) {
      try {
        extraRecordTexts[path] = await readTextFile(root, path)
      } catch {
        // optional record
      }
    }
    let manifestText: string
    try {
      manifestText = await readTextFile(root, 'dataset.json')
    } catch (err) {
      toast.error('Could not read dataset.json', { description: String(err) })
      return
    }

    const plan = planPackageZip({
      loaded,
      manifestText,
      cameraDayIds: chosen.size === sessions.length ? undefined : [...chosen],
      includeNobgPatches: includeNobg,
      includeSourcePhotos: includePhotos,
      extraRecordTexts,
    })

    const controller = new AbortController()
    abortRef.current = controller
    setProgress({ done: 0, total: plan.entries.length, path: '' })
    try {
      const result = await writePackageZip({
        plan,
        readFile: async (path) => {
          try {
            return await readFileBlob(root, path)
          } catch {
            // Full-size photos of a `_processed` package stay in the original source folder.
            const source = originalSourceFolderStore.get() as FileSystemDirectoryHandleLike | null
            if (!source) return null
            try {
              return await readFileBlob(source, path)
            } catch {
              return null
            }
          }
        },
        writable: target.writable,
        onProgress: setProgress,
        signal: controller.signal,
        report: { datasetID: active.manifest.dataset_id, includesNobgPatches: includeNobg, includesSourcePhotos: includePhotos },
      })
      toast.success('Export saved', {
        description:
          `${target.label} · ${plan.sessionCount} session${plan.sessionCount === 1 ? '' : 's'}, ` +
          `${plan.patchCount.toLocaleString()} patches, ${result.fileCount.toLocaleString()} files` +
          (result.missing.length ? ` · ${result.missing.length} files weren't found (listed in export-report.json)` : ''),
        duration: 10_000,
      })
      onClose()
    } catch (err) {
      const cancelled = (err as { name?: string })?.name === 'AbortError'
      await target.writable.abort?.().catch(() => undefined)
      if (cancelled) toast.message('Export cancelled')
      else toast.error('Export failed', { description: err instanceof Error ? err.message : String(err) })
    } finally {
      abortRef.current = null
      setProgress(null)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !running && onClose()}>
      <DialogContent className='max-w-[520px]'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-8'>
            <ArchiveIcon className='h-16 w-16' /> Export for a collaborator
          </DialogTitle>
        </DialogHeader>

        {!loaded ? (
          <p className='text-13 text-ink-secondary'>Open a project first.</p>
        ) : (
          <div className='space-y-12 text-13'>
            <p className='text-ink-secondary'>
              A zip of the chosen sessions’ processed data — patches, detections, identifications (with their history)
              and records. Unzipped, it opens in Classify as a project.
            </p>

            <div>
              <div className='flex items-center gap-10 mb-6'>
                <span className='font-medium'>Sessions</span>
                <span className='text-11 text-ink-secondary tabular-nums'>
                  {chosen.size}/{sessions.length} · {chosenPatchCount.toLocaleString()} patches
                </span>
                <button type='button' className='text-11 text-blue-600 hover:underline' disabled={running}
                  onClick={() => setChosen(new Set(sessions.map((s) => s.id)))}>Select all</button>
                <button type='button' className='text-11 text-blue-600 hover:underline' disabled={running}
                  onClick={() => setChosen(new Set())}>Deselect all</button>
              </div>
              <div className='space-y-4 max-h-[220px] overflow-y-auto rounded border border-black/10 p-8'>
                {sessions.map((s) => (
                  <label key={s.id} className='flex items-center gap-8 cursor-pointer select-none'>
                    <input type='checkbox' checked={chosen.has(s.id)} disabled={running}
                      onChange={() => toggle(s.id)} className='rounded accent-blue-600' />
                    <span className='flex-1 truncate'>{leafGroups[s.id]?.name ?? s.id}</span>
                    <span className='text-11 text-ink-secondary tabular-nums'>{s.patchCount.toLocaleString()}</span>
                  </label>
                ))}
              </div>
            </div>

            <label className='flex items-center gap-12 cursor-pointer'>
              <span className='flex-1'>
                Include transparent background-removed patches
                <span className='block text-11 text-ink-secondary'>The <code>_nobg.png</code> silhouettes, where Process made them.</span>
              </span>
              <Switch checked={includeNobg} onCheckedChange={setIncludeNobg} disabled={running} />
            </label>

            <label className='flex items-center gap-12 cursor-pointer'>
              <span className='flex-1'>
                Include original full-size source images
                <span className='block text-11 text-ink-secondary'>Usually much larger; leave off unless the collaborator needs them.</span>
              </span>
              <Switch checked={includePhotos} onCheckedChange={setIncludePhotos} disabled={running} />
            </label>

            {progress ? (
              <div className='space-y-4'>
                <div className='h-6 w-full rounded bg-neutral-100 overflow-hidden'>
                  <div className='h-full bg-blue-600 transition-[width]'
                    style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }} />
                </div>
                <div className='text-11 text-ink-secondary truncate tabular-nums'>
                  {progress.done.toLocaleString()} / {progress.total.toLocaleString()} · {progress.path}
                </div>
              </div>
            ) : null}
          </div>
        )}

        <DialogFooter>
          {running ? (
            <Button variant='outline' onClick={() => abortRef.current?.abort()}>Cancel</Button>
          ) : (
            <>
              <Button variant='outline' onClick={onClose}>Close</Button>
              <Button onClick={() => void onExport()} disabled={!loaded || !chosen.size}>Export zip…</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type ZipTarget = { writable: WritableStream<Uint8Array> & { abort?: () => Promise<void> }; label: string }

/**
 * Where the zip goes: a file the person picks (Chrome's save dialog), or — where that
 * isn't available — the package's own 04_exports folder.
 */
async function openZipTarget(params: { root: FileSystemDirectoryHandleLike; fileName: string }): Promise<ZipTarget | null> {
  const picker = (window as unknown as { showSaveFilePicker?: (o: unknown) => Promise<{ createWritable: () => Promise<WritableStream<Uint8Array>>; name: string }> }).showSaveFilePicker
  if (picker) {
    try {
      const handle = await picker({
        suggestedName: params.fileName,
        types: [{ description: 'Zip archive', accept: { 'application/zip': ['.zip'] } }],
      })
      return { writable: await handle.createWritable(), label: handle.name }
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return null
      // fall through to the package folder
    }
  }
  if (!(await ensureReadWritePermission(params.root))) {
    toast.error('Write access is needed to save the export.')
    return null
  }
  const path = `${PACKAGE_EXPORTS_FOLDER}/${params.fileName}`
  const handle = (await getFileHandle(params.root, path, { create: true })) as unknown as {
    createWritable?: () => Promise<WritableStream<Uint8Array>>
  } | null
  if (!handle?.createWritable) {
    toast.error('Could not create the export file.')
    return null
  }
  return { writable: await handle.createWritable(), label: path }
}
