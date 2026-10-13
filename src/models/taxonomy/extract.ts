/**
 * Centralized taxonomy extraction functions.
 * Single source of truth for extracting taxonomy from various data sources.
 */

import type { TaxonRecord, ExtractedTaxonomy } from './types'
import type { TaxonIDSource } from './species-list-source'
import { safeTaxonString, safeString } from './normalize'
import { buildGenusSpeciesName, getDeepestTaxonomicLevel } from './rank'
import { getSpeciesValueForExport } from './morphospecies'
import { buildTaxonRecordFromExtractedTaxonomy, type TaxonMetadata } from './builder'

/**
 * Extracts taxonomy fields from a JSON shape (bot detection or user detection).
 * Uses normalization to handle "NA", empty strings, etc.
 */
export function extractTaxonomyFromShape(params: { shape: any }): ExtractedTaxonomy {
  const { shape } = params

  return {
    kingdom: safeTaxonString(shape?.kingdom),
    phylum: safeTaxonString(shape?.phylum),
    klass: safeTaxonString(shape?.class),
    order: safeTaxonString(shape?.order),
    family: safeTaxonString(shape?.family),
    genus: safeTaxonString(shape?.genus),
    species: safeTaxonString(shape?.species),
  }
}

/**
 * Builds a full taxon object from a JSON shape for storage in DetectionEntity.
 * Uses the unified builder to ensure consistency with CSV ingestion.
 * Handles metadata fields like taxonID, acceptedTaxonKey, etc.
 */
export function buildTaxonFromShape(params: { shape: any; taxonomy: ExtractedTaxonomy; isError: boolean }): TaxonRecord | undefined {
  const { shape, taxonomy, isError } = params

  const metadata: TaxonMetadata = {
    taxonID: shape?.taxonID,
    taxonIDSource: parseTaxonIDSource(shape?.taxonID_source),
    acceptedTaxonKey: shape?.acceptedTaxonKey,
    acceptedScientificName: shape?.acceptedScientificName,
    vernacularName: shape?.vernacularName,
    taxonomicStatus: typeof shape?.taxonomicStatus === 'string' ? shape.taxonomicStatus : undefined,
    iucnRedListCategory: typeof shape?.iucnRedListCategory === 'string' ? shape.iucnRedListCategory : undefined,
    extras: typeof shape?.extras === 'object' && shape.extras ? shape.extras : undefined,
  }

  const taxon = buildTaxonRecordFromExtractedTaxonomy({
    taxonomy,
    metadata,
    isError,
  })

  // Override taxonRank if explicitly provided in shape (for cases where shape has more specific rank info)
  if (taxon && typeof shape?.taxonRank === 'string' && shape.taxonRank) {
    taxon.taxonRank = shape.taxonRank
  }

  return taxon
}

/**
 * Detection entity type for extraction functions.
 * Minimal interface to avoid circular dependencies.
 */
type DetectionLike = {
  taxon?: TaxonRecord
  morphospecies?: string
  label?: string
  isError?: boolean
}

/**
 * Extracts all taxonomy fields from a detection entity for export.
 * Returns null for taxonomy fields when isError is true.
 */
export function extractTaxonomyFieldsFromDetection(params: { detection: DetectionLike }) {
  const { detection } = params
  const isError = detection?.isError === true
  const taxon = detection?.taxon

  const speciesValue = isError
    ? null
    : getSpeciesValueForExport({
        taxon,
        morphospecies: detection?.morphospecies,
      }) || null

  return {
    kingdom: isError ? null : taxon?.kingdom || null,
    phylum: isError ? null : taxon?.phylum || null,
    class: isError ? null : taxon?.class || null,
    order: isError ? null : taxon?.order || null,
    family: isError ? null : taxon?.family || null,
    genus: isError ? null : taxon?.genus || null,
    species: speciesValue,
  }
}

/**
 * Extracts taxon metadata fields from a detection for export.
 * Returns undefined for metadata fields when isError is true.
 */
export function extractTaxonMetadataFromDetection(params: { detection: DetectionLike & { speciesListDOI?: string } }) {
  const { detection } = params
  const isError = detection?.isError === true
  const taxon = detection?.taxon

  return {
    taxonID: isError ? undefined : (taxon?.taxonID as string | undefined),
    taxonIDSource: isError ? undefined : taxon?.taxonIDSource,
    acceptedTaxonKey: isError ? undefined : (taxon?.acceptedTaxonKey as string | undefined),
    acceptedScientificName: isError ? undefined : (taxon?.acceptedScientificName as string | undefined),
    vernacularName: isError ? undefined : (taxon?.vernacularName as string | undefined),
    taxonRank: isError ? undefined : (taxon?.taxonRank as string | undefined),
    speciesListDOI: isError ? undefined : (detection?.speciesListDOI as string | undefined),
  }
}

/**
 * Derives the display name from a detection's taxonomy.
 *
 * Logic:
 * - If there's a morphospecies, use it (morphospecies takes precedence)
 * - If there's both genus and species (but no morphospecies), use "genus species"
 * - Otherwise, use the deepest taxonomic level identified
 * - Fallback to label if nothing else is available
 */
export function deriveTaxonNameFromDetection(params: { detection: DetectionLike }): string {
  const { detection } = params
  const taxon = detection?.taxon

  // If morphospecies exists, name should be just the morphospecies
  if (detection?.morphospecies) {
    return detection.morphospecies
  }

  // If species exists (and no morphospecies), name should be the scientific name (genus + species)
  const speciesValue = getSpeciesValueForExport({
    taxon,
    morphospecies: detection?.morphospecies,
  })

  if (speciesValue && taxon?.genus) {
    return buildGenusSpeciesName({ genus: taxon.genus, species: speciesValue })
  }

  // Fallback to deepest taxonomic level
  const deepestLevel = getDeepestTaxonomicLevel({ taxon })
  if (deepestLevel) return deepestLevel

  return detection?.label || ''
}

/**
 * Creates a TaxonRecord with a computed name field.
 */
export function taxonWithName(params: { taxon: TaxonRecord; detection: DetectionLike }): TaxonRecord & { name: string } {
  const { taxon, detection } = params

  return {
    ...taxon,
    name: deriveTaxonNameFromDetection({ detection }),
  }
}

/**
 * Aggregates taxonomy information from multiple detections.
 * Returns an object with all taxonomy fields that appear in at least one detection.
 */
export function aggregateTaxonomyFromDetections(params: { detections: DetectionLike[] }) {
  const { detections } = params
  if (!detections.length) return null

  let kingdom: string | null = null
  let phylum: string | null = null
  let classValue: string | null = null
  let order: string | null = null
  let family: string | null = null
  let genus: string | null = null
  let species: string | null = null
  let morphospecies: string | null = null
  let scientificName: string | null = null
  let name: string | null = null
  let commonName: string | null = null

  for (const detection of detections) {
    const taxonomyFields = extractTaxonomyFieldsFromDetection({ detection })
    const taxonMetadata = extractTaxonMetadataFromDetection({ detection: detection as any })
    const nameValue = deriveTaxonNameFromDetection({ detection })
    const speciesValue = getSpeciesValueForExport({
      taxon: detection?.taxon,
      morphospecies: detection?.morphospecies,
    })
    const morphoValue = detection?.morphospecies || ''

    if (taxonomyFields.kingdom) kingdom = taxonomyFields.kingdom
    if (taxonomyFields.phylum) phylum = taxonomyFields.phylum
    if (taxonomyFields.class) classValue = taxonomyFields.class
    if (taxonomyFields.order) order = taxonomyFields.order
    if (taxonomyFields.family) family = taxonomyFields.family
    if (taxonomyFields.genus) genus = taxonomyFields.genus
    if (speciesValue) species = speciesValue
    if (morphoValue) morphospecies = morphoValue
    if (taxonMetadata.acceptedScientificName || detection?.taxon?.scientificName) {
      scientificName = taxonMetadata.acceptedScientificName || detection?.taxon?.scientificName || null
    }
    if (nameValue) name = nameValue
    if (taxonMetadata.vernacularName) commonName = taxonMetadata.vernacularName
  }

  return {
    kingdom,
    phylum,
    class: classValue,
    order,
    family,
    genus,
    species,
    morphospecies,
    scientificName,
    name,
    commonName,
  }
}

function parseTaxonIDSource(value: unknown): TaxonIDSource | undefined {
  return value === 'gbif-backbone' || value === 'col' ? value : undefined
}
