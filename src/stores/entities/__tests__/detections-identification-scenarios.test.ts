import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock dependencies BEFORE importing the module under test
// Must match the exact import paths used in detections.ts
vi.mock('~/features/data-flow/3.persist/detection-persistence', () => ({
  scheduleSaveForNight: vi.fn(),
}))

vi.mock('~/stores/entities/night-summaries', () => ({
  nightSummariesStore: {
    get: vi.fn(() => ({})),
    set: vi.fn(),
  },
  buildNightSummary: vi.fn(() => ({})),
}))

vi.mock('~/features/data-flow/2.identify/species-list.store', () => ({
  speciesListsStore: {
    get: vi.fn(() => ({})),
  },
}))

vi.mock('~/stores/species/project-species-list', () => ({
  projectSpeciesSelectionStore: {
    get: vi.fn(() => ({})),
  },
}))

vi.mock('~/features/data-flow/3.persist/covers', () => ({
  normalizeMorphoKey: vi.fn((key: string) => key?.toLowerCase?.() ?? ''),
}))

vi.mock('~/features/data-flow/2.identify/species-search', () => ({
  searchSpecies: vi.fn(() => []),
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

vi.mock('~/stores/entities/photos', () => ({
  photosStore: {
    get: vi.fn(() => ({})),
  },
}))

vi.mock('~/features/data-flow/1.ingest/ingest-json', () => ({
  parseBotDetectionJsonSafely: vi.fn(() => null),
  extractPatchFilename: vi.fn(() => ''),
}))

// Mock identify.ts to avoid circular dependency issues in tests
// The actual identify.ts imports DetectionEntity from detections.ts
vi.mock('~/features/data-flow/2.identify/identify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/features/data-flow/2.identify/identify')>()
  return {
    ...actual,
    identifyDetection: actual.identifyDetection,
    identifyDetections: actual.identifyDetections,
  }
})

vi.mock('~/models/detection-shapes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/models/detection-shapes')>()
  return {
    ...actual,
    buildDetectionFromBotShape: actual.buildDetectionFromBotShape,
    updateDetectionWithTaxon: actual.updateDetectionWithTaxon,
    updateDetectionAsMorphospecies: actual.updateDetectionAsMorphospecies,
    updateDetectionAsError: actual.updateDetectionAsError,
    acceptDetection: actual.acceptDetection,
  }
})

// Import after mocks are set up
import { detectionsStore } from '../detections'
import { labelDetections } from '../detections'
import type { DetectionEntity } from '../detections'
import type { TaxonRecord } from '~/models/taxonomy/types'

describe('Detection Identification Scenarios', () => {
  beforeEach(() => {
    detectionsStore.set({})
  })

  const BASE_DETECTION = {
    id: 'patch1',
    patchId: 'patch1',
    photoId: 'photo1',
    nightId: 'project/deployment/night1',
    detectedBy: 'auto' as const,
  } as const

  const BASE_TAXON = {
    kingdom: 'Animalia',
    phylum: 'Arthropoda',
    class: 'Insecta',
  } as const

  type TaxonRecordWithName = TaxonRecord & { name?: string }

  type Scenario = {
    name: string
    initial: DetectionEntity
    action: { label?: string; taxon?: TaxonRecord }
    expected: Partial<DetectionEntity & { taxon?: TaxonRecordWithName }>
  }

  const scenarios: Scenario[] = [
    // Scenario 1: Auto detection with order/family/genus context -> morphospecies
    {
      name: 'Create morphospecies from auto detection with taxonomic context',
      initial: {
        ...BASE_DETECTION,
        label: 'Diptera',
        taxon: {
          ...BASE_TAXON,
          order: 'Diptera',
          family: undefined,
          genus: undefined,
          species: undefined,
          scientificName: 'Diptera',
          taxonRank: 'order',
        },
      },
      action: {
        label: 'Custom Morpho A',
      },
      expected: {
        label: 'Custom Morpho A',
        detectedBy: 'user',
        morphospecies: 'Custom Morpho A',
        taxon: {
          ...BASE_TAXON,
          order: 'Diptera',
          family: undefined,
          genus: undefined,
          species: undefined,
          scientificName: 'Diptera',
          taxonRank: 'order',
          name: 'Custom Morpho A',
        },
      },
    },

    // Scenario 2: Morphospecies -> Add order/family/genus (should merge, preserving morphospecies)
    {
      name: 'Add order/family/genus to existing morphospecies (should merge and preserve morphospecies)',
      initial: {
        ...BASE_DETECTION,
        label: 'Custom Morpho A',
        taxon: {
          ...BASE_TAXON,
          order: 'Diptera',
          family: undefined,
          genus: undefined,
          species: undefined,
          scientificName: 'Diptera',
          taxonRank: 'order',
        },
        detectedBy: 'user',
        morphospecies: 'Custom Morpho A',
      },
      action: {
        label: 'Lispe',
        taxon: {
          ...BASE_TAXON,
          order: 'Diptera',
          family: 'Muscidae',
          genus: 'Lispe',
          species: undefined,
          scientificName: 'Lispe',
          taxonRank: 'genus',
        },
      },
      expected: {
        label: 'Lispe',
        detectedBy: 'user',
        morphospecies: 'Custom Morpho A', // Should preserve morphospecies
        taxon: {
          ...BASE_TAXON,
          order: 'Diptera', // Should preserve/add order
          family: 'Muscidae', // Should add family
          genus: 'Lispe', // Should add genus
          species: undefined, // Should be undefined when genus is added
          scientificName: 'Lispe', // Should be genus name
          taxonRank: 'genus',
          name: 'Custom Morpho A', // Morphospecies only (not genus + morphospecies)
        },
      },
    },

    // Scenario 3: Morphospecies -> Add family (should merge)
    {
      name: 'Add family to existing morphospecies (should merge)',
      initial: {
        ...BASE_DETECTION,
        label: 'Custom Morpho B',
        taxon: {
          ...BASE_TAXON,
          order: 'Diptera',
          family: undefined,
          genus: undefined,
          species: 'Custom Morpho B',
          scientificName: 'Custom Morpho B',
          taxonRank: 'species',
        },
        detectedBy: 'user',
        morphospecies: 'Custom Morpho B',
      },
      action: {
        label: 'Tachinidae',
        taxon: {
          ...BASE_TAXON,
          order: undefined,
          family: 'Tachinidae',
          genus: undefined,
          species: undefined,
          scientificName: 'Tachinidae',
          taxonRank: 'family',
        },
      },
      expected: {
        label: 'Tachinidae',
        detectedBy: 'user',
        morphospecies: 'Custom Morpho B',
        taxon: {
          ...BASE_TAXON,
          order: 'Diptera',
          family: 'Tachinidae',
          genus: undefined,
          species: 'Custom Morpho B',
          scientificName: 'Tachinidae',
          taxonRank: 'family',
          name: 'Custom Morpho B', // Morphospecies only (no genus)
        },
      },
    },

    // Scenario 4: Auto detection without context -> cannot create morphospecies
    {
      name: 'Cannot create morphospecies without taxonomic context',
      initial: {
        ...BASE_DETECTION,
        label: 'Unknown',
        taxon: undefined,
      },
      action: {
        label: 'Custom Morpho C',
      },
      expected: {
        // Should remain unchanged - no taxonomic context
        label: 'Unknown',
        detectedBy: 'auto',
        morphospecies: undefined,
        taxon: undefined,
      },
    },

    // Scenario 5: Morphospecies -> Replace with full species taxon (should clear morphospecies)
    {
      name: 'Replace morphospecies with full species taxon (should clear morphospecies)',
      initial: {
        ...BASE_DETECTION,
        label: 'Custom Morpho D',
        taxon: {
          ...BASE_TAXON,
          order: 'Diptera',
          family: 'Muscidae',
          genus: undefined,
          species: 'Custom Morpho D',
          scientificName: 'Custom Morpho D',
          taxonRank: 'species',
        },
        detectedBy: 'user',
        morphospecies: 'Custom Morpho D',
      },
      action: {
        label: 'Musca domestica',
        taxon: {
          ...BASE_TAXON,
          order: 'Diptera',
          family: 'Muscidae',
          genus: 'Musca',
          species: 'Musca domestica',
          scientificName: 'Musca domestica',
          taxonRank: 'species',
        },
      },
      expected: {
        label: 'Musca domestica',
        detectedBy: 'user',
        morphospecies: undefined, // Should clear morphospecies
        taxon: {
          ...BASE_TAXON,
          order: 'Diptera',
          family: 'Muscidae',
          genus: 'Musca',
          species: 'domestica', // Should normalize to just epithet (not full binomial)
          scientificName: 'Musca domestica',
          taxonRank: 'species',
          name: 'Musca domestica', // Genus + epithet
        },
      },
    },

    // Scenario 6: Auto detection -> Mark as ERROR
    {
      name: 'Mark detection as ERROR',
      initial: {
        ...BASE_DETECTION,
        label: 'Diptera',
        taxon: {
          ...BASE_TAXON,
          order: 'Diptera',
          family: undefined,
          genus: undefined,
          species: undefined,
          scientificName: 'Diptera',
          taxonRank: 'order',
        },
      },
      action: {
        label: 'ERROR',
      },
      expected: {
        label: 'ERROR',
        detectedBy: 'user',
        isError: true,
        morphospecies: undefined,
        taxon: undefined, // Should clear taxon
      },
    },

    // Scenario 6b: Full taxonomy with morphospecies -> Mark as ERROR (should clear everything)
    {
      name: 'Mark detection with full taxonomy and morphospecies as ERROR (should clear all taxonomy)',
      initial: {
        ...BASE_DETECTION,
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
        detectedBy: 'user',
        morphospecies: 'Custom Morpho X',
      },
      action: {
        label: 'ERROR',
      },
      expected: {
        label: 'ERROR',
        detectedBy: 'user',
        isError: true,
        morphospecies: undefined, // Should clear morphospecies
        taxon: undefined, // Should clear all taxon fields (kingdom, phylum, class, order, family, genus, species)
      },
    },

    // Scenario 7: Morphospecies with genus -> Change order (should reset lower ranks)
    {
      name: 'Change order to morphospecies that already has genus (should reset lower ranks)',
      initial: {
        ...BASE_DETECTION,
        label: 'Lispe',
        taxon: {
          ...BASE_TAXON,
          order: 'Diptera',
          family: 'Muscidae',
          genus: 'Lispe',
          species: 'Custom Morpho A',
          scientificName: 'Lispe',
          taxonRank: 'genus',
        },
        detectedBy: 'user',
        morphospecies: 'Custom Morpho A',
      },
      action: {
        label: 'Coleoptera',
        taxon: {
          ...BASE_TAXON,
          order: 'Coleoptera',
          family: undefined,
          genus: undefined,
          species: undefined,
          scientificName: 'Coleoptera',
          taxonRank: 'order',
        },
      },
      expected: {
        label: 'Coleoptera',
        detectedBy: 'user',
        morphospecies: undefined, // Should clear morphospecies when order changes
        taxon: {
          ...BASE_TAXON,
          order: 'Coleoptera', // Should update order
          family: undefined, // Should reset family (Muscidae is Diptera-specific)
          genus: undefined, // Should reset genus (Lispe is Diptera-specific)
          species: undefined, // Should reset species
          scientificName: 'Coleoptera',
          taxonRank: 'order',
          name: 'Coleoptera',
        },
      },
    },

    // Scenario 8: Auto detection with only order -> morphospecies
    {
      name: 'Create morphospecies from auto detection with only order',
      initial: {
        ...BASE_DETECTION,
        label: 'Diptera',
        taxon: {
          ...BASE_TAXON,
          order: 'Diptera',
          family: undefined,
          genus: undefined,
          species: undefined,
          scientificName: 'Diptera',
          taxonRank: 'order',
        },
      },
      action: {
        label: 'Custom Morpho E',
      },
      expected: {
        label: 'Custom Morpho E',
        detectedBy: 'user',
        morphospecies: 'Custom Morpho E',
        taxon: {
          ...BASE_TAXON,
          order: 'Diptera',
          family: undefined,
          genus: undefined,
          species: undefined,
          scientificName: 'Diptera',
          taxonRank: 'order',
          name: 'Custom Morpho E', // Morphospecies name, but taxon hierarchy preserved
        },
      },
    },

    // Scenario 9: Two-step identification flow (real-world scenario)
    // Step 1: Auto detection -> morphospecies
    {
      name: 'Step 1: Create morphospecies from auto detection (real-world flow)',
      initial: {
        ...BASE_DETECTION,
        label: 'Hymenoptera',
        taxon: {
          ...BASE_TAXON,
          order: 'Hymenoptera',
          family: undefined,
          genus: undefined,
          species: undefined,
          scientificName: 'Hymenoptera',
          taxonRank: 'order',
        },
      },
      action: {
        label: '111',
      },
      expected: {
        label: '111',
        detectedBy: 'user',
        morphospecies: '111',
        taxon: {
          ...BASE_TAXON,
          order: 'Hymenoptera',
          family: undefined,
          genus: undefined,
          species: undefined,
          scientificName: 'Hymenoptera',
          taxonRank: 'order',
          name: '111', // Morphospecies name, but taxon hierarchy preserved
        },
      },
    },

    // Scenario 10: Two-step identification flow (continuation)
    // Step 2: Add genus to existing morphospecies
    {
      name: 'Step 2: Add genus Lispe to morphospecies 111 (real-world flow)',
      initial: {
        ...BASE_DETECTION,
        label: '111',
        taxon: {
          ...BASE_TAXON,
          order: 'Hymenoptera',
          family: undefined,
          genus: undefined,
          species: '111',
          scientificName: '111',
          taxonRank: 'species',
        },
        detectedBy: 'user',
        morphospecies: '111',
      },
      action: {
        label: 'Lispe',
        taxon: {
          ...BASE_TAXON,
          order: 'Diptera', // Genus comes with its order
          family: 'Muscidae', // Genus comes with its family
          genus: 'Lispe',
          species: undefined,
          scientificName: '', // Empty for genus level (after normalization) - will be set to genus name
          taxonRank: 'genus',
        },
      },
      expected: {
        label: 'Lispe',
        detectedBy: 'user',
        morphospecies: '111', // Should preserve morphospecies
        taxon: {
          ...BASE_TAXON,
          order: 'Diptera', // Should use order from genus identification (Lispe is Diptera, not Hymenoptera)
          family: 'Muscidae', // Should use family from genus identification
          genus: 'Lispe', // Should add new genus
          species: undefined, // Should be undefined when genus is added
          scientificName: 'Lispe', // Should be set to genus name
          taxonRank: 'genus',
          name: '111', // Morphospecies only (not genus + morphospecies)
        },
      },
    },

    // Scenario 11: Three-step identification flow (Anastrepha case)
    // Step 1: Identify as genus Anastrepha (after auto detection as Diptera)
    {
      name: 'Step 1: Identify as genus Anastrepha (should preserve order and add family/genus)',
      initial: {
        ...BASE_DETECTION,
        label: 'Diptera',
        taxon: {
          ...BASE_TAXON,
          order: 'Diptera',
          family: undefined,
          genus: undefined,
          species: undefined,
          scientificName: 'Diptera',
          taxonRank: 'order',
        },
        detectedBy: 'auto',
      },
      action: {
        label: 'Anastrepha',
        taxon: {
          ...BASE_TAXON,
          order: 'Diptera',
          family: 'Tephritidae',
          genus: 'Anastrepha',
          species: undefined,
          scientificName: 'Anastrepha',
          taxonRank: 'genus',
        },
      },
      expected: {
        label: 'Anastrepha',
        detectedBy: 'user',
        taxon: {
          ...BASE_TAXON,
          order: 'Diptera', // Should preserve order
          family: 'Tephritidae', // Should add family
          genus: 'Anastrepha', // Should add genus
          species: undefined, // Should be undefined when genus is added
          scientificName: 'Anastrepha',
          taxonRank: 'genus',
          name: 'Anastrepha',
        },
      },
    },

    // Scenario 12: Three-step identification flow (continuation)
    // Step 2: Manual species classification after genus identification
    {
      name: 'Step 2: Manual species classification after genus (should preserve order/family/genus and add species)',
      initial: {
        ...BASE_DETECTION,
        label: 'Anastrepha',
        taxon: {
          ...BASE_TAXON,
          order: 'Diptera',
          family: 'Tephritidae',
          genus: 'Anastrepha',
          species: undefined,
          scientificName: 'Anastrepha',
          taxonRank: 'genus',
        },
        detectedBy: 'user',
      },
      action: {
        label: 'Anastrepha serpentina',
        taxon: {
          ...BASE_TAXON,
          order: undefined, // Manual species entry doesn't include higher ranks
          family: undefined,
          genus: undefined,
          species: 'Anastrepha serpentina', // Full binomial name
          scientificName: 'Anastrepha serpentina',
          taxonRank: 'species',
        },
      },
      expected: {
        label: 'Anastrepha serpentina',
        detectedBy: 'user',
        morphospecies: undefined,
        taxon: {
          ...BASE_TAXON,
          order: 'Diptera', // Should preserve order from existing taxonomy
          family: 'Tephritidae', // Should preserve family from existing taxonomy
          genus: 'Anastrepha', // Should preserve genus from existing taxonomy
          species: 'serpentina', // Should normalize to just epithet (not full binomial)
          scientificName: 'Anastrepha serpentina', // Full binomial preserved
          taxonRank: 'species',
          name: 'Anastrepha serpentina', // Genus + epithet
        },
      },
    },

    // Scenario 13: Species field normalization - selecting from list with full binomial in species field
    {
      name: 'Select species from list with full binomial in species field (should normalize to epithet only)',
      initial: {
        ...BASE_DETECTION,
        label: 'Diptera',
        taxon: {
          ...BASE_TAXON,
          order: 'Diptera',
          family: undefined,
          genus: undefined,
          species: undefined,
          scientificName: 'Diptera',
          taxonRank: 'order',
        },
        detectedBy: 'auto',
      },
      action: {
        label: 'Anastrepha pallens',
        taxon: {
          ...BASE_TAXON,
          order: 'Diptera',
          family: 'Tephritidae',
          genus: 'Anastrepha',
          species: 'Anastrepha pallens', // Full binomial in species field (from CSV)
          scientificName: 'Anastrepha pallens',
          taxonRank: 'species',
        },
      },
      expected: {
        label: 'Anastrepha pallens',
        detectedBy: 'user',
        taxon: {
          ...BASE_TAXON,
          order: 'Diptera',
          family: 'Tephritidae',
          genus: 'Anastrepha',
          species: 'pallens', // Should normalize to just epithet
          scientificName: 'Anastrepha pallens', // Full binomial preserved
          taxonRank: 'species',
          name: 'Anastrepha pallens', // Genus + epithet
        },
      },
    },

    // Scenario 14: Species field normalization - manual entry with full binomial
    {
      name: 'Manual species entry with full binomial (should parse to genus and epithet)',
      initial: {
        ...BASE_DETECTION,
        label: 'Anastrepha',
        taxon: {
          ...BASE_TAXON,
          order: 'Diptera',
          family: 'Tephritidae',
          genus: 'Anastrepha',
          species: undefined,
          scientificName: 'Anastrepha',
          taxonRank: 'genus',
        },
        detectedBy: 'user',
      },
      action: {
        label: 'Anastrepha pallens',
        taxon: {
          ...BASE_TAXON,
          order: undefined, // Manual entry doesn't include higher ranks
          family: undefined,
          genus: undefined,
          species: 'Anastrepha pallens', // Full binomial entered manually
          scientificName: 'Anastrepha pallens',
          taxonRank: 'species',
        },
      },
      expected: {
        label: 'Anastrepha pallens',
        detectedBy: 'user',
        taxon: {
          ...BASE_TAXON,
          order: 'Diptera', // Should preserve from existing
          family: 'Tephritidae', // Should preserve from existing
          genus: 'Anastrepha', // Should preserve from existing (matches parsed genus)
          species: 'pallens', // Should normalize to just epithet
          scientificName: 'Anastrepha pallens', // Full binomial preserved
          taxonRank: 'species',
          name: 'Anastrepha pallens', // Genus + epithet
        },
      },
    },

    // Scenario 15: Species field normalization - manual entry with full binomial, no existing genus
    {
      name: 'Manual species entry with full binomial, no existing genus (should parse to genus and epithet)',
      initial: {
        ...BASE_DETECTION,
        label: 'Diptera',
        taxon: {
          ...BASE_TAXON,
          order: 'Diptera',
          family: undefined,
          genus: undefined,
          species: undefined,
          scientificName: 'Diptera',
          taxonRank: 'order',
        },
        detectedBy: 'auto',
      },
      action: {
        label: 'Anastrepha pallens',
        taxon: {
          ...BASE_TAXON,
          order: undefined,
          family: undefined,
          genus: undefined,
          species: 'Anastrepha pallens', // Full binomial entered manually
          scientificName: 'Anastrepha pallens',
          taxonRank: 'species',
        },
      },
      expected: {
        label: 'Anastrepha pallens',
        detectedBy: 'user',
        taxon: {
          ...BASE_TAXON,
          order: 'Diptera', // Should preserve from existing
          family: undefined,
          genus: 'Anastrepha', // Should extract from binomial
          species: 'pallens', // Should normalize to just epithet
          scientificName: 'Anastrepha pallens', // Full binomial preserved
          taxonRank: 'species',
          name: 'Anastrepha pallens', // Genus + epithet
        },
      },
    },

    // Scenario 16: Species field normalization - selecting species with epithet only (already correct)
    {
      name: 'Select species from list with epithet only in species field (should remain as-is)',
      initial: {
        ...BASE_DETECTION,
        label: 'Diptera',
        taxon: {
          ...BASE_TAXON,
          order: 'Diptera',
          family: undefined,
          genus: undefined,
          species: undefined,
          scientificName: 'Diptera',
          taxonRank: 'order',
        },
        detectedBy: 'auto',
      },
      action: {
        label: 'Anastrepha pallens',
        taxon: {
          ...BASE_TAXON,
          order: 'Diptera',
          family: 'Tephritidae',
          genus: 'Anastrepha',
          species: 'pallens', // Already just epithet (correct format)
          scientificName: 'Anastrepha pallens',
          taxonRank: 'species',
        },
      },
      expected: {
        label: 'Anastrepha pallens',
        detectedBy: 'user',
        taxon: {
          ...BASE_TAXON,
          order: 'Diptera',
          family: 'Tephritidae',
          genus: 'Anastrepha',
          species: 'pallens', // Should remain as-is (already correct)
          scientificName: 'Anastrepha pallens',
          taxonRank: 'species',
          name: 'Anastrepha pallens', // Genus + epithet
        },
      },
    },
  ]

  scenarios.forEach((scenario) => {
    it(scenario.name, () => {
      const initialStore: Record<string, DetectionEntity> = {
        [scenario.initial.id]: scenario.initial as DetectionEntity,
      }
      detectionsStore.set(initialStore)

      labelDetections({
        detectionIds: [scenario.initial.id],
        label: scenario.action.label,
        taxon: scenario.action.taxon,
      })

      const result = detectionsStore.get()[scenario.initial.id]

      // Check label
      if (scenario.expected.label !== undefined) {
        expect(result.label).toBe(scenario.expected.label)
      }

      // Check detectedBy
      if (scenario.expected.detectedBy !== undefined) {
        expect(result.detectedBy).toBe(scenario.expected.detectedBy)
      }

      // Check isError
      if (scenario.expected.isError !== undefined) {
        expect(result.isError).toBe(scenario.expected.isError)
      }

      // Check morphospecies
      if (scenario.expected.morphospecies !== undefined) {
        expect(result.morphospecies).toBe(scenario.expected.morphospecies)
      }

      // Check taxon
      if (scenario.expected.taxon !== undefined) {
        expect(result.taxon).toBeDefined()
        if (scenario.expected.taxon === null) {
          expect(result.taxon).toBeNull()
        } else {
          const expectedTaxon = scenario.expected.taxon as TaxonRecordWithName
          expect(result.taxon).toMatchObject(expectedTaxon)
        }
      } else if (scenario.expected.taxon === null) {
        expect(result.taxon).toBeUndefined()
      }

      // Check identifiedAt is set when detectedBy is 'user'
      if (scenario.expected.detectedBy === 'user') {
        expect(result.identifiedAt).toBeDefined()
        expect(typeof result.identifiedAt).toBe('number')
      }
    })
  })
})
