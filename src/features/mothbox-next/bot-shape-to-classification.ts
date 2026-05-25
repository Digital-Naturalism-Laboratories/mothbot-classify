import type { ClassificationRecord } from './records'
import { buildTaxonFromShape, extractTaxonomyFromShape } from '~/models/taxonomy/extract'

export function classificationFromBotShape(params: {
  shape: Record<string, unknown>
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
  }
}

export function classificationFromIdentifiedShape(params: {
  shape: Record<string, unknown>
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

  const morphospecies = typeof shape.morphospecies === 'string' ? shape.morphospecies : null
  const taxonomy = extractTaxonomyFromShape({ shape })
  const taxon = buildTaxonFromShape({ shape, taxonomy, isError: false })

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
