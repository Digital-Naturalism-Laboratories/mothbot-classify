import { describe, it, expect, beforeEach, vi } from 'vitest'

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

import { detectionsStore, acceptDetections } from '../detections'
import type { DetectionEntity } from '../detections'

describe('acceptDetections', () => {
  beforeEach(() => {
    detectionsStore.set({})
  })

  it('marks detections as user without changing taxonomy', () => {
    const initial: DetectionEntity = {
      id: 'patch1.jpg',
      patchId: 'patch1.jpg',
      photoId: 'photo1.jpg',
      nightId: 'project/site/deployment/night1',
      detectedBy: 'auto',
      label: 'Lepidoptera',
      taxon: {
        kingdom: 'Animalia',
        phylum: 'Arthropoda',
        class: 'Insecta',
        order: 'Lepidoptera',
        family: 'Noctuidae',
        genus: 'Agrotis',
        scientificName: 'Agrotis ipsilon',
        taxonRank: 'species',
      },
    }

    detectionsStore.set({ [initial.id]: initial })

    acceptDetections({ detectionIds: [initial.id] })

    const result = detectionsStore.get()[initial.id]
    expect(result.detectedBy).toBe('user')
    expect(result.classificationType).toBe('accept')
    expect(result.identifiedAt).toBeDefined()
    expect(result.label).toBe('Lepidoptera')
    expect(result.taxon).toMatchObject({
      order: 'Lepidoptera',
      family: 'Noctuidae',
      genus: 'Agrotis',
    })
  })

  it('accepts detections without order or species list', () => {
    const initial: DetectionEntity = {
      id: 'patch2.jpg',
      patchId: 'patch2.jpg',
      photoId: 'photo2.jpg',
      nightId: 'project/site/deployment/night1',
      detectedBy: 'auto',
      label: 'Unknown',
    }

    detectionsStore.set({ [initial.id]: initial })

    acceptDetections({ detectionIds: [initial.id] })

    const result = detectionsStore.get()[initial.id]
    expect(result.detectedBy).toBe('user')
    expect(result.classificationType).toBe('accept')
    expect(result.label).toBe('Unknown')
  })
})
