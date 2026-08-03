import { describe, expect, it } from 'vitest'
import {
  buildSpeciesCatalogItems,
  buildSpeciesScopeCounts,
  buildSpeciesTaxonomyIndex,
  buildSpeciesUsageSummary,
} from '../species-data'
import type { LeafGroupSummaryEntity } from '~/stores/entities/night-summaries'

describe('species-data', () => {
  it('builds a complete species list from summaries even when detections are missing', () => {
    const summaries: Record<string, LeafGroupSummaryEntity> = {
      'ProjectA/Deployment1/Night1': {
        leafGroupId: 'ProjectA/Deployment1/Night1',
        totalDetections: 10,
        totalIdentified: 2,
        speciesCounts: {
          pipiens: 2,
          aegypti: 1,
        },
        speciesPreviewPatchIds: {
          pipiens: 'pipiens-1.jpg',
          aegypti: 'aegypti-1.jpg',
        },
        speciesTaxonomyByName: {
          pipiens: { class: 'Insecta', order: 'Diptera', family: 'Culicidae', genus: 'Culex', species: 'pipiens' },
          aegypti: { class: 'Insecta', order: 'Diptera', family: 'Culicidae', genus: 'Aedes', species: 'aegypti' },
        },
      },
      'ProjectA/Deployment1/Night2': {
        leafGroupId: 'ProjectA/Deployment1/Night2',
        totalDetections: 8,
        totalIdentified: 1,
        speciesCounts: {
          pipiens: 1,
        },
        speciesPreviewPatchIds: {
          pipiens: 'pipiens-2.jpg',
        },
        speciesTaxonomyByName: {
          pipiens: { class: 'Insecta', order: 'Diptera', family: 'Culicidae', genus: 'Culex', species: 'pipiens' },
        },
      },
    }

    const result = buildSpeciesCatalogItems({ summaries, detections: {} })

    expect(result).toEqual([
      {
        speciesName: 'pipiens',
        count: 3,
        previewPairs: [
          { leafGroupId: 'ProjectA/Deployment1/Night1', patchId: 'pipiens-1.jpg' },
          { leafGroupId: 'ProjectA/Deployment1/Night2', patchId: 'pipiens-2.jpg' },
        ],
      },
      {
        speciesName: 'aegypti',
        count: 1,
        previewPairs: [{ leafGroupId: 'ProjectA/Deployment1/Night1', patchId: 'aegypti-1.jpg' }],
      },
    ])
  })

  it('falls back to loaded detections for taxonomy when summaries are incomplete', () => {
    const taxonomyByName = buildSpeciesTaxonomyIndex({
      summaries: {
        'ProjectA/Deployment1/Night1': {
          leafGroupId: 'ProjectA/Deployment1/Night1',
          totalDetections: 10,
          totalIdentified: 1,
          speciesCounts: { pipiens: 1 },
        },
      },
      detections: {
        a: {
          id: 'a',
          leafGroupId: 'ProjectA/Deployment1/Night1',
          patchId: 'patch-1.jpg',
          detectedBy: 'user',
          taxon: {
            class: 'Insecta',
            order: 'Diptera',
            family: 'Culicidae',
            genus: 'Culex',
            species: 'pipiens',
          },
        },
      } as any,
    })

    expect(taxonomyByName.get('pipiens')).toMatchObject({
      class: 'Insecta',
      order: 'Diptera',
      family: 'Culicidae',
      genus: 'Culex',
      species: 'pipiens',
    })
  })

  it('scopes usage and scope counts to the selected nights', () => {
    const summaries: Record<string, LeafGroupSummaryEntity> = {
      'ProjectA/Deploy_Site1_2025/Night1': {
        leafGroupId: 'ProjectA/Deploy_Site1_2025/Night1',
        totalDetections: 10,
        totalIdentified: 2,
        speciesCounts: { pipiens: 2 },
        speciesPreviewPatchIds: { pipiens: 'patch-1.jpg' },
        speciesTaxonomyByName: {
          pipiens: { class: 'Insecta', order: 'Diptera', family: 'Culicidae', genus: 'Culex', species: 'pipiens' },
        },
      },
      'ProjectA/Deploy_Site1_2025/Night2': {
        leafGroupId: 'ProjectA/Deploy_Site1_2025/Night2',
        totalDetections: 10,
        totalIdentified: 2,
        speciesCounts: { aegypti: 1 },
        speciesPreviewPatchIds: { aegypti: 'patch-2.jpg' },
        speciesTaxonomyByName: {
          aegypti: { class: 'Insecta', order: 'Diptera', family: 'Culicidae', genus: 'Aedes', species: 'aegypti' },
        },
      },
      'ProjectB/Deploy_Site2_2025/Night3': {
        leafGroupId: 'ProjectB/Deploy_Site2_2025/Night3',
        totalDetections: 10,
        totalIdentified: 2,
        speciesCounts: { pipiens: 4 },
        speciesPreviewPatchIds: { pipiens: 'patch-3.jpg' },
        speciesTaxonomyByName: {
          pipiens: { class: 'Insecta', order: 'Diptera', family: 'Culicidae', genus: 'Culex', species: 'pipiens' },
        },
      },
    }

    const allowedLeafGroupIds = new Set(['ProjectA/Deploy_Site1_2025/Night1'])
    const usage = buildSpeciesUsageSummary({
      speciesName: 'pipiens',
      summaries,
      nights: {
        'ProjectA/Deploy_Site1_2025/Night1': { id: 'ProjectA/Deploy_Site1_2025/Night1', projectId: 'ProjectA', name: 'Night1' },
        'ProjectA/Deploy_Site1_2025/Night2': { id: 'ProjectA/Deploy_Site1_2025/Night2', projectId: 'ProjectA', name: 'Night2' },
        'ProjectB/Deploy_Site2_2025/Night3': { id: 'ProjectB/Deploy_Site2_2025/Night3', projectId: 'ProjectB', name: 'Night3' },
      } as any,
      allowedLeafGroupIds,
      detections: {},
    })

    const scopeCounts = buildSpeciesScopeCounts({
      summaries,
      projectId: 'ProjectA',
      siteId: 'Site1',
      deploymentId: 'Deploy_Site1_2025',
      leafGroupId: 'Night1',
    })

    expect(usage.instanceCount).toBe(2)
    expect(usage.leafGroupIds).toEqual(['ProjectA/Deploy_Site1_2025/Night1'])
    expect(usage.projectIds).toEqual(['ProjectA'])
    expect(scopeCounts).toEqual({
      all: 2,
      project: 2,
      site: 2,
      deployment: 2,
      night: 1,
    })
  })
})
