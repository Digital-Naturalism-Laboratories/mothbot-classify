import { toast } from 'sonner'
import { ensureReadWritePermission } from '~/features/data-flow/3.persist/files.persistence'
import {
  findPatchesToMeasure,
  readMeasurementsFromDetections,
  upsertPatchMeasurements,
} from '~/features/mothbox-next/refresh-patch-measurements'
import { resolveOpenPackageIO } from './check-for-new-nights'
import { openDatasetByFolderName } from './open-dataset-by-folder'

const MEASUREMENTS_TOAST_ID = 'patch-measurements-available'
/** Set while an import runs; its reopen of the dataset would otherwise re-enter the check. */
let importing = false

/**
 * Offers to import blurriness scores Mothbot Process wrote after this dataset's
 * records were built, or re-scored with a newer method. The probe reads only a few
 * detection files; nothing is written unless the user accepts, and then only
 * `patch-measurements.ndjson`.
 */
export async function checkForMeasurementsInOpenPackage(): Promise<number> {
  if (importing) return 0
  const resolved = await resolveOpenPackageIO()
  if (!resolved) return 0
  const { io, packageDir, folderName, sourcePrefix } = resolved

  const pendingByJson = await findPatchesToMeasure(io, { includeScored: true })
  if (!pendingByJson.size) return 0
  const sample = await readMeasurementsFromDetections({ io, pendingByJson, sourcePrefix, sampleFiles: 8 })
  if (!sample.length) return 0 // nothing new: Process hasn't scored this dataset (yet), or it's up to date

  const pending = [...pendingByJson.values()].flat()
  const unscoredIds = new Set(pending.filter((p) => p.currentMethod === undefined).map((p) => p.patchId))
  const adding = sample.some((row) => unscoredIds.has(row.patch_id))
  toast.info(adding ? 'Blurriness scores available' : 'Updated blurriness scores available', {
    id: MEASUREMENTS_TOAST_ID,
    description: adding
      ? `Mothbot Process has scored the patches in this dataset. Add blurriness for up to ` +
        `${unscoredIds.size.toLocaleString()} patches so you can sort and filter by it? Identifications are untouched.`
      : 'Mothbot Process has re-scored this dataset with a newer blurriness method. Update the scores? ' +
        'Identifications are untouched.',
    duration: Infinity,
    action: {
      label: adding ? 'Add' : 'Update',
      onClick: () => {
        void runImport({ resolved: { io, packageDir, folderName, sourcePrefix }, pendingByJson, updating: !adding })
      },
    },
  })
  return adding ? unscoredIds.size : pending.length
}

async function runImport(params: {
  resolved: Pick<NonNullable<Awaited<ReturnType<typeof resolveOpenPackageIO>>>, 'io' | 'packageDir' | 'folderName' | 'sourcePrefix'>
  pendingByJson: Awaited<ReturnType<typeof findPatchesToMeasure>>
  /** Re-scored by a newer method rather than newly scored (only changes the wording). */
  updating: boolean
}) {
  const { resolved, pendingByJson, updating } = params
  toast.loading(updating ? 'Updating blurriness scores…' : 'Adding blurriness scores…', {
    id: MEASUREMENTS_TOAST_ID,
    description: `Reading ${pendingByJson.size.toLocaleString()} detection files.`,
    duration: Infinity,
    action: undefined,
  })
  importing = true
  try {
    const writable = await ensureReadWritePermission(resolved.packageDir as never)
    if (!writable) {
      toast.error('Write access is needed to add blurriness scores', {
        id: MEASUREMENTS_TOAST_ID,
        description: 'Grant access to the dataset folder and try again.',
        duration: 8000,
        action: undefined,
      })
      return
    }
    const rows = await readMeasurementsFromDetections({
      io: resolved.io,
      pendingByJson,
      sourcePrefix: resolved.sourcePrefix,
    })
    const added = await upsertPatchMeasurements(resolved.io, rows)
    // The records changed on disk, so reopening re-reads them (the session-cache
    // fingerprint covers 02_records/).
    if (added) await openDatasetByFolderName({ folderName: resolved.folderName, showSuccessToast: false })
    const done = `${updating ? 'Updated' : 'Added'} blurriness for ${added.toLocaleString()} patches`
    toast.success(added ? done : 'No new blurriness scores found', {
      id: MEASUREMENTS_TOAST_ID,
      description: added ? 'Sort or filter by blurriness in a night’s Layout Options.' : undefined,
      duration: 6000,
      action: undefined,
    })
  } catch (err) {
    console.warn('🚨 checkForMeasurements: import failed', err)
    toast.error('Could not add blurriness scores', {
      id: MEASUREMENTS_TOAST_ID,
      description: err instanceof Error ? err.message : 'Unknown error.',
      duration: Infinity,
      action: undefined,
    })
  } finally {
    importing = false
  }
}
