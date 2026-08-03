import { describe, expect, it } from 'vitest'
import { buildMorphoCatalogScopeCounts, buildMorphoCatalogView } from '../morpho-catalog-model'

describe('morpho catalog model', () => {
  const nights = {
    hoyaNight: { id: 'hoya/deploy-a/night-1', name: 'night-1', deploymentId: 'deploy-a' },
  }

  const detections = {
    inScope: {
      id: 'inScope',
      patchId: 'inScope',
      photoId: 'photo.jpg',
      leafGroupId: 'hoya/deploy-a/night-1',
      detectedBy: 'user' as const,
      morphospecies: 'hoya morpho',
    },
    outOfScope: {
      id: 'outOfScope',
      patchId: 'outOfScope',
      photoId: 'photo2.jpg',
      leafGroupId: 'other/deploy-a/night-1',
      detectedBy: 'user' as const,
      morphospecies: 'mosquito 2',
    },
  }

  it('keeps tab counts aligned with the active list for project scope', () => {
    const view = buildMorphoCatalogView({
      usageScope: 'project',
      scope: { projectId: 'hoya' },
      nights,
      detections,
    })

    expect(view.scopeCounts.project).toBe(view.list.length)
    expect(view.list.map((item) => item.key)).toEqual(['hoya morpho'])
  })

  it('does not inflate other scope tabs with indexed fallback from the active scope', () => {
    const view = buildMorphoCatalogView({
      usageScope: 'project',
      scope: { projectId: 'hoya' },
      nights,
      detections: {},
      indexedFallback: {
        counts: { orphan: 2 },
        taxonomyByKey: new Map(),
      },
    })

    expect(view.list).toEqual([{ key: 'orphan', count: 2, hasOrder: false, hasFamily: false, hasGenus: false }])
    expect(buildMorphoCatalogScopeCounts({ nights, detections: {}, projectId: 'hoya' }).project).toBe(0)
    expect(view.scopeCounts.all).toBe(0)
  })

  it('excludes link-only keys without usage', () => {
    const view = buildMorphoCatalogView({
      usageScope: 'project',
      scope: { projectId: 'hoya' },
      nights,
      detections: {},
    })

    expect(view.list).toEqual([])
    expect(view.scopeCounts.project).toBe(0)
  })
})
