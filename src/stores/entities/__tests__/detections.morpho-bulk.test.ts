import { beforeEach, describe, expect, it, vi } from 'vitest'

const summaryState = vi.hoisted(() => ({
  current: {} as Record<string, any>,
}))

const hydratedByNightState = vi.hoisted(() => ({
  current: {} as Record<string, Record<string, any>>,
}))

const scheduleSaveForNightMock = vi.hoisted(() => vi.fn())
const setMorphoLinkMock = vi.hoisted(() => vi.fn())
const clearMorphoCoverMock = vi.hoisted(() => vi.fn())

vi.mock('~/features/data-flow/3.persist/detection-persistence', () => ({
  scheduleSaveForNight: scheduleSaveForNightMock,
}))

vi.mock('~/stores/entities/night-summaries', () => ({
  nightSummariesStore: {
    get: vi.fn(() => summaryState.current),
    set: vi.fn((next) => {
      summaryState.current = next
    }),
  },
  buildNightSummary: vi.fn(({ nightId, detections }) => {
    const morphoCounts: Record<string, number> = {}
    for (const detection of detections ?? []) {
      const morpho = String(detection?.morphospecies ?? '').trim().toLowerCase()
      if (!morpho || detection?.detectedBy !== 'user') continue
      morphoCounts[morpho] = (morphoCounts[morpho] || 0) + 1
    }

    return {
      nightId,
      totalDetections: detections.length,
      totalIdentified: detections.filter((d: any) => d?.detectedBy === 'user').length,
      morphoCounts,
    }
  }),
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

vi.mock('~/features/data-flow/1.ingest/night-detection-loader', () => ({
  ensureDetectionsLoadedForNight: vi.fn(async ({ nightId }: { nightId: string }) => {
    const { detectionsStore } = await import('../detections')
    const current = detectionsStore.get() || {}
    const hydrated = hydratedByNightState.current[nightId] || {}
    detectionsStore.set({ ...current, ...hydrated })
  }),
}))

vi.mock('~/features/data-flow/3.persist/links', () => ({
  setMorphoLink: setMorphoLinkMock,
}))

vi.mock('~/features/data-flow/3.persist/covers', () => ({
  clearMorphoCover: clearMorphoCoverMock,
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

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}))

import { bulkIdentifyMorphospecies, detectionsStore } from '../detections'

describe('bulkIdentifyMorphospecies', () => {
  beforeEach(() => {
    detectionsStore.set({})
    summaryState.current = {}
    hydratedByNightState.current = {}
    scheduleSaveForNightMock.mockReset()
    setMorphoLinkMock.mockReset()
    clearMorphoCoverMock.mockReset()
  })

  it('loads missing nights and updates every matching morphospecies instance', async () => {
    const morphoKey = 'forcipomyia1'
    const nightOne = 'project-a/deployment-a/night-1'
    const nightTwo = 'project-b/deployment-b/night-2'

    summaryState.current = {
      [nightOne]: {
        nightId: nightOne,
        totalDetections: 1,
        totalIdentified: 1,
        morphoCounts: { [morphoKey]: 1 },
      },
      [nightTwo]: {
        nightId: nightTwo,
        totalDetections: 1,
        totalIdentified: 1,
        morphoCounts: { [morphoKey]: 1 },
      },
    }

    detectionsStore.set({
      patch1: {
        id: 'patch1',
        patchId: 'patch1',
        photoId: 'photo1.jpg',
        nightId: nightOne,
        label: morphoKey,
        detectedBy: 'user',
        morphospecies: morphoKey,
        taxon: {
          class: 'Insecta',
          order: 'Diptera',
          family: 'Ceratopogonidae',
          scientificName: 'Diptera',
          taxonRank: 'order',
        } as any,
      },
    })

    hydratedByNightState.current[nightTwo] = {
      patch2: {
        id: 'patch2',
        patchId: 'patch2',
        photoId: 'photo2.jpg',
        nightId: nightTwo,
        label: morphoKey,
        detectedBy: 'user',
        morphospecies: morphoKey,
        taxon: {
          class: 'Insecta',
          order: 'Diptera',
          family: 'Ceratopogonidae',
          scientificName: 'Diptera',
          taxonRank: 'order',
        } as any,
      },
    }

    const result = await bulkIdentifyMorphospecies({
      morphoKey,
      taxon: {
        class: 'Insecta',
        order: 'Diptera',
        family: 'Ceratopogonidae',
        genus: 'Forcipomyia',
        species: 'Forcipomyia fuliginosa',
        scientificName: 'Forcipomyia fuliginosa',
        taxonRank: 'species',
      } as any,
    })

    const current = detectionsStore.get()

    expect(result).toEqual({
      updatedCount: 2,
      nightCount: 2,
      projectCount: 2,
    })

    expect(current.patch1?.morphospecies).toBeUndefined()
    expect(current.patch2?.morphospecies).toBeUndefined()
    expect(current.patch1?.taxon).toMatchObject({
      genus: 'Forcipomyia',
      species: 'fuliginosa',
      scientificName: 'Forcipomyia fuliginosa',
    })
    expect(current.patch2?.taxon).toMatchObject({
      genus: 'Forcipomyia',
      species: 'fuliginosa',
      scientificName: 'Forcipomyia fuliginosa',
    })

    expect(summaryState.current[nightOne]?.morphoCounts).toEqual({})
    expect(summaryState.current[nightTwo]?.morphoCounts).toEqual({})
    expect(scheduleSaveForNightMock).toHaveBeenCalledTimes(2)
    expect(scheduleSaveForNightMock).toHaveBeenCalledWith(nightOne)
    expect(scheduleSaveForNightMock).toHaveBeenCalledWith(nightTwo)
    expect(setMorphoLinkMock).toHaveBeenCalledWith({ morphoKey, url: '' })
    expect(clearMorphoCoverMock).toHaveBeenCalledWith({ morphoKey })
  })
})
