/**
 * Import blurriness scores that Mothbot Process recorded after this dataset's
 * records were built (e.g. Process re-ran Cluster/ID on an older dataset, which
 * scores every patch), or re-scored with a newer method. Reads the detection
 * JSONs and writes the derived-only `patch-measurements.ndjson`; no other
 * package file is touched.
 */
import type { DinalabAdapterIO } from './adapters/dinalab-mothbox-v1/adapter-io'
import { parseNdjson } from './incremental-nights'
import {
  PATCH_MEASUREMENTS_RECORD,
  measurementFromShape,
  parsePatchMeasurements,
  type PatchMeasurementRecord,
} from './patch-measurements'

const PATCHES_RECORD = '02_records/patches.ndjson'
const PATCH_SOURCES_RECORD = '02_records/patch-sources.ndjson'
const BOT_DETECTION_SUFFIX = '_botdetection.json'

export type PendingMeasurement = {
  patchId: string
  patchFileName: string
  detectorId?: string
  /** Method of the score the package already has ('' if unrecorded); absent when the patch has no score. */
  currentMethod?: string
}

function baseName(path: string): string {
  const normalized = path.replaceAll('\\', '/')
  return normalized.slice(normalized.lastIndexOf('/') + 1)
}

async function readPackageSafe(io: DinalabAdapterIO, path: string): Promise<string> {
  try {
    return await io.package.readText(path)
  } catch {
    return ''
  }
}

/** Source-relative path from a package-relative one (inverse of toPackageRelativeAssetPath). */
export function toSourceRelative(packageRelative: string, sourcePrefix: string): string {
  const prefix = sourcePrefix.trim().replace(/\/+$/, '')
  const rel = packageRelative.replaceAll('\\', '/').replace(/^\/+/, '')
  if (!prefix) return rel
  return rel.startsWith(`${prefix}/`) ? rel.slice(prefix.length + 1) : rel
}

/**
 * JSON holding an earlier detection run: re-running Detect with a new model
 * archives the previous run as `<photo>_botdetection_<model>.json` (Process's
 * `_model_archive_path`), while patch-sources still points at the current file.
 */
export function archivedDetectionPath(currentPath: string, detectorId: string): string | null {
  if (!detectorId || !currentPath.endsWith(BOT_DETECTION_SUFFIX)) return null
  const slug = detectorId.replace(/\.pt$/, '').replaceAll(' ', '_')
  return `${currentPath.slice(0, -BOT_DETECTION_SUFFIX.length)}_botdetection_${slug}.json`
}

/**
 * Patches to (re)measure, grouped by the (package-relative) detection JSON that produced
 * them: those without a blur score, plus — with `includeScored` — scored ones, so a
 * newer scoring method in Process can be picked up.
 */
export async function findPatchesToMeasure(
  io: DinalabAdapterIO,
  options: { includeScored?: boolean } = {},
): Promise<Map<string, PendingMeasurement[]>> {
  const have = parsePatchMeasurements(await readPackageSafe(io, PATCH_MEASUREMENTS_RECORD))

  const detectorById = new Map<string, string>()
  for (const row of parseNdjson<{ patch_id?: string; detector_id?: string }>(await readPackageSafe(io, PATCHES_RECORD))) {
    if (row?.patch_id && row.detector_id) detectorById.set(row.patch_id, row.detector_id)
  }

  const byJson = new Map<string, PendingMeasurement[]>()
  type SourceRow = { patch_id?: string; original_bot_detection_path?: string; original_patch_path?: string }
  for (const row of parseNdjson<SourceRow>(await readPackageSafe(io, PATCH_SOURCES_RECORD))) {
    if (!row?.patch_id || !row.original_bot_detection_path || !row.original_patch_path) continue
    const existing = have[row.patch_id]
    const scored = typeof existing?.blur_score === 'number'
    if (scored && !options.includeScored) continue
    const pending = byJson.get(row.original_bot_detection_path) ?? []
    pending.push({
      patchId: row.patch_id,
      patchFileName: baseName(row.original_patch_path),
      detectorId: detectorById.get(row.patch_id),
      ...(scored ? { currentMethod: existing.blur_method ?? '' } : {}),
    })
    byJson.set(row.original_bot_detection_path, pending)
  }
  return byJson
}

/**
 * Blur scores Process recorded for the pending patches that are new or come from a
 * different method than the package has. With `sampleFiles`, reads only that many
 * evenly spread detection JSONs — a cheap "are scores available?" probe.
 */
export async function readMeasurementsFromDetections(params: {
  io: DinalabAdapterIO
  pendingByJson: Map<string, PendingMeasurement[]>
  sourcePrefix: string
  sampleFiles?: number
}): Promise<PatchMeasurementRecord[]> {
  const { io, pendingByJson, sourcePrefix, sampleFiles } = params

  const shapesCache = new Map<string, Map<string, Record<string, unknown>> | null>()
  async function shapesByPatchFile(packagePath: string) {
    if (shapesCache.has(packagePath)) return shapesCache.get(packagePath)!
    let byFile: Map<string, Record<string, unknown>> | null = null
    try {
      const parsed = JSON.parse(await io.source.readText(toSourceRelative(packagePath, sourcePrefix))) as {
        shapes?: Array<Record<string, unknown>>
      }
      byFile = new Map()
      for (const shape of parsed?.shapes ?? []) {
        const file = typeof shape?.patch_path === 'string' ? baseName(shape.patch_path) : ''
        if (file) byFile.set(file, shape)
      }
    } catch {
      // unreadable or missing JSON — its patches just stay unscored
    }
    shapesCache.set(packagePath, byFile)
    return byFile
  }

  let entries = [...pendingByJson.entries()]
  if (sampleFiles !== undefined && entries.length > sampleFiles) {
    const step = entries.length / sampleFiles
    entries = Array.from({ length: sampleFiles }, (_, i) => entries[Math.floor(i * step)])
  }

  const rows: PatchMeasurementRecord[] = []
  for (const [jsonPath, pending] of entries) {
    const current = await shapesByPatchFile(jsonPath)
    for (const item of pending) {
      let shape = current?.get(item.patchFileName)
      if (!shape && item.detectorId) {
        const archived = archivedDetectionPath(jsonPath, item.detectorId)
        if (archived) shape = (await shapesByPatchFile(archived))?.get(item.patchFileName)
      }
      const measurement = shape ? measurementFromShape({ patchId: item.patchId, shape }) : null
      if (!measurement) continue
      if (item.currentMethod === undefined || (measurement.blur_method ?? '') !== item.currentMethod) rows.push(measurement)
    }
  }
  return rows
}

/**
 * Add new measurement rows and replace ones whose score or method changed. The file
 * holds only derived values, so rewriting it is safe. Returns how many rows changed.
 */
export async function upsertPatchMeasurements(io: DinalabAdapterIO, rows: PatchMeasurementRecord[]): Promise<number> {
  if (!rows.length) return 0
  const byPatch = parsePatchMeasurements(await readPackageSafe(io, PATCH_MEASUREMENTS_RECORD))
  let changed = 0
  for (const row of rows) {
    const old = byPatch[row.patch_id]
    if (old && old.blur_score === row.blur_score && old.blur_method === row.blur_method) continue
    byPatch[row.patch_id] = row
    changed += 1
  }
  if (changed) {
    const text = Object.values(byPatch).map((row) => JSON.stringify(row)).join('\n')
    await io.package.writeText(PATCH_MEASUREMENTS_RECORD, `${text}\n`)
  }
  return changed
}
