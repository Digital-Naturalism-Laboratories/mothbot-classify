/**
 * Centralized morphospecies detection and handling.
 * Single source of truth for determining what constitutes a morphospecies.
 */

import type { TaxonRecord, ExtractedTaxonomy } from './types'

/**
 * Normalizes a morphospecies key for consistent lookup and storage.
 */
export function normalizeMorphoKey(input: string): string {
  const text = (input ?? '').trim().toLowerCase()
  return text
}

/**
 * Checks if a value looks like a morphospecies code rather than a valid species name.
 */
export function looksLikeMorphospeciesCode(value: string | undefined | null): boolean {
  if (!value) return false

  const trimmed = value.trim()
  if (!trimmed) return false

  if (/^\d+$/.test(trimmed)) return true

  if (trimmed.length <= 4 && /\d/.test(trimmed)) return true

  const digitCount = (trimmed.match(/\d/g) || []).length
  const letterCount = (trimmed.match(/[a-zA-Z]/g) || []).length
  if (digitCount > 0 && digitCount >= letterCount) return true

  return false
}

/**
 * Extracts morphospecies from an identified JSON shape (single pipeline, fixed priority).
 *
 * 1. Dedicated `morphospecies` field (current format)
 * 2. Code-like `label` (legacy numeric / sp1-style codes)
 * 3. `species` on shape when taxon builder omitted it (morpho stored in species column)
 * 4. Free-text `label` when there is no scientific name (legacy morpho names, e.g. netelia1)
 */
export function extractMorphospeciesFromShape(params: {
  shape: any
  taxonomy: ExtractedTaxonomy
  taxon: { scientificName?: string; species?: string } | undefined
  isError: boolean
}): string | undefined {
  const { shape, taxonomy, taxon, isError } = params

  if (isError) return undefined

  const dedicated = trimShapeString(shape?.morphospecies)
  if (dedicated) return dedicated

  const labelValue = trimShapeString(shape?.label)
  if (labelValue && looksLikeMorphospeciesCode(labelValue)) return labelValue

  const fromSpeciesField = morphospeciesStoredInSpeciesField({
    species: taxonomy.species,
    taxonSpecies: taxon?.species,
  })
  if (fromSpeciesField) return fromSpeciesField

  if (labelValue && !taxon?.scientificName) return labelValue

  return undefined
}

/**
 * Returns the species value from a detection for export.
 * Only returns actual taxonomic species — morphospecies uses a separate column.
 */
export function getSpeciesValueForExport(params: { taxon?: TaxonRecord; morphospecies?: string }): string {
  const { taxon, morphospecies } = params

  if (morphospecies) return ''

  const rawSpecies = taxon?.species || ''

  if (looksLikeMorphospeciesCode(rawSpecies)) return ''

  return rawSpecies
}

/**
 * Returns a valid scientific name for export (GBIF-compatible).
 */
export function getValidScientificNameForExport(params: { taxon?: TaxonRecord; morphospecies?: string; label?: string }): string {
  const { taxon, morphospecies, label } = params

  if (morphospecies) {
    if (taxon?.genus) return taxon.genus
    if (taxon?.family) return taxon.family
    if (taxon?.order) return taxon.order
    return ''
  }

  const candidate = taxon?.scientificName || ''

  if (looksLikeMorphospeciesCode(candidate)) return ''

  if (candidate) return candidate

  const labelValue = label || ''
  if (labelValue && !looksLikeMorphospeciesCode(labelValue)) return labelValue

  return ''
}

function trimShapeString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function morphospeciesStoredInSpeciesField(params: { species?: string; taxonSpecies?: string }): string | undefined {
  const { species, taxonSpecies } = params
  if (!species || taxonSpecies) return undefined
  return species
}
