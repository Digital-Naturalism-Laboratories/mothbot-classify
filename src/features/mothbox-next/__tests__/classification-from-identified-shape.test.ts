import { describe, expect, it } from 'vitest'
import { classificationFromIdentifiedShape } from '../bot-shape-to-classification'

describe('classificationFromIdentifiedShape', () => {
  it('imports dedicated morphospecies field', () => {
    const row = classificationFromIdentifiedShape({
      patchId: 'patch1.pt',
      classifierId: 'bf',
      shape: {
        patch_path: 'patches/patch1.jpg',
        morphospecies: 'netelia1',
        genus: 'Netelia',
      },
    })

    expect(row?.classification_type).toBe('morphospecies')
    expect(row?.morphospecies).toBe('netelia1')
  })

  it('infers morphospecies from label when no scientific name (legacy json)', () => {
    const row = classificationFromIdentifiedShape({
      patchId: 'patch2.pt',
      classifierId: 'bf',
      shape: {
        patch_path: 'patches/patch2.jpg',
        label: '111',
        order: 'Diptera',
      },
    })

    expect(row?.classification_type).toBe('morphospecies')
    expect(row?.morphospecies).toBe('111')
  })

  it('infers morphospecies when species field holds code but taxon.species is empty', () => {
    const row = classificationFromIdentifiedShape({
      patchId: 'patch3.pt',
      classifierId: 'bf',
      shape: {
        patch_path: 'patches/patch3.jpg',
        species: 'sp1',
        genus: 'Lispe',
        order: 'Diptera',
      },
    })

    expect(row?.classification_type).toBe('morphospecies')
    expect(row?.morphospecies).toBe('sp1')
  })
})
