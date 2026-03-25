import { describe, expect, it } from 'vitest'
import { buildNightSummary } from '../night-summaries'

describe('buildNightSummary', () => {
  it('builds species summary data for user identifications without morphospecies', () => {
    const summary = buildNightSummary({
      nightId: 'ProjectA/Deploy_Site1_2025/Night1',
      detections: [
        {
          id: 'det-1',
          detectedBy: 'user',
          patchId: 'patch-1.jpg',
          taxon: {
            class: 'Insecta',
            order: 'Diptera',
            family: 'Culicidae',
            genus: 'Culex',
            species: 'pipiens',
          },
        } as any,
        {
          id: 'det-2',
          detectedBy: 'user',
          patchId: 'patch-2.jpg',
          taxon: {
            class: 'Insecta',
            order: 'Diptera',
            family: 'Culicidae',
            genus: 'Culex',
            species: 'pipiens',
          },
        } as any,
      ],
    })

    expect(summary.speciesCounts).toEqual({ pipiens: 2 })
    expect(summary.speciesPreviewPatchIds).toEqual({ pipiens: 'patch-1.jpg' })
    expect(summary.speciesTaxonomyByName?.pipiens).toMatchObject({
      class: 'Insecta',
      order: 'Diptera',
      family: 'Culicidae',
      genus: 'Culex',
      species: 'pipiens',
    })
  })

  it('keeps morphospecies and species summaries separate', () => {
    const summary = buildNightSummary({
      nightId: 'ProjectA/Deploy_Site1_2025/Night1',
      detections: [
        {
          id: 'det-1',
          detectedBy: 'user',
          patchId: 'patch-1.jpg',
          morphospecies: 'netelia1',
          taxon: {
            class: 'Insecta',
            order: 'Hymenoptera',
            family: 'Ichneumonidae',
            genus: 'Netelia',
          },
        } as any,
        {
          id: 'det-2',
          detectedBy: 'user',
          patchId: 'patch-2.jpg',
          taxon: {
            class: 'Insecta',
            order: 'Diptera',
            family: 'Culicidae',
            genus: 'Aedes',
            species: 'aegypti',
          },
        } as any,
      ],
    })

    expect(summary.morphoCounts).toEqual({ netelia1: 1 })
    expect(summary.speciesCounts).toEqual({ aegypti: 1 })
  })
})
