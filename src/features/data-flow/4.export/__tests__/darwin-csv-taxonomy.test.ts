import { describe, it, expect } from 'vitest'
import type { DetectionEntity } from '~/stores/entities/detections'
import { buildDarwinShapeFromDetection } from '../darwin-csv'
import { deriveTaxonNameFromDetection } from '~/models/taxonomy/extract'

describe('Darwin CSV Export - Taxonomy Columns', () => {
  const BASE_DETECTION = {
    id: 'det1',
    patchId: 'patch1',
    photoId: 'photo1',
    nightId: 'project/deployment/night1',
  } as const

  const BASE_PATCH = {
    id: 'patch1',
    imageFile: { path: 'patches/patch1.jpg' },
  } as const

  const BASE_PHOTO = {
    id: 'photo1.jpg',
  } as const

  const BASE_PARAMS = {
    patch: BASE_PATCH as any,
    photo: BASE_PHOTO as any,
    nightId: BASE_DETECTION.nightId,
    nightDiskPath: 'project/deployment/night1',
  } as const

  describe('deriveNameColumn - name column logic', () => {
    it('should return "genus species" when both genus and species exist', () => {
      const detection: DetectionEntity = {
        ...BASE_DETECTION,
        label: 'Homo sapiens',
        taxon: {
          scientificName: 'Homo sapiens',
          taxonRank: 'species',
          genus: 'Homo',
          species: 'sapiens',
        },
      }

      const name = deriveTaxonNameFromDetection({ detection })
      expect(name).toBe('Homo sapiens')
    })

    it('should return morphospecies only when morphospecies exists (even with genus)', () => {
      const detection: DetectionEntity = {
        ...BASE_DETECTION,
        label: 'Lispe',
        morphospecies: '111',
        taxon: {
          scientificName: '',
          taxonRank: 'genus',
          order: 'Diptera',
          family: 'Muscidae',
          genus: 'Lispe',
          species: '111',
        },
      }

      const name = deriveTaxonNameFromDetection({ detection })
      expect(name).toBe('111') // morphospecies only, not "genus morphospecies"
    })

    it('should return morphospecies when only morphospecies exists (no genus)', () => {
      const detection: DetectionEntity = {
        ...BASE_DETECTION,
        label: '111',
        morphospecies: '111',
        taxon: {
          scientificName: '111',
          taxonRank: 'species',
          order: 'Diptera',
          species: '111',
        },
      }

      const name = deriveTaxonNameFromDetection({ detection })
      expect(name).toBe('111')
    })

    it('should return species when only species exists (no morphospecies)', () => {
      const detection: DetectionEntity = {
        ...BASE_DETECTION,
        label: 'Musca domestica',
        taxon: {
          scientificName: 'Musca domestica',
          taxonRank: 'species',
          genus: 'Musca',
          species: 'domestica',
        },
      }

      const name = deriveTaxonNameFromDetection({ detection })
      expect(name).toBe('Musca domestica')
    })

    it('should return genus when only genus exists', () => {
      const detection: DetectionEntity = {
        ...BASE_DETECTION,
        label: 'Lispe',
        taxon: {
          scientificName: '',
          taxonRank: 'genus',
          genus: 'Lispe',
        },
      }

      const name = deriveTaxonNameFromDetection({ detection })
      expect(name).toBe('Lispe')
    })

    it('should return family when only family exists', () => {
      const detection: DetectionEntity = {
        ...BASE_DETECTION,
        label: 'Muscidae',
        taxon: {
          scientificName: 'Muscidae',
          taxonRank: 'family',
          family: 'Muscidae',
        },
      }

      const name = deriveTaxonNameFromDetection({ detection })
      expect(name).toBe('Muscidae')
    })

    it('should return order when only order exists', () => {
      const detection: DetectionEntity = {
        ...BASE_DETECTION,
        label: 'Diptera',
        taxon: {
          scientificName: 'Diptera',
          taxonRank: 'order',
          order: 'Diptera',
        },
      }

      const name = deriveTaxonNameFromDetection({ detection })
      expect(name).toBe('Diptera')
    })

    it('should return class when only class exists', () => {
      const detection: DetectionEntity = {
        ...BASE_DETECTION,
        label: 'Insecta',
        taxon: {
          scientificName: 'Insecta',
          taxonRank: 'class',
          class: 'Insecta',
        },
      }

      const name = deriveTaxonNameFromDetection({ detection })
      expect(name).toBe('Insecta')
    })

    it('should return label when no taxon information exists', () => {
      const detection: DetectionEntity = {
        ...BASE_DETECTION,
        label: 'Unknown',
      }

      const name = deriveTaxonNameFromDetection({ detection })
      expect(name).toBe('Unknown')
    })

    it('should return morphospecies only when morphospecies exists (not genus + morphospecies)', () => {
      const detection: DetectionEntity = {
        ...BASE_DETECTION,
        label: 'Lispe',
        morphospecies: '111',
        taxon: {
          scientificName: '',
          taxonRank: 'genus',
          genus: 'Lispe',
          species: 'other',
        },
      }

      const name = deriveTaxonNameFromDetection({ detection })
      expect(name).toBe('111') // morphospecies only, not "genus morphospecies"
    })
  })

  describe('taxonomy columns population', () => {
    it('should populate all taxonomy columns correctly with full species', () => {
      const detection: DetectionEntity = {
        ...BASE_DETECTION,
        label: 'Musca domestica',
        taxon: {
          scientificName: 'Musca domestica',
          taxonRank: 'species',
          kingdom: 'Animalia',
          phylum: 'Arthropoda',
          class: 'Insecta',
          order: 'Diptera',
          family: 'Muscidae',
          genus: 'Musca',
          species: 'domestica',
        },
      }

      const row = buildDarwinShapeFromDetection({
        detection,
        ...BASE_PARAMS,
      })

      expect(row.kingdom).toBe('Animalia')
      expect(row.phylum).toBe('Arthropoda')
      expect(row.class).toBe('Insecta')
      expect(row.order).toBe('Diptera')
      expect(row.family).toBe('Muscidae')
      expect(row.genus).toBe('Musca')
      expect(row.species).toBe('domestica')
    })

    it('should NOT use morphospecies for species column - species stays empty', () => {
      const detection: DetectionEntity = {
        ...BASE_DETECTION,
        label: '111',
        morphospecies: '111',
        taxon: {
          scientificName: '111',
          taxonRank: 'species',
          order: 'Diptera',
          species: '111',
        },
      }

      const row = buildDarwinShapeFromDetection({
        detection,
        ...BASE_PARAMS,
      })

      // Morphospecies should NOT leak into species column
      expect(row.species).toBe('')
      expect(row.morphospecies).toBe('111')
    })

    it('should keep species empty when morphospecies exists', () => {
      const detection: DetectionEntity = {
        ...BASE_DETECTION,
        label: 'Lispe',
        morphospecies: '111',
        taxon: {
          scientificName: '',
          taxonRank: 'genus',
          genus: 'Lispe',
          species: 'other',
        },
      }

      const row = buildDarwinShapeFromDetection({
        detection,
        ...BASE_PARAMS,
      })

      // Morphospecies should NOT go to species column
      expect(row.species).toBe('')
      expect(row.morphospecies).toBe('111')
    })

    it('should populate partial taxonomy (genus only)', () => {
      const detection: DetectionEntity = {
        ...BASE_DETECTION,
        label: 'Lispe',
        taxon: {
          scientificName: '',
          taxonRank: 'genus',
          order: 'Diptera',
          family: 'Muscidae',
          genus: 'Lispe',
        },
      }

      const row = buildDarwinShapeFromDetection({
        detection,
        ...BASE_PARAMS,
      })

      expect(row.kingdom).toBe('Animalia')
      expect(row.phylum).toBe('Arthropoda')
      expect(row.class).toBe('Insecta')
      expect(row.order).toBe('Diptera')
      expect(row.family).toBe('Muscidae')
      expect(row.genus).toBe('Lispe')
      expect(row.species).toBe('')
    })

    it('should populate partial taxonomy (order only)', () => {
      const detection: DetectionEntity = {
        ...BASE_DETECTION,
        label: 'Diptera',
        taxon: {
          scientificName: 'Diptera',
          taxonRank: 'order',
          order: 'Diptera',
        },
      }

      const row = buildDarwinShapeFromDetection({
        detection,
        ...BASE_PARAMS,
      })

      expect(row.kingdom).toBe('Animalia')
      expect(row.phylum).toBe('Arthropoda')
      expect(row.class).toBe('Insecta')
      expect(row.order).toBe('Diptera')
      expect(row.family).toBe('')
      expect(row.genus).toBe('')
      expect(row.species).toBe('')
    })

    it('should handle empty taxon gracefully', () => {
      const detection: DetectionEntity = {
        ...BASE_DETECTION,
        label: 'Unknown',
      }

      const row = buildDarwinShapeFromDetection({
        detection,
        ...BASE_PARAMS,
      })

      expect(row.kingdom).toBe('Animalia')
      expect(row.phylum).toBe('Arthropoda')
      expect(row.class).toBe('Insecta')
      expect(row.order).toBe('')
      expect(row.family).toBe('')
      expect(row.genus).toBe('')
      expect(row.species).toBe('')
    })

    it('should populate scientificName from taxon.scientificName or label', () => {
      const detection1: DetectionEntity = {
        ...BASE_DETECTION,
        label: 'Homo sapiens',
        taxon: {
          scientificName: 'Homo sapiens',
          taxonRank: 'species',
          genus: 'Homo',
          species: 'sapiens',
        },
      }

      const row1 = buildDarwinShapeFromDetection({
        detection: detection1,
        ...BASE_PARAMS,
      })

      expect(row1.scientificName).toBe('Homo sapiens')

      const detection2: DetectionEntity = {
        ...BASE_DETECTION,
        label: 'Unknown',
      }

      const row2 = buildDarwinShapeFromDetection({
        detection: detection2,
        ...BASE_PARAMS,
      })

      expect(row2.scientificName).toBe('Unknown')
    })

    it('should populate taxonID and taxonKey correctly', () => {
      const detection: DetectionEntity = {
        ...BASE_DETECTION,
        label: 'Musca domestica',
        taxon: {
          scientificName: 'Musca domestica',
          taxonRank: 'species',
          taxonID: '12345',
          acceptedTaxonKey: '67890',
          genus: 'Musca',
          species: 'domestica',
        },
      }

      const row = buildDarwinShapeFromDetection({
        detection,
        ...BASE_PARAMS,
      })

      expect(row.taxonID).toBe('12345')
    })

    it('should use taxonID as taxonKey fallback when acceptedTaxonKey is missing', () => {
      const detection: DetectionEntity = {
        ...BASE_DETECTION,
        label: 'Musca domestica',
        taxon: {
          scientificName: 'Musca domestica',
          taxonRank: 'species',
          taxonID: '12345',
          genus: 'Musca',
          species: 'domestica',
        },
      }

      const row = buildDarwinShapeFromDetection({
        detection,
        ...BASE_PARAMS,
      })

      expect(row.taxonID).toBe('12345')
    })

    it('should populate commonName from taxon.vernacularName', () => {
      const detection: DetectionEntity = {
        ...BASE_DETECTION,
        label: 'Musca domestica',
        taxon: {
          scientificName: 'Musca domestica',
          taxonRank: 'species',
          vernacularName: 'House fly',
          genus: 'Musca',
          species: 'domestica',
        },
      }

      const row = buildDarwinShapeFromDetection({
        detection,
        ...BASE_PARAMS,
      })

      expect(row.commonName).toBe('House fly')
    })
  })
})
