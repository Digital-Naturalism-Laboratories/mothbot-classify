import type { DetectionEntity } from '~/models/detection.types'
import type { ClassificationRecord } from './records'

export function detectionFromClassification(params: {
  row: ClassificationRecord
  nightId: string
  photoId: string
}): DetectionEntity {
  const { row, nightId, photoId } = params
  const patchId = row.patch_id
  const isError = row.classification_type === 'error' || row.is_error === true

  return {
    id: patchId,
    patchId,
    photoId,
    nightId,
    label: isError ? 'ERROR' : row.label ?? row.taxon?.scientificName ?? undefined,
    taxon: isError ? undefined : row.taxon ?? undefined,
    detectedBy: row.classifier_type === 'bot' ? 'auto' : 'user',
    identifiedAt: typeof row.classified_at === 'number' ? row.classified_at : undefined,
    isError: isError ? true : undefined,
    morphospecies: row.morphospecies ?? undefined,
    score: typeof row.confidence === 'number' ? row.confidence : undefined,
    classificationType: row.classification_type,
  }
}

export function classificationFromDetection(params: {
  detection: DetectionEntity
  classifierId: string
  classifierType: 'bot' | 'human'
}): ClassificationRecord {
  const { detection, classifierType, classifierId } = params
  const classifiedAt = detection.identifiedAt ?? Date.now()

  if (detection.classificationType === 'error' || detection.isError) {
    return {
      patch_id: detection.patchId,
      classifier_id: classifierId,
      classifier_type: classifierType,
      classification_type: 'error',
      label: 'ERROR',
      taxon: null,
      morphospecies: null,
      is_error: true,
      classified_at: classifiedAt,
    }
  }

  if (detection.classificationType === 'morphospecies' || detection.morphospecies) {
    return {
      patch_id: detection.patchId,
      classifier_id: classifierId,
      classifier_type: classifierType,
      classification_type: 'morphospecies',
      label: detection.morphospecies ?? detection.label ?? null,
      taxon: detection.taxon ?? null,
      morphospecies: detection.morphospecies ?? null,
      is_error: false,
      classified_at: classifiedAt,
    }
  }

  if (detection.classificationType === 'accept') {
    return {
      patch_id: detection.patchId,
      classifier_id: classifierId,
      classifier_type: classifierType,
      classification_type: 'accept',
      label: detection.label ?? detection.taxon?.scientificName ?? null,
      taxon: detection.taxon ?? null,
      morphospecies: null,
      is_error: false,
      classified_at: classifiedAt,
    }
  }

  return {
    patch_id: detection.patchId,
    classifier_id: classifierId,
    classifier_type: classifierType,
    classification_type: 'taxon',
    label: detection.label ?? detection.taxon?.scientificName ?? null,
    taxon: detection.taxon ?? null,
    morphospecies: null,
    is_error: false,
    classified_at: classifiedAt,
  }
}
