/**
 * Per-patch measurements computed by Mothbot Process: blurriness and pixel mass.
 *
 * Stored in their own derived-only file, `02_records/patch-measurements.ndjson`,
 * keyed by `patch_id` — deliberately NOT on classification rows. Measurements are
 * properties of the patch image, and keeping them out of
 * `current-classifications.ndjson` / `03_classifications/` means they can be added
 * or refreshed for an existing dataset by rewriting this one file, without ever
 * touching the files that hold human identifications. A missing or unreadable
 * file just means "no measurements".
 */
export const PATCH_MEASUREMENTS_RECORD = '02_records/patch-measurements.ndjson'

export type PatchMeasurementRecord = {
  patch_id: string
  /** 0 (sharpest) .. 100 (blurriest). */
  blur_score?: number
  /** Scoring method/version, so scores from different methods aren't mixed. */
  blur_method?: string
  /** Insect (foreground) pixels Process counted after removing the background. */
  pixel_mass_pixels?: number
  /** The same area in mm², from the night's calibration; null when it wasn't calibrated. */
  pixel_mass_mm2?: number | null
  /** How the insect was outlined: a rembg model name, or 'border-colour-mask/v1' (rough, no AI model). */
  pixel_mass_method?: string
}

const BLUR_FIELDS = ['blur_score', 'blur_method'] as const
const PIXEL_MASS_FIELDS = ['pixel_mass_pixels', 'pixel_mass_mm2', 'pixel_mass_method'] as const

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

/** Measurement row for a detection shape, or null if Process measured nothing on it. */
export function measurementFromShape(params: {
  patchId: string
  shape: Record<string, unknown>
}): PatchMeasurementRecord | null {
  const { patchId, shape } = params
  const row: PatchMeasurementRecord = { patch_id: patchId }
  if (finite(shape.blur_score)) {
    row.blur_score = shape.blur_score
    if (typeof shape.blur_method === 'string') row.blur_method = shape.blur_method
  }
  if (finite(shape.pixel_mass_pixels)) {
    row.pixel_mass_pixels = shape.pixel_mass_pixels
    row.pixel_mass_mm2 = finite(shape.pixel_mass_mm2) ? shape.pixel_mass_mm2 : null
    if (typeof shape.pixel_mass_method === 'string') row.pixel_mass_method = shape.pixel_mass_method
  }
  return row.blur_score === undefined && row.pixel_mass_pixels === undefined ? null : row
}

/** What a fresh row from Process would add to or change in the package's row for the same patch. */
export type MeasurementChange = {
  blur?: 'added' | 'updated'
  pixelMass?: 'added' | 'updated'
}

/**
 * Blur counts as updated only when its method changed (a score is fixed by its
 * method); pixel mass when its count, area or method changed.
 */
export function measurementChange(current: PatchMeasurementRecord | undefined, fresh: PatchMeasurementRecord): MeasurementChange {
  const change: MeasurementChange = {}
  if (fresh.blur_score !== undefined) {
    if (current?.blur_score === undefined) change.blur = 'added'
    else if ((current.blur_method ?? '') !== (fresh.blur_method ?? '')) change.blur = 'updated'
  }
  if (fresh.pixel_mass_pixels !== undefined) {
    if (current?.pixel_mass_pixels === undefined) change.pixelMass = 'added'
    else if (
      current.pixel_mass_pixels !== fresh.pixel_mass_pixels ||
      (current.pixel_mass_mm2 ?? null) !== (fresh.pixel_mass_mm2 ?? null) ||
      (current.pixel_mass_method ?? '') !== (fresh.pixel_mass_method ?? '')
    ) {
      change.pixelMass = 'updated'
    }
  }
  return change
}

/** The package's row with the changed measurements taken from the fresh one. */
export function mergeMeasurement(params: {
  current: PatchMeasurementRecord | undefined
  fresh: PatchMeasurementRecord
  change: MeasurementChange
}): PatchMeasurementRecord {
  const { current, fresh, change } = params
  const merged: Record<string, unknown> = { ...(current ?? {}), patch_id: fresh.patch_id }
  const take = (fields: readonly string[]) => {
    for (const field of fields) {
      const value = (fresh as Record<string, unknown>)[field]
      if (value === undefined) delete merged[field]
      else merged[field] = value
    }
  }
  if (change.blur) take(BLUR_FIELDS)
  if (change.pixelMass) take(PIXEL_MASS_FIELDS)
  return merged as PatchMeasurementRecord
}

/** Same values, ignoring key order. */
export function sameMeasurement(a: PatchMeasurementRecord, b: PatchMeasurementRecord): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const key of keys) {
    if ((a as Record<string, unknown>)[key] !== (b as Record<string, unknown>)[key]) return false
  }
  return true
}

/** Measurements keyed by patch id (a plain object, so it survives any serialization). */
export type PatchMeasurementsById = Record<string, PatchMeasurementRecord>

/** Parse the measurements file, keyed by patch id; tolerant of malformed lines. */
export function parsePatchMeasurements(text: string): PatchMeasurementsById {
  const byPatch: PatchMeasurementsById = {}
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const row = JSON.parse(trimmed) as PatchMeasurementRecord
      if (row && typeof row.patch_id === 'string' && row.patch_id) byPatch[row.patch_id] = row
    } catch {
      // skip malformed line
    }
  }
  return byPatch
}
