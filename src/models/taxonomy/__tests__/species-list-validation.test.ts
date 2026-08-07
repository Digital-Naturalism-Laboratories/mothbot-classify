import { describe, expect, it } from 'vitest'
import { describeSpeciesListValidation, validateSpeciesListCsv } from '../species-list-validation'

describe('validateSpeciesListCsv', () => {
  it('accepts a GBIF-style export', () => {
    const result = validateSpeciesListCsv({
      headers: ['taxonKey', 'scientificName', 'kingdom', 'phylum', 'class', 'order', 'family', 'genus', 'species'],
      recordCount: 1200,
    })
    expect(result.status).toBe('ok')
    expect(result.detectedColumns).toContain('species')
    expect(describeSpeciesListValidation(result)).toBeNull()
  })

  it('is case- and whitespace-insensitive about headers', () => {
    const result = validateSpeciesListCsv({ headers: ['  ScientificName  ', 'FAMILY'], recordCount: 10 })
    expect(result.status).toBe('ok')
  })

  it('tolerates a UTF-8 BOM on the first header', () => {
    const result = validateSpeciesListCsv({ headers: ['﻿scientificName', 'genus'], recordCount: 5 })
    expect(result.status).toBe('ok')
  })

  it('rejects a CSV with no taxonomy columns at all', () => {
    const result = validateSpeciesListCsv({
      headers: ['timestamp', 'latitude', 'longitude', 'notes'],
      recordCount: 0,
    })
    expect(result.status).toBe('invalid')
    expect(result.reason).toMatch(/no taxonomy columns/i)
    expect(describeSpeciesListValidation(result)).toBe('Not a species list')
  })

  it('does not treat a bare "name" column as a species list', () => {
    const result = validateSpeciesListCsv({ headers: ['name', 'count'], recordCount: 0 })
    expect(result.status).toBe('invalid')
  })

  it('rejects taxonomy headers that produced zero usable rows', () => {
    const result = validateSpeciesListCsv({ headers: ['scientificName', 'genus'], recordCount: 0 })
    expect(result.status).toBe('invalid')
    expect(result.reason).toMatch(/no rows contained a usable taxon name/i)
  })

  it('flags a list with ranks but no species-level column as incomplete', () => {
    const result = validateSpeciesListCsv({ headers: ['family', 'genus'], recordCount: 40 })
    expect(result.status).toBe('incomplete')
    expect(describeSpeciesListValidation(result)).toBe('Incomplete')
  })

  it('accepts a species-only list', () => {
    const result = validateSpeciesListCsv({ headers: ['species'], recordCount: 3 })
    expect(result.status).toBe('ok')
  })
})
