import type { LeafGroupEntity } from '~/stores/entities/leaf-groups'
import { resolveDatasetId } from '~/features/mothbox-next/dataset-scope'
import type { DetectionEntity } from '~/stores/entities/detections'
import { buildLeafGroupSummary, type LeafGroupSummaryEntity } from '~/stores/entities/night-summaries'

export type ProgressCounts = { total: number; identified: number }

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
      const summary = buildLeafGroupSummary({ leafGroupId, detections: detectionsForNight })
      byLeafGroup[leafGroupId] = {
        total: summary.totalDetections,
        identified: summary.totalIdentified,
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
  const existing = bucket[id] ?? { total: 0, identified: 0 }
  bucket[id] = {
    total: existing.total + progress.total,
    identified: existing.identified + progress.identified,
  }
}
