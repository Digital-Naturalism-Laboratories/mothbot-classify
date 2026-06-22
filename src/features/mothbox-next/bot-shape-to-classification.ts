import type { ClassificationRecord } from './records'
import type { LegacyDetectionShape } from './legacy-detection-file'
import { buildTaxonFromShape, extractTaxonomyFromShape } from '~/models/taxonomy/extract'
import { extractMorphospeciesFromShape } from '~/models/taxonomy/morphospecies'

export function classificationFromBotShape(params: {
  shape: LegacyDetectionShape
  patchId: string
  classifierId: string
}): ClassificationRecord {
  const { shape, patchId, classifierId } = params
  const taxonomy = extractTaxonomyFromShape({ shape })
  const taxon = buildTaxonFromShape({ shape, taxonomy, isError: false })
  const label = typeof shape.label === 'string' ? shape.label : null

  return {
    patch_id: patchId,
    classifier_id: classifierId,
    classifier_type: 'bot',
    classification_type: 'taxon',
    label,
    taxon,
    morphospecies: null,
    is_error: false,
    confidence: typeof shape.score === 'number' ? shape.score : null,
    classified_at: null,
    source_bot_detection_id:
      typeof shape.detection_id === 'string'
        ? shape.detection_id
        : `${patchId}::mothbot`,
    pixel_mass_pixels: typeof shape.pixel_mass_pixels === 'number' ? shape.pixel_mass_pixels : null,
    pixel_mass_mm2: typeof shape.pixel_mass_mm2 === 'number' ? shape.pixel_mass_mm2 : null,
    pixel_mass_timestamp: typeof shape.timestamp_pixel_mass === 'string' ? shape.timestamp_pixel_mass : null,
  }
}

export function classificationFromIdentifiedShape(params: {
  shape: LegacyDetectionShape
  patchId: string
  classifierId: string
  classifiedAt?: number
}): ClassificationRecord | null {
  const { shape, patchId, classifierId, classifiedAt } = params
  const isError = shape?.is_error === true || String(shape?.label ?? '').toUpperCase() === 'ERROR'

  if (isError) {
    return {
      patch_id: patchId,
      classifier_id: classifierId,
      classifier_type: 'human',
      classification_type: 'error',
      label: 'ERROR',
      taxon: null,
      morphospecies: null,
      is_error: true,
      classified_at: classifiedAt ?? Date.now(),
    }
  }

  const taxonomy = extractTaxonomyFromShape({ shape })
  const taxon = buildTaxonFromShape({ shape, taxonomy, isError: false })
  const morphospecies = extractMorphospeciesFromShape({ shape, taxonomy, taxon, isError: false }) ?? null

  if (morphospecies) {
    return {
      patch_id: patchId,
      classifier_id: classifierId,
      classifier_type: 'human',
      classification_type: 'morphospecies',
      label: morphospecies,
      taxon,
      morphospecies,
      is_error: false,
      classified_at: classifiedAt ?? Date.now(),
    }
  }

  if (taxon) {
    return {
      patch_id: patchId,
      classifier_id: classifierId,
      classifier_type: 'human',
      classification_type: 'taxon',
      label: typeof shape.label === 'string' ? shape.label : taxon?.scientificName ?? null,
      taxon,
      morphospecies: null,
      is_error: false,
      classified_at: classifiedAt ?? Date.now(),
    }
  }

  return null
}
