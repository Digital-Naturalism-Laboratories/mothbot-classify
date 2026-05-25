import { describe, expect, it } from 'vitest'
import { buildMorphoCatalogScopeCounts, buildMorphoCatalogView } from '../morpho-catalog-model'

describe('morpho catalog scope counts', () => {
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

  it('matches tab count and visible cards for this-dataset scope', () => {
    const view = buildMorphoCatalogView({
      usageScope: 'project',
      scope: { projectId: 'hoya' },
      nights,
      detections,
    })

    expect(view.scopeCounts.project).toBe(view.list.length)
    expect(view.scopeCounts.project).toBe(1)
    expect(view.list.map((item) => item.key)).toEqual(['hoya morpho'])
  })

  it('counts every loaded dataset when all-datasets scope is selected', () => {
    const scopeCounts = buildMorphoCatalogScopeCounts({ nights, detections })

    expect(scopeCounts.all).toBe(2)
  })

  it('includes morphospecies labeled in package-style nights for this-dataset scope', () => {
    const packageNightId = 'Dinacon2025_Les_BeachPalm_grupoKite_2025-06-23__2025-06-22'
    const packageNights = {
      [packageNightId]: {
        id: packageNightId,
        name: packageNightId,
        projectId: 'dinacon2025',
        siteId: 'Les_BeachPalm',
        deploymentId: 'Dinacon2025_Les_BeachPalm_grupoKite_2025-06-23',
      },
    }
    const packageDetections = {
      morpho222: {
        id: 'morpho222',
        patchId: 'morpho222',
        photoId: 'photo.jpg',
        leafGroupId: packageNightId,
        detectedBy: 'user' as const,
        morphospecies: '222',
      },
    }

    const view = buildMorphoCatalogView({
      usageScope: 'project',
      scope: { projectId: 'dinacon2025' },
      nights: packageNights,
      detections: packageDetections,
    })

    expect(view.scopeCounts.project).toBe(1)
    expect(view.list.map((item) => item.key)).toEqual(['222'])
  })
})
