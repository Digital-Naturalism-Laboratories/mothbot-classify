/**
 * Per-patch measurements computed by Mothbot Process (currently blurriness).
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
}

/** Measurement row for a detection shape, or null if Process didn't score it. */
export function measurementFromShape(params: {
  patchId: string
  shape: Record<string, unknown>
}): PatchMeasurementRecord | null {
  const { patchId, shape } = params
  const blur = shape.blur_score
  if (typeof blur !== 'number' || !Number.isFinite(blur)) return null
  const method = typeof shape.blur_method === 'string' ? shape.blur_method : undefined
  return { patch_id: patchId, blur_score: blur, ...(method ? { blur_method: method } : {}) }
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
