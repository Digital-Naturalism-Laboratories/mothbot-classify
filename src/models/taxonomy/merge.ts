/**
 * Centralized taxonomy merging utilities.
 * Single source of truth for merging, normalizing, and transforming TaxonRecords.
 */

import type { TaxonRecord } from './types'

const RANK_HIERARCHY = ['kingdom', 'phylum', 'class', 'order', 'suborder', 'family', 'subfamily', 'tribe', 'genus', 'species']

/**
 * Checks if a rank is higher than species (i.e., not species-level).
 */
export function isRankHigherThanSpecies(rank: string): boolean {
  const lower = rank.toLowerCase()
  return (
    lower === 'kingdom' ||
    lower === 'phylum' ||
    lower === 'class' ||
    lower === 'order' ||
    lower === 'suborder' ||
    lower === 'family' ||
    lower === 'subfamily' ||
    lower === 'tribe' ||
    lower === 'genus'
  )
}

/**
 * Gets the index of a rank in the hierarchy (lower = higher rank).
 */
export function getRankIndex(rank: string): number {
  const lower = rank.toLowerCase()
  const index = RANK_HIERARCHY.indexOf(lower)
  return index >= 0 ? index : RANK_HIERARCHY.length
}

/**
 * Gets the value for a specific rank from a TaxonRecord.
 */
export function getExistingRankValue(existing: Partial<TaxonRecord>, rank: string): string | undefined {
  const lower = rank.toLowerCase()
  if (lower === 'kingdom') return existing?.kingdom
  if (lower === 'phylum') return existing?.phylum
  if (lower === 'class') return existing?.class
  if (lower === 'order' || lower === 'suborder') return existing?.order
  if (lower === 'family' || lower === 'subfamily') return existing?.family
  if (lower === 'tribe') return existing?.genus
  if (lower === 'genus') return existing?.genus
  if (lower === 'species') return existing?.species
  return undefined
}

/**
 * Gets the value for a specific rank from a new TaxonRecord.
 */
export function getNewRankValue(newTaxon: TaxonRecord, rank: string): string | undefined {
  const lower = rank.toLowerCase()
  if (lower === 'kingdom') return newTaxon?.kingdom
  if (lower === 'phylum') return newTaxon?.phylum
  if (lower === 'class') return newTaxon?.class
  if (lower === 'order' || lower === 'suborder') return newTaxon?.order
  if (lower === 'family' || lower === 'subfamily') return newTaxon?.family
  if (lower === 'tribe') return newTaxon?.genus
  if (lower === 'genus') return newTaxon?.genus
  if (lower === 'species') return newTaxon?.species
  return undefined
}

/**
 * Parses a binomial species name to extract genus and species epithet.
 *
 * @example
 * parseBinomialName("Anastrepha pallens") // { genus: "Anastrepha", epithet: "pallens" }
 * parseBinomialName("pallens")            // { genus: undefined, epithet: "pallens" }
 */
export function parseBinomialName(
  binomial: string | undefined,
): { genus: string; epithet: string } | { genus: undefined; epithet: string } | undefined {
  if (!binomial) return undefined

  const trimmed = binomial.trim()
  if (!trimmed) return undefined

  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return { genus: undefined, epithet: parts[0] }
  if (parts.length >= 2) return { genus: parts[0], epithet: parts[1] }

  return undefined
}

/**
 * Normalizes a TaxonRecord to ensure species field contains only the epithet, not the full binomial.
 */
export function normalizeSpeciesField(taxon: TaxonRecord): TaxonRecord {
  if (!taxon?.species || taxon.taxonRank !== 'species') return taxon

  const parsed = parseBinomialName(taxon.species)
  if (!parsed) return taxon

  if (parsed.genus) {
    const shouldUpdateGenus = !taxon.genus || taxon.genus === parsed.genus
    const shouldUpdateSpecies = taxon.species !== parsed.epithet

    if (shouldUpdateGenus || shouldUpdateSpecies) {
      return {
        ...taxon,
        genus: shouldUpdateGenus ? parsed.genus : taxon.genus,
        species: parsed.epithet,
        scientificName: taxon.scientificName || `${parsed.genus} ${parsed.epithet}`,
      }
    }
  }

  if (taxon.genus && taxon.species === parsed.epithet) return taxon

  return taxon
}

type MergeTaxonRanksParams = {
  existing: Partial<TaxonRecord>
  newTaxon: TaxonRecord
}

/**
 * Merges taxonomy ranks from a new taxon into an existing one.
 * Handles rank changes, preservation of higher ranks, and metadata merging.
 */
export function mergeTaxonRanks(params: MergeTaxonRanksParams): TaxonRecord {
  const { existing, newTaxon } = params
  const newRank = (newTaxon?.taxonRank ?? '').toLowerCase()
  const existingSpecies = existing?.species

  const existingRankValue = getExistingRankValue(existing, newRank)
  const newRankValue = getNewRankValue(newTaxon, newRank)
  const isRankChanged = existingRankValue !== undefined && newRankValue !== undefined && existingRankValue !== newRankValue
  const isNewRank = existingRankValue === undefined && newRankValue !== undefined

  const shouldResetLowerRanks = isRankChanged || isNewRank

  const merged: Partial<TaxonRecord> = { ...existing }

  if (newRank === 'kingdom' && newTaxon?.kingdom) {
    merged.kingdom = newTaxon.kingdom
    if (shouldResetLowerRanks) {
      merged.phylum = newTaxon.phylum
      merged.class = newTaxon.class
      merged.order = newTaxon.order
      merged.family = newTaxon.family
      merged.genus = newTaxon.genus
      merged.species = newTaxon.species
    } else {
      merged.phylum = newTaxon.phylum ?? existing?.phylum
      merged.class = newTaxon.class ?? existing?.class
      merged.order = newTaxon.order ?? existing?.order
      merged.family = newTaxon.family ?? existing?.family
      merged.genus = newTaxon.genus ?? existing?.genus
      merged.species = existingSpecies ?? newTaxon.species
    }
    merged.scientificName = newTaxon.scientificName
    merged.taxonRank = 'kingdom'
  } else if (newRank === 'phylum' && newTaxon?.phylum) {
    merged.phylum = newTaxon.phylum
    if (shouldResetLowerRanks) {
      merged.class = newTaxon.class
      merged.order = newTaxon.order
      merged.family = newTaxon.family
      merged.genus = newTaxon.genus
      merged.species = newTaxon.species
    } else {
      merged.class = newTaxon.class ?? existing?.class
      merged.order = newTaxon.order ?? existing?.order
      merged.family = newTaxon.family ?? existing?.family
      merged.genus = newTaxon.genus ?? existing?.genus
      merged.species = existingSpecies ?? newTaxon.species
    }
    merged.scientificName = newTaxon.scientificName
    merged.taxonRank = 'phylum'
  } else if (newRank === 'class' && newTaxon?.class) {
    merged.class = newTaxon.class
    if (shouldResetLowerRanks) {
      // Explicitly clear lower ranks (set to undefined, not just assign from newTaxon which might be undefined)
      merged.order = newTaxon.order ?? undefined
      merged.family = newTaxon.family ?? undefined
      merged.genus = newTaxon.genus ?? undefined
      merged.species = newTaxon.species ?? undefined
    } else {
      merged.order = newTaxon.order ?? existing?.order
      merged.family = newTaxon.family ?? existing?.family
      merged.genus = newTaxon.genus ?? existing?.genus
      merged.species = existingSpecies ?? newTaxon.species
    }
    merged.scientificName = newTaxon.scientificName
    merged.taxonRank = 'class'
  } else if (newRank === 'order' || newRank === 'suborder') {
    merged.order = newTaxon.order ?? existing?.order
    if (shouldResetLowerRanks) {
      merged.family = newTaxon.family
      merged.genus = newTaxon.genus
      merged.species = newTaxon.species
    } else {
      merged.family = newTaxon.family ?? existing?.family
      merged.genus = newTaxon.genus ?? existing?.genus
      merged.species = existingSpecies ?? newTaxon.species
    }
    merged.scientificName = newTaxon.scientificName
    merged.taxonRank = newRank
  } else if (newRank === 'family' || newRank === 'subfamily') {
    merged.family = newTaxon.family ?? existing?.family
    if (shouldResetLowerRanks) {
      merged.genus = newTaxon.genus
      merged.species = newTaxon.species
    } else {
      merged.genus = newTaxon.genus ?? existing?.genus
      merged.species = existingSpecies ?? newTaxon.species
    }
    merged.scientificName = newTaxon.scientificName
    merged.taxonRank = newRank
  } else if (newRank === 'tribe') {
    merged.genus = newTaxon.genus ?? existing?.genus
    if (shouldResetLowerRanks) {
      merged.species = newTaxon.species
    } else {
      merged.species = existingSpecies ?? newTaxon.species
    }
    merged.scientificName = newTaxon.scientificName
    merged.taxonRank = 'tribe'
  } else if (newRank === 'genus') {
    merged.order = newTaxon.order ?? existing?.order
    merged.family = newTaxon.family ?? existing?.family
    merged.genus = newTaxon.genus ?? existing?.genus
    if (shouldResetLowerRanks) {
      merged.species = newTaxon.species
    } else {
      merged.species = existingSpecies ?? newTaxon.species
    }
    merged.scientificName = newTaxon.scientificName
    merged.taxonRank = 'genus'
  } else if (newRank === 'species') {
    merged.order = newTaxon.order ?? existing?.order
    merged.family = newTaxon.family ?? existing?.family
    merged.genus = newTaxon.genus ?? existing?.genus
    if (shouldResetLowerRanks) {
      merged.species = newTaxon.species
    } else {
      merged.species = newTaxon.species ?? existingSpecies
    }
    merged.scientificName = newTaxon.scientificName
    merged.taxonRank = 'species'
  }

  // Preserve existing higher ranks if not being replaced
  // But don't preserve ranks that should be cleared (lower ranks when resetting)
  if (!merged.kingdom && existing?.kingdom) merged.kingdom = existing.kingdom
  if (!merged.phylum && existing?.phylum) merged.phylum = existing.phylum
  if (!merged.class && existing?.class) merged.class = existing.class

  // Only preserve order if we're NOT resetting lower ranks
  // When resetting, order is a lower rank that should be cleared
  if (!shouldResetLowerRanks && !merged.order && existing?.order) {
    merged.order = existing.order
  }

  if (!shouldResetLowerRanks) {
    if (!merged.family && existing?.family) merged.family = existing.family
    if (!merged.genus && existing?.genus) merged.genus = existing.genus
    if (!merged.species && existing?.species) merged.species = existing.species
  }

  // Preserve metadata fields
  if (newTaxon?.taxonID) merged.taxonID = newTaxon.taxonID
  else if (existing?.taxonID && !merged.taxonID) merged.taxonID = existing.taxonID

  if (newTaxon?.acceptedTaxonKey) merged.acceptedTaxonKey = newTaxon.acceptedTaxonKey
  else if (existing?.acceptedTaxonKey && !merged.acceptedTaxonKey) merged.acceptedTaxonKey = existing.acceptedTaxonKey

  if (newTaxon?.acceptedScientificName) merged.acceptedScientificName = newTaxon.acceptedScientificName
  else if (existing?.acceptedScientificName && !merged.acceptedScientificName)
    merged.acceptedScientificName = existing.acceptedScientificName

  if (newTaxon?.vernacularName) merged.vernacularName = newTaxon.vernacularName
  else if (existing?.vernacularName && !merged.vernacularName) merged.vernacularName = existing.vernacularName

  return merged as TaxonRecord
}

/**
 * Builds a morphospecies taxon from an existing taxon.
 * Preserves the taxonomy hierarchy while allowing morphospecies assignment.
 */
export function buildMorphospeciesTaxon(params: { existingTaxon: Partial<TaxonRecord> }): TaxonRecord {
  const { existingTaxon } = params
  return {
    ...existingTaxon,
    scientificName: existingTaxon?.scientificName ?? '',
  } as TaxonRecord
}

/**
 * Checks if a taxon has the required higher taxonomy context for morphospecies assignment.
 */
export function hasHigherTaxonomyContext(taxon: Partial<TaxonRecord> | undefined): boolean {
  if (!taxon) return false
  return !!taxon.order || !!taxon.family || !!taxon.genus
}
