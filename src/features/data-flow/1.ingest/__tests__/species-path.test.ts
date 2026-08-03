import { describe, it, expect } from 'vitest'
import { isSpeciesListIndexedPath, isInSpeciesNamedFolder } from '../species-indexed-paths'

describe('isSpeciesListIndexedPath', () => {
  it('accepts any CSV/TSV file regardless of folder location', () => {
    expect(isSpeciesListIndexedPath('Species/my-list.csv')).toBe(true)
    expect(isSpeciesListIndexedPath('Species/nested/list.tsv')).toBe(true)
    expect(isSpeciesListIndexedPath('project/species/list.csv')).toBe(true)
    expect(isSpeciesListIndexedPath('my-dataset/lists/birds.csv')).toBe(true)
    expect(isSpeciesListIndexedPath('top-level-list.csv')).toBe(true)
  })

  it('rejects non-CSV/TSV files anywhere', () => {
    expect(isSpeciesListIndexedPath('01_patches/foo.jpg')).toBe(false)
    expect(isSpeciesListIndexedPath('Species/readme.txt')).toBe(false)
  })
})

describe('isInSpeciesNamedFolder', () => {
  it('detects a folder literally named species, case-insensitive', () => {
    expect(isInSpeciesNamedFolder('Species/my-list.csv')).toBe(true)
    expect(isInSpeciesNamedFolder('project/species/list.csv')).toBe(true)
    expect(isInSpeciesNamedFolder('Species/nested/list.tsv')).toBe(true)
  })

  it('is false for CSVs outside any species-named folder', () => {
    expect(isInSpeciesNamedFolder('my-dataset/lists/birds.csv')).toBe(false)
    expect(isInSpeciesNamedFolder('top-level-list.csv')).toBe(false)
  })
})
