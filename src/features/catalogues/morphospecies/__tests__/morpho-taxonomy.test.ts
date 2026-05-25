import { describe, expect, it } from 'vitest'
import {
  buildMorphoTaxonomyIndex,
  buildMorphoTaxonomyTree,
  filterMorphospeciesByTaxon,
  mergeMorphoCountSources,
  type MorphoCatalogItem,
} from '../morpho-taxonomy'
import { buildMorphoCatalogScopeCounts } from '../morpho-catalog-model'

describe('morpho taxonomy helpers', () => {
  it('builds taxonomy from summaries even when detections are only partially loaded', () => {
    const taxonomyByKey = buildMorphoTaxonomyIndex({
      summaries: {
        'project/deployment-a/night-1': {
          nightId: 'project/deployment-a/night-1',
          totalDetections: 10,
          totalIdentified: 2,
          morphoCounts: { netelia1: 2 },
          morphoTaxonomyByKey: {
            netelia1: {
              class: 'Insecta',
              order: 'Hymenoptera',
              family: 'Ichneumonidae',
              genus: 'Netelia',
              morphospecies: 'netelia1',
            },
          },
        },
      },
      detections: {
        partial: {
          id: 'partial',
          patchId: 'partial',
          photoId: 'partial.jpg',
          nightId: 'project/deployment-b/night-2',
          detectedBy: 'user',
          morphospecies: 'other1',
        },
      },
    })

    expect(taxonomyByKey.get('netelia1')).toMatchObject({
      class: 'Insecta',
      order: 'Hymenoptera',
      family: 'Ichneumonidae',
      genus: 'Netelia',
      morphospecies: 'netelia1',
    })
  })

  it('falls back to detections when summaries do not carry taxonomy yet', () => {
    const taxonomyByKey = buildMorphoTaxonomyIndex({
      summaries: {
        'project/deployment-a/night-1': {
          nightId: 'project/deployment-a/night-1',
          totalDetections: 10,
          totalIdentified: 1,
          morphoCounts: { netelia1: 1 },
        },
      },
      detections: {
        netelia: {
          id: 'netelia',
          patchId: 'netelia',
          photoId: 'netelia.jpg',
          nightId: 'project/deployment-a/night-1',
          detectedBy: 'user',
          morphospecies: 'netelia1',
          taxon: {
            class: 'Insecta',
            order: 'Hymenoptera',
            family: 'Ichneumonidae',
            genus: 'Netelia',
            species: 'netelia1',
          } as any,
        },
      },
    })

    expect(taxonomyByKey.get('netelia1')).toMatchObject({
      order: 'Hymenoptera',
      family: 'Ichneumonidae',
      genus: 'Netelia',
      morphospecies: 'netelia1',
    })
  })

  it('filters cards by taxonomy using the summary index', () => {
    const morphoList: MorphoCatalogItem[] = [
      { key: 'netelia1', count: 2, hasOrder: true, hasFamily: true, hasGenus: true },
      { key: 'unknown1', count: 1, hasOrder: false, hasFamily: false, hasGenus: false },
    ]
    const taxonomyByKey = buildMorphoTaxonomyIndex({
      summaries: {
        'project/deployment-a/night-1': {
          nightId: 'project/deployment-a/night-1',
          totalDetections: 10,
          totalIdentified: 2,
          morphoCounts: { netelia1: 2, unknown1: 1 },
          morphoTaxonomyByKey: {
            netelia1: {
              class: 'Insecta',
              order: 'Hymenoptera',
              family: 'Ichneumonidae',
              genus: 'Netelia',
              morphospecies: 'netelia1',
            },
          },
        },
      },
    })

    const tree = buildMorphoTaxonomyTree({ morphoList, taxonomyByKey })
    const filtered = filterMorphospeciesByTaxon({
      morphoList,
      selectedTaxon: { rank: 'order', name: 'Hymenoptera' },
      taxonomyByKey,
    })

    expect(tree[0]).toMatchObject({ rank: 'class', name: 'Insecta', count: 1 })
    expect(tree[0]?.children?.[0]).toMatchObject({ rank: 'order', name: 'Hymenoptera', count: 1 })
    expect(filtered.map((item) => item.key)).toEqual(['netelia1'])
  })

  it('counts morphospecies from detections when night summaries are empty', () => {
    const counts = mergeMorphoCountSources({
      summaries: {},
      detections: {
        patch1: {
          id: 'patch1',
          patchId: 'patch1',
          photoId: 'photo.jpg',
          nightId: 'hoya/deployment-a/night-1',
          detectedBy: 'user',
          morphospecies: 'mosquito 2',
        },
      },
    })

    expect(counts).toEqual({ 'mosquito 2': 1 })
  })

  it('does not include global morpho link keys without in-scope usage', () => {
    const counts = mergeMorphoCountSources({
      summaries: {},
      detections: {},
      allowedNightIds: new Set(['hoya/deployment-a/night-1']),
    })

    expect(counts).toEqual({})
  })

  it('prefers detection counts over summary counts for the same morpho key', () => {
    const counts = mergeMorphoCountSources({
      summaries: {
        'hoya/deploy/night-1': {
          nightId: 'hoya/deploy/night-1',
          totalDetections: 5,
          totalIdentified: 1,
          morphoCounts: { netelia1: 99 },
        },
      },
      detections: {
        patch1: {
          id: 'patch1',
          patchId: 'patch1',
          photoId: 'photo.jpg',
          nightId: 'hoya/deploy/night-1',
          detectedBy: 'user',
          morphospecies: 'netelia1',
        },
      },
    })

    expect(counts).toEqual({ netelia1: 1 })
  })

  it('scopes project counts to the active dataset nights', () => {
    const scopeCounts = buildMorphoCatalogScopeCounts({
      projectId: 'hoya',
      nights: {
        n1: { id: 'hoya/deployment-a/night-1', name: 'night-1', deploymentId: 'deployment-a' } as any,
        n2: { id: 'other/deployment-b/night-2', name: 'night-2', deploymentId: 'deployment-b' } as any,
      },
      detections: {
        hoyaPatch: {
          id: 'hoyaPatch',
          patchId: 'hoyaPatch',
          photoId: 'photo.jpg',
          nightId: 'hoya/deployment-a/night-1',
          detectedBy: 'user',
          morphospecies: 'hoya morpho',
        },
        otherPatch: {
          id: 'otherPatch',
          patchId: 'otherPatch',
          photoId: 'photo2.jpg',
          nightId: 'other/deployment-b/night-2',
          detectedBy: 'user',
          morphospecies: 'mosquito 2',
        },
      },
    })

    expect(scopeCounts.project).toBe(1)
  })
})
