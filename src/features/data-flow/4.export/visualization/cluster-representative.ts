import type { DetectionEntity } from '~/models/detection.types'
import type { VizRepresentativeMode } from './viz-types'

export function pickRepresentative(
  detections: DetectionEntity[],
  mode: VizRepresentativeMode,
): DetectionEntity | undefined {
  if (detections.length === 0) return undefined
  if (mode === 'first') return detections[0]

  // 'most-common': pick the detection whose taxon label appears most often in the group
  const labelCounts = new Map<string, number>()
  for (const det of detections) {
    const label = det.label ?? det.taxon?.scientificName ?? ''
    if (!label) continue
    labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1)
  }

  let bestLabel = ''
  let bestCount = 0
  for (const [label, count] of labelCounts) {
    if (count > bestCount) {
      bestCount = count
      bestLabel = label
    }
  }

  const best = detections.find((d) => (d.label ?? d.taxon?.scientificName ?? '') === bestLabel)
  return best ?? detections[0]
}
