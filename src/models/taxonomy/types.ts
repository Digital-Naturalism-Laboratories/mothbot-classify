import type { TaxonIDSource } from './species-list-source'

/**
 * Core taxonomy types used throughout the application.
 * This is the single source of truth for taxonomy-related type definitions.
 */

export const RANK_HIERARCHY = ['kingdom', 'phylum', 'class', 'order', 'family', 'genus', 'species'] as const

export type TaxonomyRank = (typeof RANK_HIERARCHY)[number]

export const RANK_LABELS: Record<TaxonomyRank, string> = {
  kingdom: 'Kingdom',
  phylum: 'Phylum',
  class: 'Class',
  order: 'Order',
  family: 'Family',
  genus: 'Genus',
  species: 'Species',
}

export type TaxonRecord = {
  taxonID?: string | number
  /**
   * Which ID system `taxonID` belongs to — GBIF Backbone integers or Catalogue
   * of Life (COL XR) codes. Lists from both eras can be mixed in one project, so
   * the bare ID is ambiguous without it. See species-list-source.ts.
   */
  taxonIDSource?: TaxonIDSource
  scientificName: string
  taxonRank?: string
  taxonomicStatus?: string
  kingdom?: string
  phylum?: string
  class?: string
  order?: string
  family?: string
  genus?: string
  species?: string
  vernacularName?: string

  acceptedTaxonKey?: string | number
  acceptedScientificName?: string
  iucnRedListCategory?: string
  extras?: Record<string, unknown>
}

export type MissingRank = {
  rank: TaxonomyRank
  missingName: boolean
  missingId: boolean
}

/**
 * Raw taxonomy fields extracted from a JSON shape or similar source.
 * Uses 'klass' instead of 'class' to avoid JS reserved word issues.
 */
export type ExtractedTaxonomy = {
  kingdom?: string
  phylum?: string
  klass?: string
  order?: string
  family?: string
  genus?: string
  species?: string
}

/**
 * Result of determining scientific name and rank from taxonomy hierarchy.
 */
export type ScientificNameAndRank = {
  scientificName?: string
  taxonRank?: TaxonomyRank
}


