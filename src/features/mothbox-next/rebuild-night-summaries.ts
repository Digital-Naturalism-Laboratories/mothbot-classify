import type { DetectionEntity } from '~/models/detection.types'
import { buildLeafGroupSummary, leafGroupSummariesStore } from '~/stores/entities/night-summaries'

export function rebuildLeafGroupSummariesFromDetections(detections: Record<string, DetectionEntity>) {
  const byLeafGroup: Record<string, DetectionEntity[]> = {}

  for (const detection of Object.values(detections ?? {})) {
    const leafGroupId = detection?.leafGroupId
    if (!leafGroupId) continue
    if (!byLeafGroup[leafGroupId]) byLeafGroup[leafGroupId] = []
    byLeafGroup[leafGroupId].push(detection)
  }

  const summaries: Record<string, ReturnType<typeof buildLeafGroupSummary>> = {}
  for (const [leafGroupId, nightDetections] of Object.entries(byLeafGroup)) {
    summaries[leafGroupId] = buildLeafGroupSummary({ leafGroupId, detections: nightDetections })
  }

  leafGroupSummariesStore.set(summaries)
  return summaries
}
