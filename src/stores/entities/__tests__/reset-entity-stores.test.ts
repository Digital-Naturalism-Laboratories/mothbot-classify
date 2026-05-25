import { beforeEach, describe, expect, it } from 'vitest'
import { morphoLinksStore } from '~/features/data-flow/3.persist/links'
import { leafGroupSummariesStore } from '~/stores/entities/night-summaries'
import { detectionsStore } from '~/stores/entities/detections'
import { resetAllEntityStores } from '~/stores/entities'

describe('resetAllEntityStores', () => {
  beforeEach(() => {
    leafGroupSummariesStore.set({
      'other/n1': {
        leafGroupId: 'other/n1',
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
        leafGroupId: 'other/n1',
        detectedBy: 'user',
        morphospecies: 'mosquito 2',
      },
    })
  })

  it('clears morpho summaries, links, and detections so a new dataset open starts clean', () => {
    resetAllEntityStores()

    expect(leafGroupSummariesStore.get()).toEqual({})
    expect(morphoLinksStore.get()).toEqual({})
    expect(detectionsStore.get()).toEqual({})
  })
})
