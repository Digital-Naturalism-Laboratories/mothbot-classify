import type { PhotoEntity } from '~/stores/entities/photos'
import type { DetectionEntity } from '~/models/detection.types'
import type { TaxonRecord } from '~/models/taxonomy/types'
import {
  extractTaxonomyFromShape,
  extractTaxonomyFieldsFromDetection,
  extractTaxonMetadataFromDetection,
  buildTaxonFromShape,
} from '~/models/taxonomy/extract'
import { safeString, safeNumber } from '~/models/taxonomy/normalize'
import { extractMorphospeciesFromShape } from '~/models/taxonomy/morphospecies'
import { identifyDetection } from '~/features/data-flow/2.identify/identify'

/**
 * Builds an IdentifiedJSONShape object from a detection for JSON export.
 * Returns the shape structure used in _identified.json files (progress persistence).
 */
export function buildIdentifiedJsonShapeFromDetection(params: { detection: DetectionEntity; identifierHuman?: string }) {
  const { detection, identifierHuman } = params

  const baseFields = buildDetectionBaseFields({ detection })
  const taxonomicFields = extractTaxonomyFieldsFromDetection({ detection })
  const taxonMetadataFields = buildTaxonMetadataFields({ detection })
  const identityFields = buildDetectionIdentityFields({ detection, identifierHuman })

  const morphospeciesValue = detection.morphospecies || undefined

  if (morphospeciesValue) {
    console.log('💾 persist: saving morphospecies to JSON shape', {
      detectionId: detection.id,
      morphospecies: morphospeciesValue,
    })
  }

  const shape: any = {
    ...baseFields,
    ...taxonomicFields,
    ...taxonMetadataFields,
    ...identityFields,
    morphospecies: morphospeciesValue,
  }

  return shape
}

/**
 * Resets a detection to its auto-detected state from a bot detection shape.
 * Clears all user-identified fields (morphospecies, isError, identifiedAt, etc.)
 * and restores values from the original bot detection JSON.
 */
export function buildDetectionFromBotShape(params: { shape: any; existingDetection: DetectionEntity }) {
  const { shape, existingDetection } = params

  const extractedTaxonomy = extractTaxonomyFromShape({ shape })
  const taxon = buildTaxonFromShape({ shape, taxonomy: extractedTaxonomy, isError: false })

  const detection: DetectionEntity = {
    ...existingDetection,
    label: taxon?.scientificName || safeString(shape?.label),
    taxon: taxon as any,
    score: safeNumber(shape?.score),
    direction: safeNumber(shape?.direction),
    shapeType: safeString(shape?.shape_type),
    points: Array.isArray(shape?.points) ? (shape.points as any) : existingDetection?.points,
    clusterId: safeNumber(shape?.clusterID) as any,
    detectedBy: 'auto',
    identifiedAt: undefined,
    isError: undefined,
    morphospecies: undefined,
    speciesListId: undefined,
    speciesListDOI: undefined,
    originalMothboxLabel: existingDetection?.originalMothboxLabel ?? safeString(shape?.label),
  }

  return detection
}

/**
 * Converts an IdentifiedJSONShape (from _identified.json) back to a DetectionEntity.
 * Handles morphospecies extraction (species field when no taxon.species).
 * Used when loading saved progress.
 */
export function buildDetectionFromIdentifiedJsonShape(params: { shape: any; photo: PhotoEntity; existingDetection?: DetectionEntity }) {
  const { shape, photo, existingDetection } = params

  const patchFileName = shape?.patch_path?.replace(/^patches\//, '') || ''
  const detectionId = patchFileName
  const isError = shape?.is_error === true || String(shape?.label || '').toUpperCase() === 'ERROR'

  const extractedTaxonomy = extractTaxonomyFromShape({ shape })
  const taxon = buildTaxonFromShape({ shape, taxonomy: extractedTaxonomy, isError })
  const morphospecies = extractMorphospeciesFromShape({ shape, taxonomy: extractedTaxonomy, taxon, isError })
  const identifiedAt = extractIdentifiedAtTimestamp({ shape, existingDetection })

  const detection: DetectionEntity = {
    id: detectionId,
    patchId: detectionId,
    photoId: existingDetection?.photoId || (photo as any).id,
    nightId: (photo as any).nightId,
    label: isError ? 'ERROR' : taxon?.scientificName || safeString(shape?.label) || existingDetection?.label,
    taxon: (taxon as any) ?? (isError ? undefined : existingDetection?.taxon),
    score: safeNumber(shape?.score) ?? existingDetection?.score,
    direction: safeNumber(shape?.direction) ?? existingDetection?.direction,
    shapeType: safeString(shape?.shape_type) ?? existingDetection?.shapeType,
    points: Array.isArray(shape?.points) ? (shape.points as any) : existingDetection?.points,
    detectedBy: 'user',
    identifiedAt,
    clusterId: safeNumber(shape?.clusterID) ?? existingDetection?.clusterId,
    isError: isError ? true : undefined,
    morphospecies,
    speciesListDOI: shape?.species_list ?? existingDetection?.speciesListDOI,
    originalMothboxLabel: existingDetection?.originalMothboxLabel,
  }

  return detection
}

/**
 * Builds the base detection fields object from a detection.
 * Returns the non-taxonomy fields (patch_path, label, score, direction, shape_type, points, clusterID) for JSON export.
 */
function buildDetectionBaseFields(params: { detection: DetectionEntity }) {
  const { detection } = params

  return {
    patch_path: `patches/${detection.patchId}`,
    label: detection.label,
    score: detection.score,
    direction: detection.direction,
    shape_type: detection.shapeType,
    points: detection.points,
    clusterID: typeof (detection as any)?.clusterId === 'number' ? (detection as any)?.clusterId : undefined,
  }
}

/**
 * Builds the detection identity fields object from a detection.
 * Returns the identity fields (is_error, identifier_human, timestamp_ID_human) for JSON export.
 */
function buildDetectionIdentityFields(params: { detection: DetectionEntity; identifierHuman?: string }) {
  const { detection, identifierHuman } = params

  return {
    is_error: (detection as any)?.isError ? true : undefined,
    identifier_human: detection?.detectedBy === 'user' ? identifierHuman : undefined,
    timestamp_ID_human: detection?.identifiedAt ?? Date.now(),
  }
}

/**
 * Builds the taxon metadata fields object from a detection.
 * Returns the metadata fields (taxonID, acceptedTaxonKey, etc.) for JSON export.
 */
function buildTaxonMetadataFields(params: { detection: DetectionEntity }) {
  const { detection } = params
  const taxonMetadata = extractTaxonMetadataFromDetection({ detection })

  return {
    taxonID: taxonMetadata.taxonID,
    acceptedTaxonKey: taxonMetadata.acceptedTaxonKey,
    acceptedScientificName: taxonMetadata.acceptedScientificName,
    vernacularName: taxonMetadata.vernacularName,
    taxonRank: taxonMetadata.taxonRank,
    species_list: taxonMetadata.speciesListDOI || undefined,
  }
}

function extractIdentifiedAtTimestamp(params: { shape: any; existingDetection?: DetectionEntity }) {
  const { shape, existingDetection } = params

  if (typeof shape?.timestamp_ID_human === 'number') return shape.timestamp_ID_human
  if (typeof shape?.human_identified_at === 'number') return shape.human_identified_at

  return existingDetection?.identifiedAt
}

// ============================================================================
// DETECTION UPDATE FUNCTIONS
// Thin wrappers around identifyDetection() from identify.ts
// These maintain the existing API while delegating to the single source of truth.
// ============================================================================

export type UpdateDetectionWithTaxonParams = {
  existing: DetectionEntity
  taxon: TaxonRecord
  label?: string
  speciesListId?: string
  speciesListDOI?: string
}

/**
 * Updates a detection with a new taxon.
 * Delegates to identifyDetection() for the actual logic.
 */
export function updateDetectionWithTaxon(params: UpdateDetectionWithTaxonParams): DetectionEntity {
  const { existing, taxon, label, speciesListId, speciesListDOI } = params

  const result = identifyDetection({
    detection: existing,
    input: { type: 'taxon', taxon, label },
    context: { speciesListId, speciesListDOI },
  })

  return result.detection
}

export type UpdateDetectionAsMorphospeciesParams = {
  existing: DetectionEntity
  morphospecies: string
  taxon?: TaxonRecord
  speciesListId?: string
  speciesListDOI?: string
}

/**
 * Updates a detection with a morphospecies label.
 * Delegates to identifyDetection() for the actual logic.
 * Returns null if the detection lacks required context.
 */
export function updateDetectionAsMorphospecies(params: UpdateDetectionAsMorphospeciesParams): DetectionEntity | null {
  const { existing, morphospecies, taxon, speciesListId, speciesListDOI } = params

  const result = identifyDetection({
    detection: existing,
    input: { type: 'morphospecies', text: morphospecies, taxon },
    context: { speciesListId, speciesListDOI },
  })

  if (result.skipped) return null

  return result.detection
}

export type UpdateDetectionAsErrorParams = {
  existing: DetectionEntity
  speciesListId?: string
  speciesListDOI?: string
}

/**
 * Marks a detection as an error.
 * Delegates to identifyDetection() for the actual logic.
 */
export function updateDetectionAsError(params: UpdateDetectionAsErrorParams): DetectionEntity {
  const { existing, speciesListId, speciesListDOI } = params

  const result = identifyDetection({
    detection: existing,
    input: { type: 'error' },
    context: { speciesListId, speciesListDOI },
  })

  return result.detection
}

export type AcceptDetectionParams = {
  existing: DetectionEntity
  speciesListId?: string
  speciesListDOI?: string
}

/**
 * Accepts a detection without changing its taxonomy.
 * Delegates to identifyDetection() for the actual logic.
 */
export function acceptDetection(params: AcceptDetectionParams): DetectionEntity {
  const { existing, speciesListId, speciesListDOI } = params

  const result = identifyDetection({
    detection: existing,
    input: { type: 'accept' },
    context: { speciesListId, speciesListDOI },
  })

  return result.detection
}
