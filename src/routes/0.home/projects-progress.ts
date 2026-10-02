import type { LeafGroupEntity } from '~/stores/entities/leaf-groups'
import { resolveDatasetId } from '~/features/mothbox-next/dataset-scope'
import type { DetectionEntity } from '~/stores/entities/detections'
import { buildLeafGroupSummary, type LeafGroupSummaryEntity } from '~/stores/entities/night-summaries'
import { itemsOfOneRun, newestDetectorId } from '~/features/mothbox-next/detector-runs'

export type ProgressCounts = {
  total: number
  identified: number
  /** Detection runs present (model ids); only known when the night's detections are loaded. */
  detectorIds?: string[]
  /** Newest of detectorIds (version-aware, see detector-runs.ts). */
  newestDetector?: string
  /** When Mothbot Process last clustered these detections (ms), as recorded in the package. */
  clusteredAt?: number
  /** When someone last identified a detection here in Classify (ms). */
  lastIdentifiedAt?: number
}

/** Process timestamps look like `2026-07-05__21_02_22_(+0200)`; returns ms, or undefined. */
export function parseProcessTimestamp(value?: string): number | undefined {
  const m = /^(\d{4}-\d{2}-\d{2})__(\d{2})_(\d{2})_(\d{2})(?:_\(([+-]\d{2})(\d{2})\))?/.exec(value ?? '')
  if (!m) return undefined
  const ms = Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}${m[5] ? `${m[5]}:${m[6]}` : ''}`)
  return Number.isFinite(ms) ? ms : undefined
}

function maxDefined(a?: number, b?: number) {
  if (a === undefined) return b
  if (b === undefined) return a
  return Math.max(a, b)
}

/** Every run is listed; the dates come from *shown* (the newest run, which the counts use). */
function summarizeActivity(all: DetectionEntity[], shown: DetectionEntity[]): Omit<ProgressCounts, 'total' | 'identified'> {
  const detectorIds = new Set<string>()
  for (const d of all) if (d.detectorId) detectorIds.add(d.detectorId)
  let clusteredAt: number | undefined
  let lastIdentifiedAt: number | undefined
  for (const d of shown) {
    clusteredAt = maxDefined(clusteredAt, parseProcessTimestamp(d.clusteredAt))
    if (d.detectedBy === 'user' && typeof d.identifiedAt === 'number' && d.identifiedAt > 1) {
      lastIdentifiedAt = maxDefined(lastIdentifiedAt, d.identifiedAt)
    }
  }
  const ids = [...detectorIds]
  return {
    ...(ids.length ? { detectorIds: ids, newestDetector: newestDetectorId(ids) } : {}),
    ...(clusteredAt !== undefined ? { clusteredAt } : {}),
    ...(lastIdentifiedAt !== undefined ? { lastIdentifiedAt } : {}),
  }
}

export type ProgressIndex = {
  byProject: Record<string, ProgressCounts>
  bySite: Record<string, ProgressCounts>
  byDeployment: Record<string, ProgressCounts>
  byLeafGroup: Record<string, ProgressCounts>
}

export function buildProgressIndex(params: {
  nights: Record<string, LeafGroupEntity>
  nightSummaries: Record<string, LeafGroupSummaryEntity>
  detections: Record<string, DetectionEntity>
}): ProgressIndex {
  const { nights, nightSummaries, detections } = params
  const byLeafGroup = buildProgressByLeafGroup({ nightSummaries, detections })
  const { byDeployment, bySite, byProject } = rollupProgressFromLeafGroups({ byLeafGroup, nights })

  return { byLeafGroup, byDeployment, bySite, byProject }
}

function buildProgressByLeafGroup(params: {
  nightSummaries: Record<string, LeafGroupSummaryEntity>
  detections: Record<string, DetectionEntity>
}) {
  const { nightSummaries, detections } = params
  const byLeafGroup: Record<string, ProgressCounts> = {}
  const detectionsByLeafGroup = groupDetectionsByNight({ detections })
  const leafGroupIds = new Set<string>([
    ...Object.keys(nightSummaries ?? {}),
    ...Object.keys(detectionsByLeafGroup),
  ])

  for (const leafGroupId of leafGroupIds) {
    if (!leafGroupId) continue

    const detectionsForNight = detectionsByLeafGroup[leafGroupId] ?? []
    if (detectionsForNight.length > 0) {
      // Count the newest detection run only: re-running Detect keeps the older
      // run beside it, and counting both would double the night's insects.
      const newestRun = itemsOfOneRun(detectionsForNight)
      const summary = buildLeafGroupSummary({ leafGroupId, detections: newestRun })
      byLeafGroup[leafGroupId] = {
        total: summary.totalDetections,
        identified: summary.totalIdentified,
        ...summarizeActivity(detectionsForNight, newestRun),
      }
      continue
    }

    const summary = nightSummaries?.[leafGroupId]
    byLeafGroup[leafGroupId] = {
      total: summary?.totalDetections ?? 0,
      identified: summary?.totalIdentified ?? 0,
    }
  }

  return byLeafGroup
}

function rollupProgressFromLeafGroups(params: {
  byLeafGroup: Record<string, ProgressCounts>
  nights: Record<string, LeafGroupEntity>
}) {
  const { byLeafGroup, nights } = params
  const byDeployment: Record<string, ProgressCounts> = {}
  const bySite: Record<string, ProgressCounts> = {}
  const byProject: Record<string, ProgressCounts> = {}

  for (const night of Object.values(nights ?? {})) {
    if (!night?.id) continue

    const progress = byLeafGroup[night.id] ?? { total: 0, identified: 0 }
    if (night.deploymentId) addProgressCounts({ bucket: byDeployment, id: night.deploymentId, progress })
    if (night.siteId) addProgressCounts({ bucket: bySite, id: night.siteId, progress })
    const datasetId = resolveDatasetId(night)
    if (datasetId) addProgressCounts({ bucket: byProject, id: datasetId, progress })
  }

  return { byDeployment, bySite, byProject }
}

function groupDetectionsByNight(params: { detections: Record<string, DetectionEntity> }) {
  const { detections } = params
  const byLeafGroup: Record<string, DetectionEntity[]> = {}

  for (const detection of Object.values(detections ?? {})) {
    const leafGroupId = detection?.leafGroupId
    if (!leafGroupId) continue
    if (!byLeafGroup[leafGroupId]) byLeafGroup[leafGroupId] = []
    byLeafGroup[leafGroupId].push(detection)
  }

  return byLeafGroup
}

function addProgressCounts(params: {
  bucket: Record<string, ProgressCounts>
  id: string
  progress: ProgressCounts
}) {
  const { bucket, id, progress } = params
  bucket[id] = mergeProgressCounts(bucket[id] ?? { total: 0, identified: 0 }, progress)
}

/** Sum two progress entries: counts add, detector runs union, dates take the latest. */
export function mergeProgressCounts(a: ProgressCounts, b: ProgressCounts): ProgressCounts {
  const detectorIds = [...new Set([...(a.detectorIds ?? []), ...(b.detectorIds ?? [])])]
  return {
    total: a.total + b.total,
    identified: a.identified + b.identified,
    ...(detectorIds.length ? { detectorIds, newestDetector: newestDetectorId(detectorIds) } : {}),
    ...optional('clusteredAt', maxDefined(a.clusteredAt, b.clusteredAt)),
    ...optional('lastIdentifiedAt', maxDefined(a.lastIdentifiedAt, b.lastIdentifiedAt)),
  }
}

function optional<K extends string>(key: K, value: number | undefined) {
  return (value === undefined ? {} : { [key]: value }) as Partial<Record<K, number>>
}
