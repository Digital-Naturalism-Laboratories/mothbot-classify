import type { DetectionEntity } from '~/models/detection.types'
import { buildNightSummary, nightSummariesStore } from '~/stores/entities/night-summaries'

export function rebuildNightSummariesFromDetections(detections: Record<string, DetectionEntity>) {
  const byNight: Record<string, DetectionEntity[]> = {}

  for (const detection of Object.values(detections ?? {})) {
    const nightId = detection?.nightId
    if (!nightId) continue
    if (!byNight[nightId]) byNight[nightId] = []
    byNight[nightId].push(detection)
  }

  const summaries: Record<string, ReturnType<typeof buildNightSummary>> = {}
  for (const [nightId, nightDetections] of Object.entries(byNight)) {
    summaries[nightId] = buildNightSummary({ nightId, detections: nightDetections })
  }

  nightSummariesStore.set(summaries)
  return summaries
}
