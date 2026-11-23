import { describe, expect, it } from 'vitest'
import { normalizeTaxonKeyStyle, TAXON_ID_SOURCE_LABELS } from '../species-list-source'
import { boldBinOfRow, taxonKeyStyleOf, taxonKeysFromRowColumns, taxonKeysOf } from '../taxon-keys'
import { createSpeciesListAccumulator } from '../species-list-rows'

describe('taxon key styles', () => {
  it('reads the older gbif-backbone name and labels as the ontology styles', () => {
    expect(normalizeTaxonKeyStyle('gbif-backbone')).toBe('gbif')
    expect(normalizeTaxonKeyStyle('GBIF Backbone Taxonomy')).toBe('gbif')
    expect(normalizeTaxonKeyStyle('Catalogue of Life (COL XR, via GBIF)')).toBe('col')
    expect(normalizeTaxonKeyStyle('iNaturalist')).toBe('inat')
    expect(normalizeTaxonKeyStyle('nope')).toBeUndefined()
    expect(TAXON_ID_SOURCE_LABELS['gbif-backbone']).toBe(TAXON_ID_SOURCE_LABELS.gbif)
  })

  it('merges a taxon’s own key with its other keys', () => {
    expect(taxonKeysOf({ taxonID: 1763157, taxonIDSource: 'gbif-backbone', taxonKeys: { bold: 'BOLD:AAC2117' } })).toEqual({
      gbif: '1763157',
      bold: 'BOLD:AAC2117',
    })
    expect(taxonKeysOf({ taxonID: 'B6L67' })).toEqual({ col: 'B6L67' })
    expect(taxonKeyStyleOf({ taxonID: 'B6L67', taxonIDSource: 'col' })).toBe('col')
    expect(taxonKeysOf(undefined)).toEqual({})
  })

  it('reads key columns, including Antenna’s names', () => {
    expect(taxonKeysFromRowColumns({ bold_taxon_bin: 'BOLD:AAA1234', inat_taxon_id: '47157', other: 'x' })).toEqual({
      bold: 'BOLD:AAA1234',
      inat: '47157',
    })
    expect(boldBinOfRow({ scientificName: 'BOLD:aac2117' })).toBe('BOLD:AAC2117')
    expect(boldBinOfRow({ scientificName: 'Eulepidotis folium' })).toBeUndefined()
  })

  it('gives a species in a Catalogue of Life list the BOLD BIN of a BIN row that names it', () => {
    const acc = createSpeciesListAccumulator()
    const base = { kingdom: 'Animalia', phylum: 'Arthropoda', class: 'Insecta', order: 'Lepidoptera', family: 'Erebidae', genus: 'Eulepidotis' }
    acc.addRow({ ...base, species: 'Eulepidotis folium', scientificName: 'Eulepidotis folium', taxonRank: 'SPECIES', taxonomicStatus: 'ACCEPTED', taxonKey: 'B6L67', speciesKey: 'B6L67' })
    acc.addRow({ ...base, species: 'Eulepidotis folium', scientificName: 'BOLD:AAC2117', taxonRank: 'UNRANKED', taxonKey: 'BOLD.AAC2117', speciesKey: 'B6L67' })
    acc.addRow({ ...base, scientificName: 'BOLD:AAZ9999', taxonRank: 'UNRANKED', taxonKey: 'BOLD.AAZ9999' })
    const { records, taxonIDSource } = acc.finish()
    expect(taxonIDSource).toBe('col')
    const species = records.find((r) => r.taxonRank?.toLowerCase() === 'species')
    expect(taxonKeysOf(species)).toEqual({ col: 'B6L67', bold: 'BOLD:AAC2117' })
    // An unnamed BIN row gives its BIN to no one.
    const genus = records.find((r) => r.taxonRank?.toLowerCase() === 'genus')
    expect(genus?.taxonKeys?.bold).toBeUndefined()
  })
})
