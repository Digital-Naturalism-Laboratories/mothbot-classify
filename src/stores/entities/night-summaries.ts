import { atom } from 'nanostores'
import type { DetectionEntity } from './detections'
import { normalizeMorphoKey } from '~/models/taxonomy/morphospecies'
import type { TaxonRecord } from '~/models/taxonomy/types'

export type SpeciesTaxonomySummary = {
  class?: string
  order?: string
  family?: string
  genus?: string
  species?: string
}

export type MorphoTaxonomySummary = {
  class?: string
  order?: string
  family?: string
  genus?: string
  species?: string
  morphospecies?: string
}

export type NightSummaryEntity = {
  nightId: string
  totalDetections: number
  totalIdentified: number
  updatedAt?: number
  // Aggregated morphospecies counts by normalized key (lowercased, trimmed)
  morphoCounts?: Record<string, number>
  // Optional preview patch ids per morpho key for quick image lookup
  morphoPreviewPatchIds?: Record<string, string>
  // Optional taxonomy context per morpho key for project-wide catalog filtering
  morphoTaxonomyByKey?: Record<string, MorphoTaxonomySummary>
  // Aggregated species counts by species label for catalog completeness
  speciesCounts?: Record<string, number>
  // Optional preview patch ids per species for quick image lookup
  speciesPreviewPatchIds?: Record<string, string>
  // Optional taxonomy context per species name for project-wide catalog filtering
  speciesTaxonomyByName?: Record<string, SpeciesTaxonomySummary>
}

export const nightSummariesStore = atom<Record<string, NightSummaryEntity>>({})

/**
 * Builds a night summary from detections for a specific night.
 * Single source of truth for night summary calculation.
 */
export function buildNightSummary(params: { nightId: string; detections: DetectionEntity[] }): NightSummaryEntity {
  const { nightId, detections } = params

  const totalDetections = detections.length
  const totalIdentified = detections.filter((d) => d?.detectedBy === 'user').length

  const morphoCounts: Record<string, number> = {}
  const morphoPreviewPatchIds: Record<string, string> = {}
  const morphoTaxonomyByKey: Record<string, MorphoTaxonomySummary> = {}
  const speciesCounts: Record<string, number> = {}
  const speciesPreviewPatchIds: Record<string, string> = {}
  const speciesTaxonomyByName: Record<string, SpeciesTaxonomySummary> = {}

  for (const d of detections) {
    const isUser = d?.detectedBy === 'user'
    const morpho = typeof d?.morphospecies === 'string' ? d.morphospecies : ''
    const key = isUser && morpho ? normalizeMorphoKey(morpho) : ''

    if (key) {
      morphoCounts[key] = (morphoCounts[key] || 0) + 1
      if (!morphoPreviewPatchIds[key] && d?.patchId) morphoPreviewPatchIds[key] = String(d.patchId)
      morphoTaxonomyByKey[key] = mergeMorphoTaxonomySummary({
        existing: morphoTaxonomyByKey[key],
        candidate: buildMorphoTaxonomySummary({ taxon: d?.taxon, morphospecies: morpho }),
      })
      continue
    }

    const speciesName = isUser ? cleanTaxonomyValue(d?.taxon?.species) : undefined
    if (!speciesName) continue

    speciesCounts[speciesName] = (speciesCounts[speciesName] || 0) + 1
    if (!speciesPreviewPatchIds[speciesName] && d?.patchId) speciesPreviewPatchIds[speciesName] = String(d.patchId)
    speciesTaxonomyByName[speciesName] = mergeSpeciesTaxonomySummary({
      existing: speciesTaxonomyByName[speciesName],
      candidate: buildSpeciesTaxonomySummary({ taxon: d?.taxon }),
    })
  }

  return {
    nightId,
    totalDetections,
    totalIdentified,
    updatedAt: Date.now(),
    morphoCounts,
    morphoPreviewPatchIds,
    morphoTaxonomyByKey,
    speciesCounts,
    speciesPreviewPatchIds,
    speciesTaxonomyByName,
  }
}

export function buildSpeciesTaxonomySummary(params: {
  taxon?: Partial<TaxonRecord>
}): SpeciesTaxonomySummary {
  const { taxon } = params

  return {
    class: cleanTaxonomyValue(taxon?.class),
    order: cleanTaxonomyValue(taxon?.order),
    family: cleanTaxonomyValue(taxon?.family),
    genus: cleanTaxonomyValue(taxon?.genus),
    species: cleanTaxonomyValue(taxon?.species),
  }
}

export function mergeSpeciesTaxonomySummary(params: {
  existing?: SpeciesTaxonomySummary
  candidate?: SpeciesTaxonomySummary
}): SpeciesTaxonomySummary {
  const { existing, candidate } = params

  return {
    class: existing?.class || candidate?.class,
    order: existing?.order || candidate?.order,
    family: existing?.family || candidate?.family,
    genus: existing?.genus || candidate?.genus,
    species: existing?.species || candidate?.species,
  }
}

export function buildMorphoTaxonomySummary(params: {
  taxon?: Partial<TaxonRecord>
  morphospecies?: string
}): MorphoTaxonomySummary {
  const { taxon, morphospecies } = params

  return {
    class: cleanTaxonomyValue(taxon?.class),
    order: cleanTaxonomyValue(taxon?.order),
    family: cleanTaxonomyValue(taxon?.family),
    genus: cleanTaxonomyValue(taxon?.genus),
    species: cleanTaxonomyValue(taxon?.species),
    morphospecies: cleanTaxonomyValue(morphospecies),
  }
}

export function mergeMorphoTaxonomySummary(params: {
  existing?: MorphoTaxonomySummary
  candidate?: MorphoTaxonomySummary
}): MorphoTaxonomySummary {
  const { existing, candidate } = params

  return {
    class: existing?.class || candidate?.class,
    order: existing?.order || candidate?.order,
    family: existing?.family || candidate?.family,
    genus: existing?.genus || candidate?.genus,
    species: existing?.species || candidate?.species,
    morphospecies: existing?.morphospecies || candidate?.morphospecies,
  }
}

function cleanTaxonomyValue(value?: string) {
  const trimmed = (value ?? '').trim()
  return trimmed || undefined
}
