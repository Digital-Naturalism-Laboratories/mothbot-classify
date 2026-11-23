import type { DetectionEntity } from '~/models/detection.types'
import type { ClassificationRecord, CurrentClassificationRecord } from './records'
import { withKnownOrderLineage } from '~/models/taxonomy/known-lineage'
import { normalizeNonTargetLabel } from '~/models/non-target'
import { identificationIdOf } from './identifications'

export function detectionFromClassification(params: {
  row: ClassificationRecord | CurrentClassificationRecord
  leafGroupId: string
  photoId: string
}): DetectionEntity {
  const { row, leafGroupId, photoId } = params
  const patchId = row.patch_id
  const isError = row.classification_type === 'error' || row.is_error === true
  const determinedFrom = (row as CurrentClassificationRecord).determined_from

  return {
    id: patchId,
    patchId,
    photoId,
    leafGroupId,
    label: isError ? normalizeNonTargetLabel(row.label) : row.label ?? row.taxon?.scientificName ?? undefined,
    // Repairs IDs saved before class followed the order (e.g. Araneae under Insecta).
    taxon: isError || !row.taxon ? undefined : withKnownOrderLineage(row.taxon),
    detectedBy: row.classifier_type === 'bot' ? 'auto' : 'user',
    identifiedAt: typeof row.classified_at === 'number' ? row.classified_at : undefined,
    isError: isError ? true : undefined,
    morphospecies: row.morphospecies ?? undefined,
    score: typeof row.confidence === 'number' ? row.confidence : undefined,
    // A withdrawal is never a determination; it has no claim to show.
    classificationType: row.classification_type === 'withdrawn' ? undefined : row.classification_type,
    botClassifierId: row.classifier_type === 'bot' ? row.classifier_id : undefined,
    humanClassifierId: row.classifier_type === 'human' ? row.classifier_id : undefined,
    identificationId: determinedFrom || identificationIdOf(row),
    ...(row.agreed_with ? { agreedWith: row.agreed_with } : {}),
    ...(row.occurrence_id ? { occurrenceId: row.occurrence_id } : {}),
    ...(row.species_list ? { speciesListDOI: row.species_list } : {}),
    ...(row.species_list_exclusions ? { speciesListExclusions: row.species_list_exclusions } : {}),
    ...(typeof row.pixel_mass_pixels === 'number' ? { pixelMassPixels: row.pixel_mass_pixels } : {}),
    ...(row.pixel_mass_mm2 != null ? { pixelMassMm2: row.pixel_mass_mm2 } : {}),
    ...(typeof row.pixel_mass_timestamp === 'string' ? { pixelMassTimestamp: row.pixel_mass_timestamp } : {}),
    ...(typeof row.pixel_mass_method === 'string' ? { pixelMassMethod: row.pixel_mass_method } : {}),
    ...(typeof row.machine_identified_at === 'string' ? { machineIdentifiedAt: row.machine_identified_at } : {}),
  }
}

/** The identification a detection's current state represents, as a row for `classifierId`. */
export function classificationFromDetection(params: {
  detection: DetectionEntity
  classifierId: string
  classifierType: 'bot' | 'human'
  /** The person's name as they typed it (full name or initials); human rows only. */
  identifierName?: string
}): ClassificationRecord {
  const { detection, classifierType, classifierId, identifierName } = params
  const classifiedAt = detection.identifiedAt ?? Date.now()
  const base = {
    patch_id: detection.patchId,
    occurrence_id: detection.occurrenceId || detection.patchId,
    classifier_id: classifierId,
    classifier_type: classifierType,
    ...(classifierType === 'human' && identifierName?.trim() ? { identifier_name: identifierName.trim() } : {}),
    classified_at: classifiedAt,
    ...(detection.agreedWith ? { agreed_with: detection.agreedWith } : {}),
  }

  if (detection.classificationType === 'error' || detection.isError) {
    return {
      ...base,
      classification_type: 'error',
      label: normalizeNonTargetLabel(detection.label),
      taxon: null,
      morphospecies: null,
      is_error: true,
    }
  }

  if (detection.classificationType === 'morphospecies' || detection.morphospecies) {
    return {
      ...base,
      classification_type: 'morphospecies',
      label: detection.morphospecies ?? detection.label ?? null,
      taxon: detection.taxon ?? null,
      morphospecies: detection.morphospecies ?? null,
      is_error: false,
      ...speciesListFields(detection),
    }
  }

  if (detection.classificationType === 'accept') {
    return {
      ...base,
      classification_type: 'accept',
      label: detection.label ?? detection.taxon?.scientificName ?? null,
      taxon: detection.taxon ?? null,
      morphospecies: null,
      is_error: false,
      ...speciesListFields(detection),
    }
  }

  return {
    ...base,
    classification_type: 'taxon',
    label: detection.label ?? detection.taxon?.scientificName ?? null,
    taxon: detection.taxon ?? null,
    morphospecies: null,
    is_error: false,
    ...speciesListFields(detection),
  }
}

/** A row taking back `withdrawn`'s classifier's identifications of its occurrence. */
export function withdrawalRow(params: {
  withdrawn: ClassificationRecord
  classifiedAt?: number
  identifierName?: string
}): ClassificationRecord {
  const { withdrawn, identifierName } = params
  return {
    patch_id: withdrawn.patch_id,
    occurrence_id: withdrawn.occurrence_id || withdrawn.patch_id,
    classifier_id: withdrawn.classifier_id,
    classifier_type: withdrawn.classifier_type,
    ...(identifierName?.trim() ? { identifier_name: identifierName.trim() } : {}),
    classification_type: 'withdrawn',
    label: null,
    taxon: null,
    morphospecies: null,
    is_error: false,
    classified_at: params.classifiedAt ?? Date.now(),
    withdraws: identificationIdOf(withdrawn),
  }
}

/** The species list (and any exclusions) the detection's current ID was made with. */
function speciesListFields(detection: DetectionEntity): Pick<ClassificationRecord, 'species_list' | 'species_list_exclusions'> {
  return {
    species_list: detection.speciesListDOI || null,
    species_list_exclusions: detection.speciesListExclusions || null,
  }
}
