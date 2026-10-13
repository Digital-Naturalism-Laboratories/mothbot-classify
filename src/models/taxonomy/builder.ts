/**
 * Unified TaxonRecord builder.
 * Single source of truth for creating TaxonRecord objects from any source (JSON shapes, CSV rows, etc.)
 */

import type { TaxonRecord, ExtractedTaxonomy } from './types'
import type { TaxonIDSource } from './species-list-source'
import { normalizeTaxonValue, safeString } from './normalize'
import { determineScientificNameAndRank } from './rank'
import { looksLikeMorphospeciesCode } from './morphospecies'

export type TaxonMetadata = {
  taxonID?: string | number
  taxonIDSource?: TaxonIDSource
  acceptedTaxonKey?: string | number
  acceptedScientificName?: string
  vernacularName?: string
  taxonomicStatus?: string
  iucnRedListCategory?: string
  extras?: Record<string, unknown>
}

/**
 * Unified builder for TaxonRecord objects.
 * Handles normalization, scientific name determination, and species field logic consistently.
 *
 * Rules:
 * - All taxonomy values are normalized (trimmed, NA handling, etc.)
 * - Scientific name and rank are determined from the deepest taxonomic level
 * - Species field is set ONLY for valid taxonomic species (not morphospecies codes)
 * - Morphospecies detection is handled separately (not stored in species field)
 */
export function buildTaxonRecord(params: {
  kingdom?: string | unknown
  phylum?: string | unknown
  class?: string | unknown
  order?: string | unknown
  family?: string | unknown
  genus?: string | unknown
  species?: string | unknown
  metadata?: TaxonMetadata
  isError?: boolean
}): TaxonRecord | undefined {
  const { kingdom, phylum, class: classValue, order, family, genus, species, metadata, isError } = params

  // Normalize all taxonomy values
  const normalizedKingdom = normalizeTaxonValue(typeof kingdom === 'string' ? kingdom : undefined)
  const normalizedPhylum = normalizeTaxonValue(typeof phylum === 'string' ? phylum : undefined)
  const normalizedClass = normalizeTaxonValue(typeof classValue === 'string' ? classValue : undefined)
  const normalizedOrder = normalizeTaxonValue(typeof order === 'string' ? order : undefined)
  const normalizedFamily = normalizeTaxonValue(typeof family === 'string' ? family : undefined)
  const normalizedGenus = normalizeTaxonValue(typeof genus === 'string' ? genus : undefined)
  const normalizedSpecies = normalizeTaxonValue(typeof species === 'string' ? species : undefined)

  // Build ExtractedTaxonomy for rank determination
  const taxonomy: ExtractedTaxonomy = {
    kingdom: normalizedKingdom,
    phylum: normalizedPhylum,
    klass: normalizedClass,
    order: normalizedOrder,
    family: normalizedFamily,
    genus: normalizedGenus,
    species: normalizedSpecies,
  }

  // Determine scientific name and rank
  const { scientificName, taxonRank } = determineScientificNameAndRank({ taxonomy })

  // Check if we have any taxonomy data
  const hasTaxon = !!(
    scientificName ||
    normalizedKingdom ||
    normalizedPhylum ||
    normalizedClass ||
    normalizedOrder ||
    normalizedFamily ||
    normalizedGenus ||
    normalizedSpecies
  )

  if (isError || !hasTaxon) return undefined

  // Species field handling: Only set if it's a valid taxonomic species (not a morphospecies code)
  // Morphospecies codes should NOT be stored in the species field
  let finalSpecies: string | undefined = undefined
  if (normalizedSpecies && !looksLikeMorphospeciesCode(normalizedSpecies)) {
    finalSpecies = normalizedSpecies
  }

  const taxon: TaxonRecord = {
    scientificName: scientificName || '',
    taxonRank,
    kingdom: normalizedKingdom,
    phylum: normalizedPhylum,
    class: normalizedClass,
    order: normalizedOrder,
    family: normalizedFamily,
    genus: normalizedGenus,
    species: finalSpecies,
    taxonID: metadata?.taxonID,
    ...(metadata?.taxonIDSource ? { taxonIDSource: metadata.taxonIDSource } : {}),
    acceptedTaxonKey: metadata?.acceptedTaxonKey,
    acceptedScientificName: metadata?.acceptedScientificName,
    vernacularName: metadata?.vernacularName,
    taxonomicStatus: metadata?.taxonomicStatus,
    iucnRedListCategory: metadata?.iucnRedListCategory,
    extras: metadata?.extras,
  }

  return taxon
}

/**
 * Builds a TaxonRecord from an ExtractedTaxonomy object.
 * Convenience wrapper for buildTaxonRecord.
 */
export function buildTaxonRecordFromExtractedTaxonomy(params: {
  taxonomy: ExtractedTaxonomy
  metadata?: TaxonMetadata
  isError?: boolean
}): TaxonRecord | undefined {
  const { taxonomy, metadata, isError } = params

  return buildTaxonRecord({
    kingdom: taxonomy.kingdom,
    phylum: taxonomy.phylum,
    class: taxonomy.klass,
    order: taxonomy.order,
    family: taxonomy.family,
    genus: taxonomy.genus,
    species: taxonomy.species,
    metadata,
    isError,
  })
}



