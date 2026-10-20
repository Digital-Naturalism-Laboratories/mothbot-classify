import { describe, expect, it } from 'vitest'
import { DEFAULT_TAXA, matchDefaultTaxa } from '../default-taxa'

const names = (q: string) => matchDefaultTaxa(q).map((t) => t.scientificName)

describe('default taxa', () => {
  it('shows only the broad groups before anything is typed', () => {
    expect(names('')).toEqual(['Animalia', 'Arthropoda', 'Insecta', 'Arachnida'])
  })
  it('finds insect orders by scientific or common name', () => {
    expect(names('lepido')).toEqual(['Lepidoptera'])
    expect(names('moth')).toEqual(['Lepidoptera'])
    expect(names('beetle')).toEqual(['Coleoptera'])
    expect(names('caddis')).toEqual(['Trichoptera'])
  })
  it('offers spiders under Arachnida, since insect-only lists lack them', () => {
    expect(matchDefaultTaxa('spider').find((t) => t.scientificName === 'Araneae')).toMatchObject({ class: 'Arachnida', order: 'Araneae' })
  })
  it('gives every taxon a complete lineage down to its rank', () => {
    for (const t of DEFAULT_TAXA) {
      expect(t.kingdom).toBe('Animalia')
      if (t.taxonRank === 'order') {
        const expectedClass = t.scientificName === 'Araneae' || t.scientificName === 'Opiliones' ? 'Arachnida' : 'Insecta'
        expect(t).toMatchObject({ phylum: 'Arthropoda', class: expectedClass, order: t.scientificName })
      }
      expect(typeof t.taxonID).toBe('number')
    }
    expect(new Set(DEFAULT_TAXA.map((t) => t.scientificName)).size).toBe(DEFAULT_TAXA.length)
  })
})
