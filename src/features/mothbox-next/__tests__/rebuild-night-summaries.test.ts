import { describe, expect, it, beforeEach } from 'vitest'
import { nightSummariesStore } from '~/stores/entities/night-summaries'
import { rebuildNightSummariesFromDetections } from '../rebuild-night-summaries'

describe('rebuildNightSummariesFromDetections', () => {
  beforeEach(() => {
    nightSummariesStore.set({})
  })

  it('builds morpho and species aggregates per night from detections', () => {
    const summaries = rebuildNightSummariesFromDetections({
      patch1: {
        id: 'patch1',
        patchId: 'patch1',
        photoId: 'photo.jpg',
        nightId: 'hoya/deploy/night-1',
        detectedBy: 'user',
        morphospecies: 'mosquito 2',
        taxon: { order: 'Diptera' } as any,
      },
      patch2: {
        id: 'patch2',
        patchId: 'patch2',
        photoId: 'photo2.jpg',
        nightId: 'hoya/deploy/night-1',
        detectedBy: 'user',
        taxon: { species: 'Agrotis ipsilon', order: 'Lepidoptera' } as any,
      },
    })

    expect(summaries['hoya/deploy/night-1']?.morphoCounts).toEqual({ 'mosquito 2': 1 })
    expect(summaries['hoya/deploy/night-1']?.speciesCounts).toEqual({ 'Agrotis ipsilon': 1 })
    expect(nightSummariesStore.get()['hoya/deploy/night-1']?.morphoCounts).toEqual({ 'mosquito 2': 1 })
  })
})
