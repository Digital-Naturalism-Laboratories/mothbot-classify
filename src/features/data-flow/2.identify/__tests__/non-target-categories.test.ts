import { beforeEach, describe, expect, it } from 'vitest'
import { findNonTargetCategory, matchNonTargetQuery, nonTargetCategoriesInUse, uniqueKeys } from '../non-target-categories'
import { parseNonTargetCategories, serializeNonTargetCategories } from '~/features/mothbox-next/non-target-categories-package'
import { identifyDetection } from '../identify'
import type { DetectionEntity } from '~/models/detection.types'

const categories = ['Error', 'Abiotic', 'Error/Blur', 'Frass']

describe('Non-Target categories', () => {
  beforeEach(() => localStorage.clear())

  it('adds parents and drops case-insensitive duplicates', () => {
    expect(uniqueKeys(['Error/Blur', 'error', 'Plantae/Leaf'])).toEqual(['Error', 'Error/Blur', 'Plantae', 'Plantae/Leaf'])
    expect(findNonTargetCategory('frass', categories)).toBe('Frass')
  })

  it('collects categories used by labels, including legacy ones', () => {
    const used = nonTargetCategoriesInUse([
      { id: '1', patchId: '1', photoId: 'a', leafGroupId: 'n', isError: true, label: 'ERROR_Blur' },
      { id: '2', patchId: '2', photoId: 'a', leafGroupId: 'n', isError: true, label: 'NON_TARGET/Abiotic/Glare' },
      { id: '3', patchId: '3', photoId: 'a', leafGroupId: 'n', label: 'Diptera' },
    ])
    expect(used.sort()).toEqual(['Abiotic', 'Abiotic/Glare', 'Error', 'Error/Blur'])
  })

  it('reads and writes the dataset’s categories file', () => {
    const text = serializeNonTargetCategories([{ path: 'Error/Glare', addedBy: 'AQ' }, { path: 'Plantae' }])
    expect(text.split('\n').filter(Boolean)).toHaveLength(2)
    expect(parseNonTargetCategories(`${text}not json\n{"path":["Abiotic","Dust"]}\n`)).toEqual(['Error/Glare', 'Plantae', 'Abiotic/Dust'])
  })
})

describe('matchNonTargetQuery', () => {
  it('shows nothing for an empty query', () => {
    expect(matchNonTargetQuery({ query: '  ', categories }).show).toBe(false)
  })

  it('matches existing categories by name', () => {
    const result = matchNonTargetQuery({ query: 'blur', categories })
    expect(result).toEqual({ show: true, matches: ['Error/Blur'], novelPath: null })
  })

  it('stays out of the way for taxon names', () => {
    expect(matchNonTargetQuery({ query: 'Noctuidae', categories }).show).toBe(false)
    expect(matchNonTargetQuery({ query: 'Nonagria', categories }).show).toBe(false)
  })

  it('offers a new category below Non-Target', () => {
    expect(matchNonTargetQuery({ query: 'non-target plantae', categories }).novelPath).toEqual(['plantae'])
    expect(matchNonTargetQuery({ query: 'nt Plantae > Leaf', categories }).novelPath).toEqual(['Plantae', 'Leaf'])
  })

  it('“error …” names a category below Error', () => {
    expect(matchNonTargetQuery({ query: 'err glare', categories }).novelPath).toEqual(['Error', 'glare'])
    expect(matchNonTargetQuery({ query: 'error blur', categories })).toMatchObject({ matches: ['Error/Blur'], novelPath: null })
  })

  it('a bare prefix lists every category', () => {
    expect(matchNonTargetQuery({ query: 'non', categories })).toEqual({ show: true, matches: categories, novelPath: null })
  })
})

describe('identifyDetection Non-Target input', () => {
  const base: DetectionEntity = { id: 'p1', patchId: 'p1', photoId: 'ph1', leafGroupId: 'lg1' }

  it('marks plain Non-Target', () => {
    const { detection } = identifyDetection({ detection: base, input: { type: 'error' } })
    expect(detection.isError).toBe(true)
    expect(detection.label).toBe('NON_TARGET')
    expect(detection.classificationType).toBe('error')
    expect(detection.taxon).toBeUndefined()
  })

  it('keeps a category, converting legacy labels', () => {
    expect(identifyDetection({ detection: base, input: { type: 'error', label: 'NON_TARGET/Abiotic' } }).detection.label).toBe('NON_TARGET/Abiotic')
    expect(identifyDetection({ detection: base, input: { type: 'error', label: 'ERROR_Frass' } }).detection.label).toBe('NON_TARGET/Frass')
  })

  it('falls back to plain Non-Target for a label that isn’t one', () => {
    expect(identifyDetection({ detection: base, input: { type: 'error', label: 'Diptera' } }).detection.label).toBe('NON_TARGET')
  })

  it('a new identification no longer agrees with anything', () => {
    const agreed = { ...base, detectedBy: 'user' as const, classificationType: 'accept' as const, agreedWith: 'mothbot::p1', identificationId: 'x' }
    const { detection } = identifyDetection({ detection: agreed, input: { type: 'error' } })
    expect(detection.agreedWith).toBeUndefined()
    expect(detection.identificationId).toBeUndefined()
  })

  it('Agree records the identification it agrees with', () => {
    const shown = { ...base, detectedBy: 'auto' as const, label: 'Diptera', identificationId: 'mothbot::p1' }
    const { detection } = identifyDetection({ detection: shown, input: { type: 'accept' } })
    expect(detection.classificationType).toBe('accept')
    expect(detection.agreedWith).toBe('mothbot::p1')
  })
})
