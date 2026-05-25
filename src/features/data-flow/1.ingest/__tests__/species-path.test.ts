import { describe, it, expect } from 'vitest'
import { isSpeciesListIndexedPath } from '../species-indexed-paths'

describe('isSpeciesListIndexedPath', () => {
  it('accepts workspace Species folder paths', () => {
    expect(isSpeciesListIndexedPath('Species/my-list.csv')).toBe(true)
    expect(isSpeciesListIndexedPath('Species/nested/list.tsv')).toBe(true)
  })

  it('accepts legacy project-relative species paths', () => {
    expect(isSpeciesListIndexedPath('project/species/list.csv')).toBe(true)
  })

  it('rejects non-species paths', () => {
    expect(isSpeciesListIndexedPath('01_patches/foo.jpg')).toBe(false)
    expect(isSpeciesListIndexedPath('Species/readme.txt')).toBe(false)
  })
})
