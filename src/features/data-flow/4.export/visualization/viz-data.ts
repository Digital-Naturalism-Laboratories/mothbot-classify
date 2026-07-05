import type { DetectionEntity } from '~/models/detection.types'
import { getDetectionsForLeafGroup } from '~/stores/entities/detections'
import { RANK_HIERARCHY } from '~/models/taxonomy/types'
import { pickRepresentative } from './cluster-representative'
import type { VizConfig, VizTaxaRank } from './viz-types'

export type VizGroup = {
  key: string
  label: string
  count: number
  detections: DetectionEntity[]
  representative: DetectionEntity
}

export type VizData = {
  groups: VizGroup[]
  totalDetections: number
  leafGroupIds: string[]
}

export function buildVizData(config: VizConfig): VizData {
  const { selectedLeafGroupIds, groupBy, taxaRank, taxaFilter, representativeMode } = config

  const allDetections: DetectionEntity[] = []
  for (const id of selectedLeafGroupIds) {
    allDetections.push(...getDetectionsForLeafGroup(id))
  }

  // Only include non-error detections that have a patch image
  const detections = allDetections.filter((d) => !d.isError)

  const grouped = new Map<string, DetectionEntity[]>()

  for (const det of detections) {
    const key = getGroupKey(det, groupBy, taxaRank)
    if (!key) continue
    if (taxaFilter.length > 0 && !taxaFilter.includes(key)) continue
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(det)
  }

  const groups: VizGroup[] = []
  for (const [key, dets] of grouped) {
    const representative = pickRepresentative(dets, representativeMode)
    if (!representative) continue
    groups.push({
      key,
      label: formatGroupLabel(key, groupBy),
      count: dets.length,
      detections: dets,
      representative,
    })
  }

  groups.sort((a, b) => b.count - a.count)

  return {
    groups,
    totalDetections: detections.length,
    leafGroupIds: selectedLeafGroupIds,
  }
}

function getGroupKey(det: DetectionEntity, groupBy: VizConfig['groupBy'], taxaRank: VizTaxaRank): string {
  if (groupBy === 'cluster') {
    return det.clusterId != null ? String(det.clusterId) : 'Unclustered'
  }

  // Taxa grouping: try the requested rank, fall back to deepest available rank
  const taxon = det.taxon
  if (!taxon) return 'Unknown'

  const requestedValue = taxon[taxaRank as keyof typeof taxon] as string | undefined
  if (requestedValue) return requestedValue

  // Fall back to deepest available rank (for sparse AMI taxonomy)
  const ranks = [...RANK_HIERARCHY].reverse()
  for (const rank of ranks) {
    if (rank === 'kingdom' || rank === 'phylum' || rank === 'class') continue
    const value = taxon[rank as keyof typeof taxon] as string | undefined
    if (value) return value
  }

  return 'Unknown'
}

function formatGroupLabel(key: string, groupBy: VizConfig['groupBy']): string {
  if (groupBy === 'cluster') return key === 'Unclustered' ? key : `Cluster ${key}`
  return key
}

/**
 * Returns the sorted list of unique group keys for a given rank,
 * used to populate the taxa filter checklist in the dialog.
 */
export function getAvailableTaxaKeys(leafGroupIds: string[], taxaRank: VizTaxaRank): string[] {
  const keys = new Set<string>()
  for (const id of leafGroupIds) {
    for (const det of getDetectionsForLeafGroup(id)) {
      if (det.isError) continue
      const key = getGroupKey(det, 'taxa', taxaRank)
      if (key && key !== 'Unknown') keys.add(key)
    }
  }
  return Array.from(keys).sort()
}
