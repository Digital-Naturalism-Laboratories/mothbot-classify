import { describe, expect, it } from 'vitest'
import { buildSpeciesCatalogView } from '../species-catalog-model'

describe('species catalog model', () => {
  const nights = {
    hoyaNight: { id: 'hoya/deploy-a/night-1', name: 'night-1', deploymentId: 'deploy-a', projectId: 'hoya' },
  }

  const detections = {
    inScope: {
      id: 'inScope',
      patchId: 'inScope',
      photoId: 'photo.jpg',
      nightId: 'hoya/deploy-a/night-1',
      detectedBy: 'user' as const,
      taxon: { species: 'pipiens' },
    },
    outOfScope: {
      id: 'outOfScope',
      patchId: 'outOfScope',
      photoId: 'photo2.jpg',
      nightId: 'other/deploy-a/night-1',
      detectedBy: 'user' as const,
      taxon: { species: 'aegypti' },
    },
  }

  it('keeps tab counts aligned with the active list for project scope', () => {
    const view = buildSpeciesCatalogView({
      usageScope: 'project',
      scope: { projectId: 'hoya' },
      nights,
      detections,
    })

    expect(view.scopeCounts.project).toBe(view.list.length)
    expect(view.list.map((item) => item.speciesName)).toEqual(['pipiens'])
  })

  it('excludes species outside the active project scope', () => {
    const view = buildSpeciesCatalogView({
      usageScope: 'project',
      scope: { projectId: 'hoya' },
      nights,
      detections,
    })

    expect(view.list.some((item) => item.speciesName === 'aegypti')).toBe(false)
    expect(view.scopeCounts.all).toBe(2)
  })
})
