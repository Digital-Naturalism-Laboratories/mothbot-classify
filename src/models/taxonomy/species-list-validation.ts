/**
 * Validation for user-chosen species list CSVs.
 *
 * Any CSV under the datasets folder is offered as a possible species list, so a
 * user can easily pick a file that isn't one (a metadata sheet, a spreadsheet
 * export, etc.). These checks look at the CSV's column headers and how many
 * taxon records actually parsed, so the picker can say "this isn't a species
 * list" instead of silently selecting something with nothing usable in it.
 */

export type SpeciesListValidationStatus = 'ok' | 'incomplete' | 'invalid'

export type SpeciesListValidation = {
  status: SpeciesListValidationStatus
  /** Human-readable explanation, shown in the picker and in the warning toast. */
  reason?: string
  /** Recognized taxonomy columns found in the CSV header. */
  detectedColumns: string[]
}

/**
 * Taxonomic rank columns. Any one of these is strong evidence the CSV is a
 * species list — they match what GBIF and Darwin Core exports produce.
 */
const RANK_COLUMNS = ['kingdom', 'phylum', 'class', 'order', 'family', 'genus', 'species'] as const

/**
 * Name columns that identify a taxon directly. `name` is deliberately excluded:
 * it's too generic and would mark almost any spreadsheet as a species list, even
 * though the parser will still read it once a list is accepted.
 */
const NAME_COLUMNS = ['scientificname', 'acceptedscientificname', 'canonicalname', 'binomial'] as const

/** Columns that let a detection be identified all the way to species level. */
const SPECIES_LEVEL_COLUMNS = ['species', 'scientificname', 'acceptedscientificname', 'canonicalname', 'binomial'] as const

function normalizeHeader(header: string) {
  return header.replace(/^﻿/, '').trim().toLowerCase()
}

export function validateSpeciesListCsv(params: {
  headers: string[]
  recordCount: number
}): SpeciesListValidation {
  const { headers, recordCount } = params

  const normalized = new Set((headers ?? []).filter(Boolean).map(normalizeHeader))

  const detectedColumns = [...RANK_COLUMNS, ...NAME_COLUMNS].filter((column) => normalized.has(column))

  if (detectedColumns.length === 0) {
    return {
      status: 'invalid',
      reason:
        'No taxonomy columns found. A species list needs at least one of: scientificName, species, genus, family, order, or class.',
      detectedColumns,
    }
  }

  if (recordCount === 0) {
    return {
      status: 'invalid',
      reason: 'Taxonomy columns were found, but no rows contained a usable taxon name.',
      detectedColumns,
    }
  }

  const hasSpeciesLevel = SPECIES_LEVEL_COLUMNS.some((column) => normalized.has(column))
  if (!hasSpeciesLevel) {
    return {
      status: 'incomplete',
      reason:
        'This list has no species-level column (species or scientificName), so you can only identify to genus or coarser.',
      detectedColumns,
    }
  }

  return { status: 'ok', detectedColumns }
}

/** Short label for the picker row. */
export function describeSpeciesListValidation(validation?: SpeciesListValidation) {
  if (!validation || validation.status === 'ok') return null
  return validation.status === 'invalid' ? 'Not a species list' : 'Incomplete'
}
