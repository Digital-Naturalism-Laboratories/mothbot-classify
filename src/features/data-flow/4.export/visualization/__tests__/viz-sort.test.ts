import { afterEach, describe, expect, it } from 'vitest'
import { detectionsStore } from '~/stores/entities/detections'
import { patchesStore } from '~/stores/entities/5.patches'
import { buildVizDetections } from '../viz-data'
import { defaultVizConfig, type VizConfig } from '../viz-types'

const LEAF = 'DesertHouse/Cactus/2026-08-11'

/** Three detections whose capture times and sizes deliberately disagree. */
function seedStores() {
  detectionsStore.set({
    late: {
      id: 'late',
      patchId: 'late',
      photoId: 'superDorada_2026-08-12T03-37-06-07-00.jpg',
      leafGroupId: LEAF,
      pixelMassPixels: 50,
    },
    early: {
      id: 'early',
      patchId: 'early',
      photoId: 'superDorada_2026-08-11T20-01-22-07-00.jpg',
      leafGroupId: LEAF,
      pixelMassPixels: 300,
    },
    middle: {
      id: 'middle',
      patchId: 'middle',
      photoId: 'superDorada_2026-08-11T23-50-00-07-00.jpg',
      leafGroupId: LEAF,
      pixelMassPixels: 100,
    },
  } as never)
  patchesStore.set({} as never)
}

function configWith(overrides: Partial<VizConfig>): VizConfig {
  return { ...defaultVizConfig([LEAF], false), ...overrides }
}

function idsFor(overrides: Partial<VizConfig>) {
  return buildVizDetections(configWith(overrides)).detections.map((d) => d.id)
}

afterEach(() => {
  detectionsStore.set({})
  patchesStore.set({})
})

describe('viz sort', () => {
  it('orders chronologically, earliest first', () => {
    seedStores()
    expect(idsFor({ sortMode: 'time' })).toEqual(['early', 'middle', 'late'])
  })

  it('reverses the time sort when the toggle is on', () => {
    seedStores()
    expect(idsFor({ sortMode: 'time', sortReversed: true })).toEqual(['late', 'middle', 'early'])
  })

  it('sorts by size largest first by default', () => {
    seedStores()
    expect(idsFor({ sortMode: 'size' })).toEqual(['early', 'middle', 'late'])
  })

  it('reverses the size sort too — the toggle is independent of sort type', () => {
    seedStores()
    expect(idsFor({ sortMode: 'size', sortReversed: true })).toEqual(['late', 'middle', 'early'])
  })

  it('puts undated detections last, and keeps them last only until reversed', () => {
    detectionsStore.set({
      dated: {
        id: 'dated',
        patchId: 'dated',
        photoId: 'superDorada_2026-08-11T20-01-22-07-00.jpg',
        leafGroupId: LEAF,
      },
      undated: { id: 'undated', patchId: 'undated', photoId: 'no-timestamp.jpg', leafGroupId: LEAF },
    } as never)
    patchesStore.set({} as never)

    expect(idsFor({ sortMode: 'time' })).toEqual(['dated', 'undated'])
    expect(idsFor({ sortMode: 'time', sortReversed: true })).toEqual(['undated', 'dated'])
  })

  it('defaults to not reversed', () => {
    expect(defaultVizConfig([LEAF], false).sortReversed).toBe(false)
  })
})
