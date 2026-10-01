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
/** Detection files the probe reads: the middle one of each night folder first, so a night measured on its own is noticed. */
const PROBE_FILES = 40
/** Set while an import runs; its reopen of the dataset would otherwise re-enter the check. */
let importing = false

type Kinds = { blur: boolean; pixelMass: boolean }

/** "blurriness scores", "pixel mass" or "blurriness scores and pixel mass". */
function describeKinds(kinds: Kinds): string {
  const names = [kinds.blur ? 'blurriness scores' : '', kinds.pixelMass ? 'pixel mass' : ''].filter(Boolean)
  return names.join(' and ')
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Where the imported measurements show up. */
function whereToFind(kinds: Kinds): string {
  return [
    kinds.blur ? 'Sort or filter by blurriness in a night’s Layout Options.' : '',
    kinds.pixelMass ? 'Pixel mass is in patch details and the Darwin CSV export.' : '',
  ].filter(Boolean).join(' ')
}

/**
 * Offers to import measurements Mothbot Process wrote after this dataset's records
 * were built — blurriness scores and pixel mass — or re-measured since. The probe
 * reads only a sample of detection files; nothing is written unless the user
 * accepts, and then only `patch-measurements.ndjson`.
 */
export async function checkForMeasurementsInOpenPackage(): Promise<number> {
  if (importing) return 0
  const resolved = await resolveOpenPackageIO()
  if (!resolved) return 0
  const { io, packageDir, folderName, sourcePrefix } = resolved

  const pendingByJson = await findPatchesToMeasure(io)
  if (!pendingByJson.size) return 0
  const sample = await readMeasurementsFromDetections({ io, pendingByJson, sourcePrefix, sampleFiles: PROBE_FILES })
  if (!sample.length) return 0 // nothing new: Process hasn't measured this dataset (yet), or it's up to date

  const added: Kinds = {
    blur: sample.some((u) => u.change.blur === 'added'),
    pixelMass: sample.some((u) => u.change.pixelMass === 'added'),
  }
  const kinds: Kinds = {
    blur: sample.some((u) => u.change.blur),
    pixelMass: sample.some((u) => u.change.pixelMass),
  }
  const adding = added.blur || added.pixelMass
  const pending = [...pendingByJson.values()].flat()
  // Patches still missing a kind of measurement that Process now has.
  const missing = pending.filter(
    (p) => (added.blur && p.current?.blur_score === undefined) || (added.pixelMass && p.current?.pixel_mass_pixels === undefined),
  ).length
  const what = describeKinds(adding ? added : kinds)
  toast.info(adding ? `${capitalize(what)} available` : `Updated ${what} available`, {
    id: MEASUREMENTS_TOAST_ID,
    description: adding
      ? `Mothbot Process has measured ${what} for patches in this dataset. Add ${what} for up to ` +
        `${missing.toLocaleString()} patches? Identifications are untouched.`
      : `Mothbot Process has re-measured ${what} for this dataset (a newer method or new results). Update them? ` +
        'Identifications are untouched.',
    duration: Infinity,
    action: {
      label: adding ? 'Add' : 'Update',
      onClick: () => {
        void runImport({ resolved: { io, packageDir, folderName, sourcePrefix }, pendingByJson, updating: !adding })
      },
    },
  })
  return adding ? missing : pending.length
}

async function runImport(params: {
  resolved: Pick<NonNullable<Awaited<ReturnType<typeof resolveOpenPackageIO>>>, 'io' | 'packageDir' | 'folderName' | 'sourcePrefix'>
  pendingByJson: Awaited<ReturnType<typeof findPatchesToMeasure>>
  /** Re-measured rather than newly measured (only changes the wording). */
  updating: boolean
}) {
  const { resolved, pendingByJson, updating } = params
  toast.loading(updating ? 'Updating measurements…' : 'Adding measurements…', {
    id: MEASUREMENTS_TOAST_ID,
    description: `Reading ${pendingByJson.size.toLocaleString()} detection files.`,
    duration: Infinity,
    action: undefined,
  })
  importing = true
  try {
    const writable = await ensureReadWritePermission(resolved.packageDir as never)
    if (!writable) {
      toast.error('Write access is needed to add measurements', {
        id: MEASUREMENTS_TOAST_ID,
        description: 'Grant access to the dataset folder and try again.',
        duration: 8000,
        action: undefined,
      })
      return
    }
    const updates = await readMeasurementsFromDetections({
      io: resolved.io,
      pendingByJson,
      sourcePrefix: resolved.sourcePrefix,
    })
    const changed = await upsertPatchMeasurements(resolved.io, updates.map((u) => u.row))
    const kinds: Kinds = {
      blur: updates.some((u) => u.change.blur),
      pixelMass: updates.some((u) => u.change.pixelMass),
    }
    // The records changed on disk, so reopening re-reads them (the session-cache
    // fingerprint covers 02_records/).
    if (changed) await openDatasetByFolderName({ folderName: resolved.folderName, showSuccessToast: false })
    const done = `${updating ? 'Updated' : 'Added'} ${describeKinds(kinds)} for ${changed.toLocaleString()} patches`
    toast.success(changed ? done : 'No new measurements found', {
      id: MEASUREMENTS_TOAST_ID,
      description: changed ? whereToFind(kinds) : undefined,
      duration: 6000,
      action: undefined,
    })
  } catch (err) {
    console.warn('🚨 checkForMeasurements: import failed', err)
    toast.error('Could not add measurements', {
      id: MEASUREMENTS_TOAST_ID,
      description: err instanceof Error ? err.message : 'Unknown error.',
      duration: Infinity,
      action: undefined,
    })
  } finally {
    importing = false
  }
}
