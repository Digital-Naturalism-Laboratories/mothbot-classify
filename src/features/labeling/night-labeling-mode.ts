import type { DetectionEntity } from '~/stores/entities/detections'

export const UNASSIGNED_AGGREGATE_LABEL = 'All unassigned'
export const UNAPPROVED_AGGREGATE_LABEL = 'All unapproved'

export function nightHasMachineIdentification(params: {
  photos: Record<string, { leafGroupId?: string; botDetectionFile?: unknown }>
  detections: Record<string, DetectionEntity>
  leafGroupId: string
}): boolean {
  const { photos, detections, leafGroupId } = params

  for (const photo of Object.values(photos ?? {})) {
    if (photo?.leafGroupId !== leafGroupId) continue
    if (photo?.botDetectionFile) return true
  }

  for (const detection of Object.values(detections ?? {})) {
    if (detection?.leafGroupId !== leafGroupId) continue
    if (detection?.detectedBy === 'user') continue
    if (autoDetectionHasMachineTaxonomy(detection)) return true
  }

  return false
}

export function countUnassignedDetectionsForNight(params: {
  detections: Record<string, DetectionEntity>
  leafGroupId: string
}): number {
  const { detections, leafGroupId } = params
  let count = 0

  for (const detection of Object.values(detections ?? {})) {
    if (detection?.leafGroupId !== leafGroupId) continue
    if (detection?.detectedBy === 'user') continue
    count++
  }

  return count
}

function autoDetectionHasMachineTaxonomy(detection: DetectionEntity): boolean {
  const taxon = detection?.taxon
  if (taxon?.class || taxon?.order || taxon?.family || taxon?.genus || taxon?.species) return true
  if (typeof detection?.morphospecies === 'string' && detection.morphospecies.trim()) return true
  if (typeof detection?.label === 'string' && detection.label.trim()) return true
  return false
}
