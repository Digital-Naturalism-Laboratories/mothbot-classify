import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock dependencies
vi.mock('~/features/data-flow/3.persist/detection-persistence', async () => {
  return {
    scheduleSaveForNight: vi.fn(),
  }
})

vi.mock('~/stores/entities/night-summaries', async () => {
  return {
    nightSummariesStore: {
      get: vi.fn(() => ({})),
      set: vi.fn(),
    },
    buildNightSummary: vi.fn((params: { nightId: string; detections: any[] }) => ({
      nightId: params.nightId,
      totalDetections: params.detections.length,
      totalIdentified: params.detections.filter((d: any) => d?.detectedBy === 'user').length,
    })),
  }
})

vi.mock('~/features/data-flow/2.identify/species-list.store', async () => {
  return {
    speciesListsStore: {
      get: vi.fn(() => ({})),
    },
  }
})

vi.mock('~/stores/species/project-species-list', async () => {
  return {
    projectSpeciesSelectionStore: {
      get: vi.fn(() => ({})),
    },
  }
})

import { detectionsStore, labelDetections, type DetectionEntity } from '~/stores/entities/detections'
import { buildDarwinShapeFromDetection } from '~/features/data-flow/4.export/darwin-csv'
import { deriveTaxonNameFromDetection } from '~/models/taxonomy/extract'
import { getSpeciesValue, getValidScientificName } from '~/models/taxonomy/morphospecies'
import { buildIdentifiedJsonShapeFromDetection, buildDetectionFromIdentifiedJsonShape } from '~/models/detection-shapes'
import type { TaxonRecord } from '~/features/data-flow/2.identify/species-list.store'

/**
 * Integration tests for the full data flow:
 * Ingest (bot detection) → Identification (user labels) → Export (Darwin CSV)
 *
 * These tests verify that:
 * 1. Morphospecies codes don't leak into species/scientificName columns
 * 2. Species names don't get duplicated (e.g., "Pygoda Pygoda irrorate")
 * 3. Deployment column is properly populated
 */
describe('Data Flow Integration Tests', () => {
  beforeEach(() => {
    detectionsStore.set({})
  })

  const BASE_DETECTION = {
    id: 'patch1',
    patchId: 'patch1',
    photoId: 'photo1.jpg',
    nightId: 'Dinacon2025/Dinacon2025_Les_BeachPalm_grupoKite_2025-06-23/2025-06-22',
    detectedBy: 'auto' as const,
  } as const

  const BASE_TAXON = {
    kingdom: 'Animalia',
    phylum: 'Arthropoda',
    class: 'Insecta',
  } as const

  const BASE_EXPORT_PARAMS = {
    patch: { id: 'patch1', imageFile: { path: 'patches/patch1.jpg' } } as any,
    photo: { id: 'photo1.jpg' } as any,
    nightId: BASE_DETECTION.nightId,
    nightDiskPath: 'Dinacon2025/Dinacon2025_Les_BeachPalm_grupoKite_2025-06-23/2025-06-22',
  } as const

  describe('Morphospecies Export Isolation', () => {
    it('auto detection (Thysanoptera) → morphospecies "111" → export: species="", morphospecies="111"', () => {
      // Setup: Auto detection with order-only taxonomy
      const detection: DetectionEntity = {
        ...BASE_DETECTION,
        label: 'Thysanoptera',
        taxon: {
          ...BASE_TAXON,
          order: 'Thysanoptera',
          scientificName: 'Thysanoptera',
          taxonRank: 'order',
        },
      }
      detectionsStore.set({ [detection.id]: detection })

      // Action: User identifies as morphospecies "111"
      labelDetections({
        detectionIds: [detection.id],
        label: '111',
      })

      // Get updated detection
      const updated = detectionsStore.get()[detection.id]

      // Verify identification state
      expect(updated.morphospecies).toBe('111')
      expect(updated.detectedBy).toBe('user')

      // Verify export
      const row = buildDarwinShapeFromDetection({
        detection: updated,
        ...BASE_EXPORT_PARAMS,
      })

      // CRITICAL: species column should be empty, morphospecies should have the value
      expect(row.species).toBe('')
      expect(row.morphospecies).toBe('111')
      expect(row.order).toBe('Thysanoptera')

      // scientificName should NOT contain "111"
      expect(row.scientificName).not.toContain('111')
    })

    it('morphospecies should not appear in scientificName column', () => {
      const detection: DetectionEntity = {
        ...BASE_DETECTION,
        label: '111',
        morphospecies: '111',
        taxon: {
          ...BASE_TAXON,
          order: 'Diptera',
          genus: 'Lispe',
          scientificName: 'Lispe',
          taxonRank: 'genus',
        },
      }

      const scientificName = getValidScientificName({ detection })

      // Should return genus, not morphospecies
      expect(scientificName).toBe('Lispe')
      expect(scientificName).not.toContain('111')
    })

    it('scientificName should never contain numbers', () => {
      const detectionWithNumber: DetectionEntity = {
        ...BASE_DETECTION,
        label: '111',
        taxon: {
          scientificName: '111',
          taxonRank: 'species',
        },
      }

      const scientificName = getValidScientificName({ detection: detectionWithNumber })
      expect(scientificName).toBe('')
    })
  })

  describe('Species Name Duplication Prevention', () => {
    it('should not duplicate genus in name when species already contains it', () => {
      // This tests the bug: "Pygoda Pygoda irrorate" → should be "Pygoda irrorate"
      const detection: DetectionEntity = {
        ...BASE_DETECTION,
        label: 'Pygoda irrorate',
        taxon: {
          ...BASE_TAXON,
          order: 'Lepidoptera',
          family: 'Geometridae',
          genus: 'Pygoda',
          species: 'Pygoda irrorate', // Full binomial in species field (bug scenario)
          scientificName: 'Pygoda irrorate',
          taxonRank: 'species',
        },
      }

      const name = deriveTaxonNameFromDetection({ detection })

      // Should NOT be "Pygoda Pygoda irrorate"
      expect(name).toBe('Pygoda irrorate')
      expect(name).not.toBe('Pygoda Pygoda irrorate')
    })

    it('should correctly format species when species field has only epithet', () => {
      const detection: DetectionEntity = {
        ...BASE_DETECTION,
        label: 'Musca domestica',
        taxon: {
          ...BASE_TAXON,
          order: 'Diptera',
          family: 'Muscidae',
          genus: 'Musca',
          species: 'domestica', // Just epithet (correct format)
          scientificName: 'Musca domestica',
          taxonRank: 'species',
        },
      }

      const name = deriveTaxonNameFromDetection({ detection })

      expect(name).toBe('Musca domestica')
    })
  })

  describe('Deployment Column Population', () => {
    it('should populate deployment column from nightId (remove trailing night date)', () => {
      const detection: DetectionEntity = {
        ...BASE_DETECTION,
        label: 'Diptera',
        taxon: {
          ...BASE_TAXON,
          order: 'Diptera',
          scientificName: 'Diptera',
          taxonRank: 'order',
        },
      }

      const row = buildDarwinShapeFromDetection({
        detection,
        ...BASE_EXPORT_PARAMS,
      })

      // deployment should be parentEventID without the trailing night date segment
      // nightId: Dinacon2025/Dinacon2025_Les_BeachPalm/grupoKite_2025-06-23/2025-06-22
      // datasetID/parentEventID: Dinacon2025_Dinacon2025_Les_BeachPalm_grupoKite_2025-06-23_2025-06-22
      // deployment: Dinacon2025_Dinacon2025_Les_BeachPalm_grupoKite_2025-06-23 (without _2025-06-22)
      expect(row.deployment).not.toBe('')
      expect(row.deployment).toBe('Dinacon2025_Dinacon2025_Les_BeachPalm_grupoKite_2025-06-23')
      // Should NOT end with the night date (2025-06-22)
      expect(row.deployment).not.toContain('2025-06-22')
    })
  })

  describe('Full Identification Flows', () => {
    it('auto Diptera → genus Lispe → morphospecies "111" preserves taxonomy', () => {
      // Step 1: Auto detection with order
      const initial: DetectionEntity = {
        ...BASE_DETECTION,
        label: 'Diptera',
        taxon: {
          ...BASE_TAXON,
          order: 'Diptera',
          scientificName: 'Diptera',
          taxonRank: 'order',
        },
      }
      detectionsStore.set({ [initial.id]: initial })

      // Step 2: User adds morphospecies "111"
      labelDetections({
        detectionIds: [initial.id],
        label: '111',
      })

      let updated = detectionsStore.get()[initial.id]
      expect(updated.morphospecies).toBe('111')
      expect(updated.taxon?.order).toBe('Diptera')

      // Step 3: User adds genus Lispe
      labelDetections({
        detectionIds: [initial.id],
        label: 'Lispe',
        taxon: {
          ...BASE_TAXON,
          order: 'Diptera',
          family: 'Muscidae',
          genus: 'Lispe',
          scientificName: 'Lispe',
          taxonRank: 'genus',
        },
      })

      updated = detectionsStore.get()[initial.id]

      // Morphospecies should be preserved
      expect(updated.morphospecies).toBe('111')
      expect(updated.taxon?.genus).toBe('Lispe')
      expect(updated.taxon?.family).toBe('Muscidae')
      expect(updated.taxon?.order).toBe('Diptera')

      // Verify export
      const row = buildDarwinShapeFromDetection({
        detection: updated,
        ...BASE_EXPORT_PARAMS,
      })

      expect(row.genus).toBe('Lispe')
      expect(row.family).toBe('Muscidae')
      expect(row.order).toBe('Diptera')
      expect(row.species).toBe('') // No species, just morphospecies
      expect(row.morphospecies).toBe('111')
      expect(row.name).toBe('111') // Morphospecies only for name column (not "genus morphospecies")
    })

    it('auto Diptera → full species Musca domestica clears morphospecies', () => {
      // Start with morphospecies
      const initial: DetectionEntity = {
        ...BASE_DETECTION,
        label: '111',
        morphospecies: '111',
        taxon: {
          ...BASE_TAXON,
          order: 'Diptera',
          scientificName: 'Diptera',
          taxonRank: 'order',
        },
        detectedBy: 'user',
      }
      detectionsStore.set({ [initial.id]: initial })

      // User identifies as full species
      labelDetections({
        detectionIds: [initial.id],
        label: 'Musca domestica',
        taxon: {
          ...BASE_TAXON,
          order: 'Diptera',
          family: 'Muscidae',
          genus: 'Musca',
          species: 'domestica',
          scientificName: 'Musca domestica',
          taxonRank: 'species',
        },
      })

      const updated = detectionsStore.get()[initial.id]

      // Morphospecies should be cleared
      expect(updated.morphospecies).toBeUndefined()
      expect(updated.taxon?.genus).toBe('Musca')
      expect(updated.taxon?.species).toBe('domestica')

      // Verify export
      const row = buildDarwinShapeFromDetection({
        detection: updated,
        ...BASE_EXPORT_PARAMS,
      })

      expect(row.genus).toBe('Musca')
      expect(row.species).toBe('domestica')
      expect(row.morphospecies).toBe('')
      expect(row.scientificName).toBe('Musca domestica')
      expect(row.name).toBe('Musca domestica')
    })

    it('ERROR marking clears all taxonomy from export', () => {
      const initial: DetectionEntity = {
        ...BASE_DETECTION,
        label: 'Diptera',
        taxon: {
          ...BASE_TAXON,
          order: 'Diptera',
          scientificName: 'Diptera',
          taxonRank: 'order',
        },
      }
      detectionsStore.set({ [initial.id]: initial })

      // Mark as ERROR
      labelDetections({
        detectionIds: [initial.id],
        label: 'ERROR',
      })

      const updated = detectionsStore.get()[initial.id]

      expect(updated.isError).toBe(true)
      expect(updated.label).toBe('ERROR')

      // Verify export
      const row = buildDarwinShapeFromDetection({
        detection: updated,
        ...BASE_EXPORT_PARAMS,
      })

      expect(row.kingdom).toBe('')
      expect(row.phylum).toBe('')
      expect(row.class).toBe('')
      expect(row.order).toBe('')
      expect(row.family).toBe('')
      expect(row.genus).toBe('')
      expect(row.species).toBe('')
      expect(row.scientificName).toBe('')
      expect(row.name).toBe('ERROR')
    })
  })

  describe('Morphospecies Persistence Round-Trip', () => {
    it('morphospecies survives save/load cycle via _identified.json', () => {
      // Setup: Detection with morphospecies
      const original: DetectionEntity = {
        ...BASE_DETECTION,
        label: '111',
        morphospecies: '111',
        detectedBy: 'user',
        identifiedAt: Date.now(),
        taxon: {
          ...BASE_TAXON,
          order: 'Diptera',
          scientificName: 'Diptera',
          taxonRank: 'order',
        },
      }

      // Step 1: Build JSON shape (simulates saving to _identified.json)
      const shape = buildIdentifiedJsonShapeFromDetection({ detection: original, identifierHuman: 'test' })

      // Verify morphospecies is in the JSON shape
      expect(shape.morphospecies).toBe('111')
      expect(shape.order).toBe('Diptera')

      // Step 2: Load from JSON shape (simulates loading from _identified.json)
      const photo = { id: BASE_DETECTION.photoId, nightId: BASE_DETECTION.nightId } as any
      const loaded = buildDetectionFromIdentifiedJsonShape({ shape, photo, existingDetection: undefined })

      // Verify morphospecies was restored
      expect(loaded.morphospecies).toBe('111')
      expect(loaded.detectedBy).toBe('user')
      expect(loaded.taxon?.order).toBe('Diptera')
    })

    it('morphospecies is preserved when loading with existing detection', () => {
      // Setup: Existing auto detection
      const existing: DetectionEntity = {
        ...BASE_DETECTION,
        label: 'Diptera',
        taxon: {
          ...BASE_TAXON,
          order: 'Diptera',
          scientificName: 'Diptera',
          taxonRank: 'order',
        },
      }

      // User-identified shape with morphospecies
      const shape = {
        patch_path: 'patches/patch1.jpg',
        morphospecies: '111',
        order: 'Diptera',
        identifier_human: 'test',
        timestamp_ID_human: Date.now(),
      }

      const photo = { id: BASE_DETECTION.photoId, nightId: BASE_DETECTION.nightId } as any
      const loaded = buildDetectionFromIdentifiedJsonShape({ shape, photo, existingDetection: existing })

      expect(loaded.morphospecies).toBe('111')
      expect(loaded.taxon?.order).toBe('Diptera')
    })

    it('JSON shape includes morphospecies field when present', () => {
      const detection: DetectionEntity = {
        ...BASE_DETECTION,
        label: 'Morpho123',
        morphospecies: 'Morpho123',
        detectedBy: 'user',
        taxon: {
          ...BASE_TAXON,
          order: 'Lepidoptera',
          family: 'Geometridae',
          genus: 'Pygoda',
          scientificName: 'Pygoda',
          taxonRank: 'genus',
        },
      }

      const shape = buildIdentifiedJsonShapeFromDetection({ detection, identifierHuman: 'user' })

      // Verify all fields are present
      expect(shape.morphospecies).toBe('Morpho123')
      expect(shape.genus).toBe('Pygoda')
      expect(shape.family).toBe('Geometridae')
      expect(shape.order).toBe('Lepidoptera')
      expect(shape.identifier_human).toBe('user')
    })

    it('JSON shape omits morphospecies field when not present', () => {
      const detection: DetectionEntity = {
        ...BASE_DETECTION,
        label: 'Musca domestica',
        detectedBy: 'user',
        taxon: {
          ...BASE_TAXON,
          order: 'Diptera',
          genus: 'Musca',
          species: 'domestica',
          scientificName: 'Musca domestica',
          taxonRank: 'species',
        },
      }

      const shape = buildIdentifiedJsonShapeFromDetection({ detection, identifierHuman: 'user' })

      // morphospecies should be undefined (not in JSON)
      expect(shape.morphospecies).toBeUndefined()
      expect(shape.species).toBe('domestica')
    })
  })

  describe('getSpeciesValue isolation', () => {
    it('returns empty when morphospecies exists', () => {
      const detection: DetectionEntity = {
        ...BASE_DETECTION,
        morphospecies: '111',
        taxon: {
          scientificName: 'Lispe',
          taxonRank: 'genus',
          genus: 'Lispe',
          species: 'other', // This should be ignored
        },
      }

      const species = getSpeciesValue({ detection })
      expect(species).toBe('')
    })

    it('returns taxon species when no morphospecies', () => {
      const detection: DetectionEntity = {
        ...BASE_DETECTION,
        taxon: {
          scientificName: 'Musca domestica',
          taxonRank: 'species',
          genus: 'Musca',
          species: 'domestica',
        },
      }

      const species = getSpeciesValue({ detection })
      expect(species).toBe('domestica')
    })
  })

  describe('Export Sanitization (cleaning up inconsistent local data)', () => {
    it('cleans up species field containing morphospecies code (no morphospecies field set)', () => {
      // This simulates corrupted local data where species = morphospecies code
      const detection: DetectionEntity = {
        ...BASE_DETECTION,
        label: 'Diptera',
        taxon: {
          ...BASE_TAXON,
          order: 'Diptera',
          species: '111', // Morphospecies code in species field (data corruption)
          scientificName: 'Diptera',
          taxonRank: 'order',
        },
      }

      const row = buildDarwinShapeFromDetection({
        detection,
        ...BASE_EXPORT_PARAMS,
      })

      // Species should be sanitized - numeric codes don't belong in species
      expect(row.species).toBe('')
      expect(row.order).toBe('Diptera')
    })

    it('cleans up species field containing alphanumeric morphospecies code', () => {
      const detection: DetectionEntity = {
        ...BASE_DETECTION,
        taxon: {
          ...BASE_TAXON,
          order: 'Lepidoptera',
          genus: 'Pygoda',
          species: 'sp1', // Morphospecies code pattern
          scientificName: 'Pygoda',
          taxonRank: 'genus',
        },
      }

      const row = buildDarwinShapeFromDetection({
        detection,
        ...BASE_EXPORT_PARAMS,
      })

      // "sp1" looks like a morphospecies code
      expect(row.species).toBe('')
      expect(row.genus).toBe('Pygoda')
    })

    it('cleans up scientificName containing numeric morphospecies', () => {
      const detection: DetectionEntity = {
        ...BASE_DETECTION,
        taxon: {
          ...BASE_TAXON,
          order: 'Diptera',
          scientificName: '111', // Morphospecies code in scientificName
          taxonRank: 'species',
        },
      }

      const scientificName = getValidScientificName({ detection })
      expect(scientificName).toBe('')
    })

    it('preserves valid species epithet like "domestica"', () => {
      const detection: DetectionEntity = {
        ...BASE_DETECTION,
        taxon: {
          ...BASE_TAXON,
          order: 'Diptera',
          family: 'Muscidae',
          genus: 'Musca',
          species: 'domestica',
          scientificName: 'Musca domestica',
          taxonRank: 'species',
        },
      }

      const row = buildDarwinShapeFromDetection({
        detection,
        ...BASE_EXPORT_PARAMS,
      })

      expect(row.species).toBe('domestica')
      expect(row.scientificName).toBe('Musca domestica')
    })

    it('preserves valid species epithet with letters like "irrorate"', () => {
      const detection: DetectionEntity = {
        ...BASE_DETECTION,
        taxon: {
          ...BASE_TAXON,
          order: 'Lepidoptera',
          genus: 'Pygoda',
          species: 'irrorate',
          scientificName: 'Pygoda irrorate',
          taxonRank: 'species',
        },
      }

      const row = buildDarwinShapeFromDetection({
        detection,
        ...BASE_EXPORT_PARAMS,
      })

      expect(row.species).toBe('irrorate')
      expect(row.genus).toBe('Pygoda')
    })

    it('name column: morphospecies only (not genus + morphospecies) even with genus present', () => {
      // Simulates the bug from the export: "Forcipomyia Forcipomyia1" should be just "Forcipomyia1"
      const detection: DetectionEntity = {
        ...BASE_DETECTION,
        morphospecies: 'Forcipomyia1',
        taxon: {
          ...BASE_TAXON,
          order: 'Diptera',
          family: 'Ceratopogonidae',
          genus: 'Forcipomyia',
          scientificName: 'Forcipomyia',
          taxonRank: 'genus',
        },
      }

      const row = buildDarwinShapeFromDetection({
        detection,
        ...BASE_EXPORT_PARAMS,
      })

      // Name should be morphospecies only, not "genus morphospecies"
      expect(row.name).toBe('Forcipomyia1')
      expect(row.name).not.toBe('Forcipomyia Forcipomyia1')
      expect(row.genus).toBe('Forcipomyia')
      expect(row.morphospecies).toBe('Forcipomyia1')
    })

    it('name column: scientific name when species exists (no morphospecies)', () => {
      const detection: DetectionEntity = {
        ...BASE_DETECTION,
        taxon: {
          ...BASE_TAXON,
          order: 'Diptera',
          family: 'Muscidae',
          genus: 'Musca',
          species: 'domestica',
          scientificName: 'Musca domestica',
          taxonRank: 'species',
        },
      }

      const row = buildDarwinShapeFromDetection({
        detection,
        ...BASE_EXPORT_PARAMS,
      })

      // Name should be scientific name (genus + species) when species exists
      expect(row.name).toBe('Musca domestica')
      expect(row.species).toBe('domestica')
      expect(row.genus).toBe('Musca')
    })
  })
})

