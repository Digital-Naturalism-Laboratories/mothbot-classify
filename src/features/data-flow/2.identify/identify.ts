/**
 * Centralized identification logic.
 * Single source of truth for how detections are identified/labeled.
 */

import type { TaxonRecord } from '~/models/taxonomy/types'
import type { DetectionEntity } from '~/models/detection.types'
import { taxonWithName } from '~/models/taxonomy/extract'
import {
  mergeTaxonRanks,
  normalizeSpeciesField,
  buildMorphospeciesTaxon,
  isRankHigherThanSpecies,
  hasHigherTaxonomyContext,
  getExistingRankValue,
  getNewRankValue,
  parseBinomialName,
} from '~/models/taxonomy/merge'
import { hasTaxonFields } from '~/models/taxonomy/validate'
import { computeFinalLabel } from '~/models/taxonomy/label'

export type IdentificationInput =
  | { type: 'taxon'; taxon: TaxonRecord; label?: string }
  | { type: 'morphospecies'; text: string; taxon?: TaxonRecord }
  | { type: 'error' }
  | { type: 'accept' }

export type IdentificationContext = {
  speciesListId?: string
  speciesListDOI?: string
}

export type IdentificationResult = {
  detection: DetectionEntity
  changed: boolean
  skipped: boolean
  skipReason?: string
}

/**
 * Identifies a single detection with the given input.
 * This is the single source of truth for identification logic.
 *
 * Returns a new DetectionEntity with the identification applied.
 */
export function identifyDetection(params: {
  detection: DetectionEntity
  input: IdentificationInput
  context?: IdentificationContext
}): IdentificationResult {
  const { detection, input, context } = params

  if (input.type === 'error') return handleErrorIdentification({ detection, context })
  if (input.type === 'accept') return handleAcceptIdentification({ detection, context })
  if (input.type === 'morphospecies') {
    return handleMorphospeciesIdentification({
      detection,
      text: input.text,
      taxon: input.taxon,
      context,
    })
  }
  if (input.type === 'taxon') return handleTaxonIdentification({ detection, taxon: input.taxon, label: input.label, context })

  return { detection, changed: false, skipped: true, skipReason: 'Unknown input type' }
}

function handleErrorIdentification(params: { detection: DetectionEntity; context?: IdentificationContext }): IdentificationResult {
  const { detection, context } = params

  const next: DetectionEntity = {
    ...detection,
    label: 'ERROR',
    detectedBy: 'user',
    identifiedAt: Date.now(),
    classificationType: 'error',
    taxon: undefined,
    isError: true,
    morphospecies: undefined,
    speciesListId: context?.speciesListId || detection?.speciesListId,
    speciesListDOI: context?.speciesListDOI || detection?.speciesListDOI,
  }

  return { detection: next, changed: true, skipped: false }
}

function handleAcceptIdentification(params: { detection: DetectionEntity; context?: IdentificationContext }): IdentificationResult {
  const { detection, context } = params

  const next: DetectionEntity = {
    ...detection,
    detectedBy: 'user',
    identifiedAt: Date.now(),
    classificationType: 'accept',
    speciesListId: context?.speciesListId || detection?.speciesListId,
    speciesListDOI: context?.speciesListDOI || detection?.speciesListDOI,
  }

  return { detection: next, changed: true, skipped: false }
}

function handleMorphospeciesIdentification(params: {
  detection: DetectionEntity
  text: string
  taxon?: TaxonRecord
  context?: IdentificationContext
}): IdentificationResult {
  const { detection, text, taxon, context } = params
  const trimmed = text.trim()

  if (!trimmed) return { detection, changed: false, skipped: true, skipReason: 'Empty morphospecies text' }

  const existingTaxon = getMorphospeciesContextTaxon({ detection, taxon })

  if (!hasHigherTaxonomyContext(existingTaxon)) {
    return {
      detection,
      changed: false,
      skipped: true,
      skipReason: 'Morphospecies requires higher taxonomy context (order, family, or genus)',
    }
  }

  const nextTaxon = buildMorphospeciesTaxon({ existingTaxon })
  const taxonWithNameField = taxonWithName({
    taxon: nextTaxon,
    detection: { ...detection, taxon: nextTaxon, morphospecies: trimmed },
  })

  const next: DetectionEntity = {
    ...detection,
    label: trimmed,
    detectedBy: 'user',
    identifiedAt: Date.now(),
    classificationType: 'morphospecies',
    taxon: taxonWithNameField,
    isError: false,
    morphospecies: trimmed,
    speciesListId: context?.speciesListId || detection?.speciesListId,
    speciesListDOI: context?.speciesListDOI || detection?.speciesListDOI,
  }

  return { detection: next, changed: true, skipped: false }
}

function getMorphospeciesContextTaxon(params: {
  detection: DetectionEntity
  taxon?: TaxonRecord
}): Partial<TaxonRecord> {
  const { detection, taxon } = params

  if (taxon && hasHigherTaxonomyContext(taxon)) return taxon

  return detection?.taxon ?? {}
}

function handleTaxonIdentification(params: {
  detection: DetectionEntity
  taxon: TaxonRecord
  label?: string
  context?: IdentificationContext
}): IdentificationResult {
  const { detection, taxon, label, context } = params

  if (!hasTaxonFields(taxon)) {
    return { detection, changed: false, skipped: true, skipReason: 'No valid taxon provided' }
  }

  const existingTaxon: Partial<TaxonRecord> = detection?.taxon ?? {}
  const newRank = (taxon?.taxonRank ?? '').toLowerCase()
  const isHigherRank = isRankHigherThanSpecies(newRank)

  const hasGenusField = !!taxon?.genus
  const hasFamilyField = !!taxon?.family
  const hasOrderField = !!taxon?.order
  const hasSpeciesField = !!taxon?.species

  const isFullSpecies = hasGenusField && hasSpeciesField && newRank === 'species'

  const existingRankValue = getExistingRankValue(existingTaxon, newRank)
  const newRankValue = getNewRankValue(taxon, newRank)
  const isRankChanged = !isFullSpecies && existingRankValue !== undefined && newRankValue !== undefined && existingRankValue !== newRankValue

  let nextTaxon: TaxonRecord | undefined = existingTaxon as TaxonRecord
  let nextMorphospecies: string | undefined = detection?.morphospecies

  if (isFullSpecies) {
    nextTaxon = normalizeSpeciesField(taxon)
    nextMorphospecies = undefined
  } else if (isRankChanged) {
    nextTaxon = mergeTaxonRanks({ existing: existingTaxon, newTaxon: taxon })
    if (newRank === 'species') nextTaxon = normalizeSpeciesField(nextTaxon)
    nextMorphospecies = undefined
  } else if (isHigherRank && detection?.morphospecies) {
    nextTaxon = mergeTaxonRanks({ existing: existingTaxon, newTaxon: taxon })
    if (newRank === 'genus') {
      nextTaxon.species = undefined
      if (taxon?.genus && !nextTaxon.scientificName) {
        nextTaxon.scientificName = taxon.genus
      }
    } else {
      nextTaxon.species = detection.morphospecies
    }
    nextMorphospecies = detection.morphospecies
  } else if (detection?.morphospecies && (hasGenusField || hasFamilyField || hasOrderField) && !isFullSpecies) {
    nextTaxon = mergeTaxonRanks({ existing: existingTaxon, newTaxon: taxon })
    nextTaxon.species = detection.morphospecies
    if (hasGenusField && !isHigherRank) nextTaxon.taxonRank = 'genus'
    else if (hasFamilyField && !isHigherRank) nextTaxon.taxonRank = 'family'
    else if (hasOrderField && !isHigherRank) nextTaxon.taxonRank = 'order'
    nextMorphospecies = detection.morphospecies
  } else if (newRank === 'species' && hasSpeciesField && !hasGenusField && !hasFamilyField && !hasOrderField) {
    const parsed = parseBinomialName(taxon.species)
    let taxonToMerge = taxon

    if (parsed?.genus) {
      taxonToMerge = {
        ...taxon,
        genus: parsed.genus,
        species: parsed.epithet,
        scientificName: taxon.scientificName || `${parsed.genus} ${parsed.epithet}`,
      }
    }

    const hasExistingHigherRanks = !!existingTaxon?.genus || !!existingTaxon?.family || !!existingTaxon?.order
    if (hasExistingHigherRanks) {
      nextTaxon = mergeTaxonRanks({ existing: existingTaxon, newTaxon: taxonToMerge })
      nextTaxon = normalizeSpeciesField(nextTaxon)
    } else {
      nextTaxon = normalizeSpeciesField(taxonToMerge)
    }
    nextMorphospecies = undefined
  } else {
    nextTaxon = newRank === 'species' ? normalizeSpeciesField(taxon) : taxon
    nextMorphospecies = undefined
  }

  const finalLabel = computeFinalLabel({ taxon: nextTaxon, label, morphospecies: nextMorphospecies })
  const taxonWithNameField = nextTaxon
    ? taxonWithName({
        taxon: nextTaxon,
        detection: { ...detection, taxon: nextTaxon, morphospecies: nextMorphospecies },
      })
    : undefined

  const next: DetectionEntity = {
    ...detection,
    label: finalLabel,
    detectedBy: 'user',
    identifiedAt: Date.now(),
    classificationType: 'taxon',
    taxon: taxonWithNameField,
    isError: false,
    morphospecies: nextMorphospecies,
    speciesListId: context?.speciesListId || detection?.speciesListId,
    speciesListDOI: context?.speciesListDOI || detection?.speciesListDOI,
  }

  return { detection: next, changed: true, skipped: false }
}

/**
 * Batch identifies multiple detections.
 * Returns a map of detection IDs to their new entities.
 */
export function identifyDetections(params: {
  detections: Record<string, DetectionEntity>
  detectionIds: string[]
  input: IdentificationInput
  context?: IdentificationContext
}): { updated: Record<string, DetectionEntity>; skipped: string[]; skipReasons: Record<string, string> } {
  const { detections, detectionIds, input, context } = params

  const updated: Record<string, DetectionEntity> = {}
  const skipped: string[] = []
  const skipReasons: Record<string, string> = {}

  for (const id of detectionIds) {
    const existing = detections[id]
    if (!existing) {
      skipped.push(id)
      skipReasons[id] = 'Detection not found'
      continue
    }

    const result = identifyDetection({ detection: existing, input, context })

    if (result.skipped) {
      skipped.push(id)
      if (result.skipReason) skipReasons[id] = result.skipReason
    } else if (result.changed) {
      updated[id] = result.detection
    }
  }

  return { updated, skipped, skipReasons }
}
