/**
 * Import measurements that Mothbot Process recorded after this dataset's records
 * were built: blurriness (e.g. Process re-ran Cluster/ID on an older dataset, which
 * scores every patch, or re-scored with a newer method) and pixel mass (the Pixel
 * Mass tab, which is often run later). Reads the detection JSONs and writes the
 * derived-only `patch-measurements.ndjson`; no other package file is touched.
 */
import type { DinalabAdapterIO } from './adapters/dinalab-mothbox-v1/adapter-io'
import { parseNdjson } from './incremental-nights'
import {
  PATCH_MEASUREMENTS_RECORD,
  measurementChange,
  measurementFromShape,
  mergeMeasurement,
  parsePatchMeasurements,
  sameMeasurement,
  type MeasurementChange,
  type PatchMeasurementRecord,
} from './patch-measurements'

const PATCHES_RECORD = '02_records/patches.ndjson'
const PATCH_SOURCES_RECORD = '02_records/patch-sources.ndjson'
const BOT_DETECTION_SUFFIX = '_botdetection.json'

export type PendingMeasurement = {
  patchId: string
  patchFileName: string
  detectorId?: string
  /** The measurements the package already has for this patch, if any. */
  current?: PatchMeasurementRecord
}

/** A row to write: the package's row with what Process added or changed, and what that was. */
export type MeasurementUpdate = {
  row: PatchMeasurementRecord
  change: MeasurementChange
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
 * Every patch that has a source detection JSON, grouped by that (package-relative)
 * JSON, with the measurements the package already has for it: Process may have
 * added blurriness or pixel mass, or re-measured either, since the records were built.
 */
export async function findPatchesToMeasure(io: DinalabAdapterIO): Promise<Map<string, PendingMeasurement[]>> {
  const have = parsePatchMeasurements(await readPackageSafe(io, PATCH_MEASUREMENTS_RECORD))

  const detectorById = new Map<string, string>()
  for (const row of parseNdjson<{ patch_id?: string; detector_id?: string }>(await readPackageSafe(io, PATCHES_RECORD))) {
    if (row?.patch_id && row.detector_id) detectorById.set(row.patch_id, row.detector_id)
  }

  const byJson = new Map<string, PendingMeasurement[]>()
  type SourceRow = { patch_id?: string; original_bot_detection_path?: string; original_patch_path?: string }
  for (const row of parseNdjson<SourceRow>(await readPackageSafe(io, PATCH_SOURCES_RECORD))) {
    if (!row?.patch_id || !row.original_bot_detection_path || !row.original_patch_path) continue
    const current = have[row.patch_id]
    const pending = byJson.get(row.original_bot_detection_path) ?? []
    pending.push({
      patchId: row.patch_id,
      patchFileName: baseName(row.original_patch_path),
      detectorId: detectorById.get(row.patch_id),
      ...(current ? { current } : {}),
    })
    byJson.set(row.original_bot_detection_path, pending)
  }
  return byJson
}

/** Evenly spaced picks from a list (all of it when short enough). */
function spread<T>(items: T[], count: number): T[] {
  if (items.length <= count) return items
  return Array.from({ length: count }, (_, i) => items[Math.floor((i * items.length) / count)])
}

/**
 * Up to `count` detection files: the middle file of each night folder first (Process
 * may have measured only some nights, e.g. Pixel Mass on one night), then spread over the rest.
 */
function sampleAcrossFolders<T>(entries: Array<[string, T]>, count: number): Array<[string, T]> {
  if (entries.length <= count) return entries
  const byFolder = new Map<string, Array<[string, T]>>()
  for (const entry of entries) {
    const path = entry[0].replaceAll('\\', '/')
    const folder = path.slice(0, path.lastIndexOf('/') + 1)
    const files = byFolder.get(folder) ?? []
    files.push(entry)
    byFolder.set(folder, files)
  }
  const picked = spread([...byFolder.values()], count).map((files) => files[Math.floor(files.length / 2)])
  const chosen = new Set(picked.map(([path]) => path))
  return [...picked, ...spread(entries.filter(([path]) => !chosen.has(path)), count - picked.length)]
}

/**
 * Measurements Process recorded for the pending patches that the package doesn't
 * have yet or has with different values (see `measurementChange`). With
 * `sampleFiles`, reads only that many detection JSONs — a cheap "anything new?" probe.
 */
export async function readMeasurementsFromDetections(params: {
  io: DinalabAdapterIO
  pendingByJson: Map<string, PendingMeasurement[]>
  sourcePrefix: string
  sampleFiles?: number
}): Promise<MeasurementUpdate[]> {
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
      // unreadable or missing JSON — its patches just stay unmeasured
    }
    shapesCache.set(packagePath, byFile)
    return byFile
  }

  let entries = [...pendingByJson.entries()]
  if (sampleFiles !== undefined) entries = sampleAcrossFolders(entries, sampleFiles)

  const updates: MeasurementUpdate[] = []
  for (const [jsonPath, pending] of entries) {
    const current = await shapesByPatchFile(jsonPath)
    for (const item of pending) {
      let shape = current?.get(item.patchFileName)
      if (!shape && item.detectorId) {
        const archived = archivedDetectionPath(jsonPath, item.detectorId)
        if (archived) shape = (await shapesByPatchFile(archived))?.get(item.patchFileName)
      }
      const fresh = shape ? measurementFromShape({ patchId: item.patchId, shape }) : null
      if (!fresh) continue
      const change = measurementChange(item.current, fresh)
      if (!change.blur && !change.pixelMass) continue
      updates.push({ row: mergeMeasurement({ current: item.current, fresh, change }), change })
    }
  }
  return updates
}

/**
 * Add new measurement rows and replace ones whose values changed. The file holds
 * only derived values, so rewriting it is safe. Returns how many rows changed.
 */
export async function upsertPatchMeasurements(io: DinalabAdapterIO, rows: PatchMeasurementRecord[]): Promise<number> {
  if (!rows.length) return 0
  const byPatch = parsePatchMeasurements(await readPackageSafe(io, PATCH_MEASUREMENTS_RECORD))
  let changed = 0
  for (const row of rows) {
    const old = byPatch[row.patch_id]
    if (old && sameMeasurement(old, row)) continue
    byPatch[row.patch_id] = row
    changed += 1
  }
  if (changed) {
    const text = Object.values(byPatch).map((row) => JSON.stringify(row)).join('\n')
    await io.package.writeText(PATCH_MEASUREMENTS_RECORD, `${text}\n`)
  }
  return changed
}
