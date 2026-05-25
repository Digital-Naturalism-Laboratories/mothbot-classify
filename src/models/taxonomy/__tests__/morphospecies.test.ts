import { describe, expect, it } from 'vitest'
import { buildTaxonFromShape } from '../extract'
import { extractTaxonomyFromShape } from '../extract'
import {
  extractMorphospeciesFromShape,
  getSpeciesValueForExport,
  looksLikeMorphospeciesCode,
} from '../morphospecies'

function extractFromShape(shape: Record<string, unknown>) {
  const taxonomy = extractTaxonomyFromShape({ shape })
  const taxon = buildTaxonFromShape({ shape, taxonomy, isError: false })
  return extractMorphospeciesFromShape({ shape, taxonomy, taxon, isError: false })
}

describe('looksLikeMorphospeciesCode', () => {
  it('flags numeric and short coded labels', () => {
    expect(looksLikeMorphospeciesCode('111')).toBe(true)
    expect(looksLikeMorphospeciesCode('sp1')).toBe(true)
    expect(looksLikeMorphospeciesCode('ipsilon')).toBe(false)
  })
})

describe('extractMorphospeciesFromShape', () => {
  it('prefers dedicated morphospecies field', () => {
    expect(
      extractFromShape({
        morphospecies: 'netelia1',
        label: '111',
        species: 'sp1',
      }),
    ).toBe('netelia1')
  })

  it('reads code-like label before species column', () => {
    expect(
      extractFromShape({
        label: '111',
        order: 'Diptera',
      }),
    ).toBe('111')
  })

  it('reads morpho stored in species when taxon omits species', () => {
    expect(
      extractFromShape({
        species: 'sp1',
        genus: 'Lispe',
        order: 'Diptera',
      }),
    ).toBe('sp1')
  })

  it('uses free-text label when taxon has no scientific name', () => {
    expect(extractFromShape({ label: 'hoya morpho' })).toBe('hoya morpho')
  })

  it('returns undefined for errors', () => {
    expect(
      extractMorphospeciesFromShape({
        shape: { label: '111' },
        taxonomy: extractTaxonomyFromShape({ shape: {} }),
        taxon: undefined,
        isError: true,
      }),
    ).toBeUndefined()
  })
})

describe('getSpeciesValueForExport', () => {
  it('clears species when morphospecies is set', () => {
    expect(
      getSpeciesValueForExport({
        morphospecies: '111',
        taxon: { species: '111', scientificName: 'Genus 111', taxonRank: 'species' },
      }),
    ).toBe('')
  })
})
