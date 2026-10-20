import type { DetectionEntity } from '~/models/detection.types'
import type { ClassificationRecord } from './records'
import { withKnownOrderLineage } from '~/models/taxonomy/known-lineage'

/** Keep an error sub-category label ("ERROR_Frass") intact; otherwise "ERROR". */
function preserveErrorLabel(label?: string | null): string {
  const l = (label ?? '').trim()
  return /^ERROR[_:]/i.test(l) ? l : 'ERROR'
}

export function detectionFromClassification(params: {
  row: ClassificationRecord
  leafGroupId: string
  photoId: string
}): DetectionEntity {
  const { row, leafGroupId, photoId } = params
  const patchId = row.patch_id
  const isError = row.classification_type === 'error' || row.is_error === true

  return {
    id: patchId,
    patchId,
    photoId,
    leafGroupId,
    label: isError ? preserveErrorLabel(row.label) : row.label ?? row.taxon?.scientificName ?? undefined,
    // Repairs IDs saved before class followed the order (e.g. Araneae under Insecta).
    taxon: isError || !row.taxon ? undefined : withKnownOrderLineage(row.taxon),
    detectedBy: row.classifier_type === 'bot' ? 'auto' : 'user',
    identifiedAt: typeof row.classified_at === 'number' ? row.classified_at : undefined,
    isError: isError ? true : undefined,
    morphospecies: row.morphospecies ?? undefined,
    score: typeof row.confidence === 'number' ? row.confidence : undefined,
    classificationType: row.classification_type,
    botClassifierId: row.classifier_type === 'bot' ? row.classifier_id : undefined,
    humanClassifierId: row.classifier_type === 'human' ? row.classifier_id : undefined,
    ...(row.species_list ? { speciesListDOI: row.species_list } : {}),
    ...(row.species_list_exclusions ? { speciesListExclusions: row.species_list_exclusions } : {}),
    ...(typeof row.pixel_mass_pixels === 'number' ? { pixelMassPixels: row.pixel_mass_pixels } : {}),
    ...(row.pixel_mass_mm2 != null ? { pixelMassMm2: row.pixel_mass_mm2 } : {}),
    ...(typeof row.pixel_mass_timestamp === 'string' ? { pixelMassTimestamp: row.pixel_mass_timestamp } : {}),
    ...(typeof row.pixel_mass_method === 'string' ? { pixelMassMethod: row.pixel_mass_method } : {}),
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
      label: preserveErrorLabel(detection.label),
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
      ...speciesListFields(detection),
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
      ...speciesListFields(detection),
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
    ...speciesListFields(detection),
  }
}

/** The species list (and any exclusions) the detection's current ID was made with. */
function speciesListFields(detection: DetectionEntity): Pick<ClassificationRecord, 'species_list' | 'species_list_exclusions'> {
  return {
    species_list: detection.speciesListDOI || null,
    species_list_exclusions: detection.speciesListExclusions || null,
  }
}
