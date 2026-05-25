import type { NightEntity } from '~/stores/entities/4.nights'
import type { DetectionEntity } from '~/stores/entities/detections'
import { buildNightSummary, type NightSummaryEntity } from '~/stores/entities/night-summaries'

export type ProgressCounts = { total: number; identified: number }

export type ProgressIndex = {
  byProject: Record<string, ProgressCounts>
  bySite: Record<string, ProgressCounts>
  byDeployment: Record<string, ProgressCounts>
  byNight: Record<string, ProgressCounts>
}

export function buildProgressIndex(params: {
  nights: Record<string, NightEntity>
  nightSummaries: Record<string, NightSummaryEntity>
  detections: Record<string, DetectionEntity>
}): ProgressIndex {
  const { nights, nightSummaries, detections } = params
  const byNight = buildProgressByNight({ nightSummaries, detections })
  const { byDeployment, bySite, byProject } = rollupProgressFromNights({ byNight, nights })

  return { byNight, byDeployment, bySite, byProject }
}

function buildProgressByNight(params: {
  nightSummaries: Record<string, NightSummaryEntity>
  detections: Record<string, DetectionEntity>
}) {
  const { nightSummaries, detections } = params
  const byNight: Record<string, ProgressCounts> = {}
  const detectionsByNight = groupDetectionsByNight({ detections })
  const nightIds = new Set<string>([
    ...Object.keys(nightSummaries ?? {}),
    ...Object.keys(detectionsByNight),
  ])

  for (const nightId of nightIds) {
    if (!nightId) continue

    const detectionsForNight = detectionsByNight[nightId] ?? []
    if (detectionsForNight.length > 0) {
      const summary = buildNightSummary({ nightId, detections: detectionsForNight })
      byNight[nightId] = {
        total: summary.totalDetections,
        identified: summary.totalIdentified,
      }
      continue
    }

    const summary = nightSummaries?.[nightId]
    byNight[nightId] = {
      total: summary?.totalDetections ?? 0,
      identified: summary?.totalIdentified ?? 0,
    }
  }

  return byNight
}

function rollupProgressFromNights(params: {
  byNight: Record<string, ProgressCounts>
  nights: Record<string, NightEntity>
}) {
  const { byNight, nights } = params
  const byDeployment: Record<string, ProgressCounts> = {}
  const bySite: Record<string, ProgressCounts> = {}
  const byProject: Record<string, ProgressCounts> = {}

  for (const night of Object.values(nights ?? {})) {
    if (!night?.id) continue

    const progress = byNight[night.id] ?? { total: 0, identified: 0 }
    if (night.deploymentId) addProgressCounts({ bucket: byDeployment, id: night.deploymentId, progress })
    if (night.siteId) addProgressCounts({ bucket: bySite, id: night.siteId, progress })
    if (night.projectId) addProgressCounts({ bucket: byProject, id: night.projectId, progress })
  }

  return { byDeployment, bySite, byProject }
}

function groupDetectionsByNight(params: { detections: Record<string, DetectionEntity> }) {
  const { detections } = params
  const byNight: Record<string, DetectionEntity[]> = {}

  for (const detection of Object.values(detections ?? {})) {
    const nightId = detection?.nightId
    if (!nightId) continue
    if (!byNight[nightId]) byNight[nightId] = []
    byNight[nightId].push(detection)
  }

  return byNight
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
