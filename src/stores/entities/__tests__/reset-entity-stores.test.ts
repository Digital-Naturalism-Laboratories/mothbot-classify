import { beforeEach, describe, expect, it } from 'vitest'
import { morphoLinksStore } from '~/features/data-flow/3.persist/links'
import { nightSummariesStore } from '~/stores/entities/night-summaries'
import { detectionsStore } from '~/stores/entities/detections'
import { resetAllEntityStores } from '~/stores/entities'

describe('resetAllEntityStores', () => {
  beforeEach(() => {
    nightSummariesStore.set({
      'other/n1': {
        nightId: 'other/n1',
        totalDetections: 1,
        totalIdentified: 1,
        morphoCounts: { 'mosquito 2': 3 },
      },
    })
    morphoLinksStore.set({ 'mosquito 2': 'https://example.com/old-dataset' })
    detectionsStore.set({
      stale: {
        id: 'stale',
        patchId: 'stale',
        photoId: 'stale.jpg',
        nightId: 'other/n1',
        detectedBy: 'user',
        morphospecies: 'mosquito 2',
      },
    })
  })

  it('clears morpho summaries, links, and detections so a new dataset open starts clean', () => {
    resetAllEntityStores()

    expect(nightSummariesStore.get()).toEqual({})
    expect(morphoLinksStore.get()).toEqual({})
    expect(detectionsStore.get()).toEqual({})
  })
})
