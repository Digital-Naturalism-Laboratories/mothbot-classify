import { describe, expect, it, beforeEach } from 'vitest'
import { projectSpeciesSelectionStore } from '~/stores/species/project-species-list'
import { restoreSpeciesListSelectionFromPackage } from '../restore-species-selection-from-package'
import type { ClassificationRecord } from '../records'

describe('restoreSpeciesListSelectionFromPackage', () => {
  beforeEach(() => {
    projectSpeciesSelectionStore.set({})
  })

  it('picks the most common human species_list ref', () => {
    const classifications: ClassificationRecord[] = [
      {
        patch_id: 'a',
        classifier_id: 'bf',
        classifier_type: 'human',
        classification_type: 'taxon',
        label: 'Foo',
        taxon: { species_list: 'https://doi.org/10.15468/dl.6nxkw6.csv' } as ClassificationRecord['taxon'],
      },
      {
        patch_id: 'b',
        classifier_id: 'bf',
        classifier_type: 'human',
        classification_type: 'taxon',
        label: 'Bar',
        taxon: { species_list: 'doi.org10.15468dl.6nxkw6.csv' } as ClassificationRecord['taxon'],
      },
    ]

    restoreSpeciesListSelectionFromPackage({
      projectId: 'dinacon2025',
      classifications,
      speciesLists: {
        'doi.org10.15468dl.6nxkw6.csv': {
          id: 'doi.org10.15468dl.6nxkw6.csv',
          fileName: 'gbif.csv',
          name: 'GBIF list',
          doi: '10.15468/dl.6nxkw6',
          sourcePath: 'Species/gbif.csv',
          recordCount: 1,
          records: [],
        },
      },
    })

    expect(projectSpeciesSelectionStore.get()?.dinacon2025).toBe('doi.org10.15468dl.6nxkw6.csv')
  })
})
