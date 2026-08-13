import type { DetectionEntity } from '~/models/detection.types'
import { detectionsStore, getDetectionsForLeafGroup } from '~/stores/entities/detections'
import { patchesStore } from '~/stores/entities/5.patches'
import { selectedPatchIdsStore } from '~/stores/ui'
import { RANK_HIERARCHY } from '~/models/taxonomy/types'
import { resolveCaptureTimestamp } from '~/models/detection-time'
import type { VizConfig, VizTaxaRank } from './viz-types'

const TAXON_ORDER: VizTaxaRank[] = ['order', 'family', 'genus', 'species']

export type VizDetectionSet = {
  /** Final ordered, filtered, limited detections to draw. */
  detections: DetectionEntity[]
  /** Non-error detections in scope before representative/limit. */
  totalInScope: number
  scopeLabel: string
  /** Candidate count after filters but before the display limit. */
  countAll: number
  /** Σ size (pixel-mass proxy) over the full pre-limit set and the shown set —
   * used to estimate how much bigger the full export would be than the preview. */
  sizeAll: number
  sizeShown: number
}

/** Mothbox unclustered/noise: clusterId missing or negative. */
export function isNoise(det: DetectionEntity): boolean {
  return det.clusterId == null || det.clusterId < 0
}

/** Size proxy: true silhouette pixel-mass when available, else detection bbox area. */
function detSize(det: DetectionEntity): number {
  if (det.pixelMassPixels != null) return det.pixelMassPixels
  const pts = det.points
  if (pts && pts.length) {
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity
    for (const p of pts) {
      const x = p[0]!, y = p[1]!
      if (x < minx) minx = x; if (x > maxx) maxx = x
      if (y < miny) miny = y; if (y > maxy) maxy = y
    }
    return Math.max(0, (maxx - minx) * (maxy - miny))
  }
  return 0
}

function resolveScopeDetections(config: VizConfig): DetectionEntity[] {
  if (config.scope === 'selection') {
    const sel = selectedPatchIdsStore.get()
    if (sel && sel.size > 0) {
      return Object.values(detectionsStore.get() ?? {}).filter((d) => sel.has(d.patchId))
    }
    // Nothing selected → fall through to the night scope.
  }
  const out: DetectionEntity[] = []
  for (const id of config.selectedLeafGroupIds) out.push(...getDetectionsForLeafGroup(id))
  return out
}

export function buildVizDetections(config: VizConfig): VizDetectionSet {
  let dets = resolveScopeDetections(config)
  if (!config.includeErrors) dets = dets.filter((d) => !d.isError)
  const totalInScope = dets.length

  if (config.taxaFilter.length > 0) {
    const filter = new Set(config.taxaFilter)
    dets = dets.filter((d) => filter.has(getGroupKey(d, 'taxa', config.taxaRank)))
  }
  if (config.excludeNoise) dets = dets.filter((d) => !isNoise(d))
  if (config.onePerCluster) dets = pickRepresentatives(dets)

  // Full candidate set (after filters, before the display limit).
  const countAll = dets.length
  let sizeAll = 0
  for (const d of dets) sizeAll += detSize(d)

  // Cap to the most prominent items *independent of the display sort*. Applying
  // the limit after a taxon/cluster sort would keep only the alphabetically- or
  // id-first groups and silently drop the rest (e.g. the large green geometrids);
  // selecting the largest N first keeps the same visible set for every sort, and
  // the display sort then only arranges them.
  if (config.limit > 0 && dets.length > config.limit) {
    dets = [...dets].sort((a, b) => detSize(b) - detSize(a)).slice(0, config.limit)
  }
  dets = sortDetections(dets, config)

  let sizeShown = 0
  for (const d of dets) sizeShown += detSize(d)

  return {
    detections: dets, totalInScope, scopeLabel: scopeLabelFor(config, totalInScope),
    countAll, sizeAll, sizeShown,
  }
}

/** One detection per integer cluster (highest score); noise kept as singletons. */
function pickRepresentatives(dets: DetectionEntity[]): DetectionEntity[] {
  const best = new Map<number, DetectionEntity>()
  const singles: DetectionEntity[] = []
  for (const d of dets) {
    if (isNoise(d)) { singles.push(d); continue }
    const c = Math.trunc(d.clusterId!)
    const cur = best.get(c)
    if (!cur || (d.score ?? 0) > (cur.score ?? 0)) best.set(c, d)
  }
  return [...best.values(), ...singles]
}

function sortDetections(dets: DetectionEntity[], config: VizConfig): DetectionEntity[] {
  const arr = [...dets]
  if (config.sortMode === 'size') {
    arr.sort((a, b) => detSize(b) - detSize(a))
  } else if (config.sortMode === 'time') {
    // Chronological, earliest first, so a radial reads clockwise through the
    // night and a bar reads left-to-right. Undated items sort last rather than
    // landing at the epoch and skewing the whole layout.
    const times = buildTimestampLookup(arr)
    arr.sort((a, b) => {
      const at = times.get(a.id) ?? Number.POSITIVE_INFINITY
      const bt = times.get(b.id) ?? Number.POSITIVE_INFINITY
      if (at !== bt) return at - bt
      return (a.id ?? '').localeCompare(b.id ?? '')
    })
  } else if (config.sortMode === 'cluster') {
    arr.sort((a, b) => clusterSortKey(a) - clusterSortKey(b))
  } else if (config.sortMode === 'taxon') {
    const upto = TAXON_ORDER.indexOf(config.taxaRank) + 1
    arr.sort((a, b) => taxonSortKey(a, upto).localeCompare(taxonSortKey(b, upto)))
  }
  return arr
}

/** Resolves each detection's capture time once, so the comparator stays cheap. */
function buildTimestampLookup(dets: DetectionEntity[]): Map<string, number> {
  const patches = patchesStore.get() ?? {}
  const times = new Map<string, number>()
  for (const det of dets) {
    const patch = det.patchId ? patches[det.patchId] : undefined
    const time = resolveCaptureTimestamp({
      capturedAt: patch?.capturedAt,
      photoId: det.photoId,
      patchId: det.patchId,
      fileName: patch?.imageFile?.name,
    })
    if (time != null && det.id) times.set(det.id, time)
  }
  return times
}

function clusterSortKey(det: DetectionEntity): number {
  return isNoise(det) ? Number.MAX_SAFE_INTEGER : Math.trunc(det.clusterId!)
}

function taxonSortKey(det: DetectionEntity, upto: number): string {
  const t = det.taxon
  const parts: string[] = []
  for (let i = 0; i < upto; i++) {
    const v = t ? (t[TAXON_ORDER[i]! as keyof typeof t] as string | undefined) : undefined
    parts.push(v || '￿') // missing ranks sort last
  }
  return parts.join('/')
}

function getGroupKey(det: DetectionEntity, groupBy: 'cluster' | 'taxa', taxaRank: VizTaxaRank): string {
  if (groupBy === 'cluster') return det.clusterId != null ? String(det.clusterId) : 'Unclustered'

  const taxon = det.taxon
  if (!taxon) return 'Unknown'
  const requested = taxon[taxaRank as keyof typeof taxon] as string | undefined
  if (requested) return requested

  // Fall back to the deepest available rank (sparse AMI taxonomy).
  for (const rank of [...RANK_HIERARCHY].reverse()) {
    if (rank === 'kingdom' || rank === 'phylum' || rank === 'class') continue
    const value = taxon[rank as keyof typeof taxon] as string | undefined
    if (value) return value
  }
  return 'Unknown'
}

function scopeLabelFor(config: VizConfig, count: number): string {
  if (config.scope === 'selection') {
    const sel = selectedPatchIdsStore.get()
    if (sel && sel.size > 0) return `selection (${sel.size})`
  }
  if (config.scope === 'dataset') return `dataset · ${count} detections`
  const n = config.selectedLeafGroupIds.length
  return n === 1 ? (config.selectedLeafGroupIds[0]!.split('/').pop() ?? 'night') : `${n} nights`
}

/** Unique taxa keys at a rank, over the config's current scope — for the filter UI. */
export function getAvailableTaxaKeysForConfig(config: VizConfig): string[] {
  const keys = new Set<string>()
  for (const det of resolveScopeDetections(config)) {
    if (!config.includeErrors && det.isError) continue
    const key = getGroupKey(det, 'taxa', config.taxaRank)
    if (key && key !== 'Unknown') keys.add(key)
  }
  return Array.from(keys).sort()
}
