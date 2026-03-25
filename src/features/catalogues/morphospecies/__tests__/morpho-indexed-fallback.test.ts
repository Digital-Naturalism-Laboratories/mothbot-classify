import { describe, expect, it } from 'vitest'
import {
  buildMorphoIndexedFallback,
  getRelevantNightIdsForMorphoFallback,
  shouldLoadMorphoIndexedFallback,
} from '../morpho-indexed-fallback'

describe('morpho indexed fallback', () => {
  it('builds morpho counts and taxonomy from identified shapes', () => {
    const fallback = buildMorphoIndexedFallback({
      shapesByNight: {
        'project/deployment/night': [
          {
            patch_path: 'patches/netelia_a.jpg',
            label: 'netelia1',
            morphospecies: 'netelia1',
            class: 'Insecta',
            order: 'Hymenoptera',
            family: 'Ichneumonidae',
            genus: 'Netelia',
          },
          {
            patch_path: 'patches/netelia_b.jpg',
            label: 'netelia1',
            morphospecies: 'netelia1',
            class: 'Insecta',
            order: 'Hymenoptera',
            family: 'Ichneumonidae',
            genus: 'Netelia',
          },
        ],
      },
    })

    expect(fallback.counts).toEqual({ netelia1: 2 })
    expect(fallback.previewPairsByKey.netelia1).toEqual([
      { nightId: 'project/deployment/night', patchId: 'netelia_a.jpg' },
      { nightId: 'project/deployment/night', patchId: 'netelia_b.jpg' },
    ])
    expect(fallback.taxonomyByKey.netelia1).toMatchObject({
      class: 'Insecta',
      order: 'Hymenoptera',
      family: 'Ichneumonidae',
      genus: 'Netelia',
      morphospecies: 'netelia1',
    })
  })

  it('uses all summary nights when no scope filter is applied', () => {
    const nightIds = getRelevantNightIdsForMorphoFallback({
      summaries: {
        'project-a/deployment-a/night-a': {},
        'project-b/deployment-b/night-b': {},
      },
    })

    expect(nightIds).toEqual(['project-a/deployment-a/night-a', 'project-b/deployment-b/night-b'])
  })

  it('loads fallback when summaries have morpho counts but no preview ids or taxonomy', () => {
    const shouldLoad = shouldLoadMorphoIndexedFallback({
      nightIds: ['project/deployment/night'],
      summaries: {
        'project/deployment/night': {
          morphoCounts: { netelia1: 2 },
          morphoPreviewPatchIds: {},
          morphoTaxonomyByKey: {},
        },
      },
    })

    expect(shouldLoad).toBe(true)
  })
})
