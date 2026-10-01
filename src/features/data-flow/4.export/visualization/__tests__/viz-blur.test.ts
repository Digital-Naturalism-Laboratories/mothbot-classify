import { afterEach, describe, expect, it } from 'vitest'
import { detectionsStore } from '~/stores/entities/detections'
import { patchesStore } from '~/stores/entities/5.patches'
import { buildVizDetections } from '../viz-data'
import { defaultVizConfig, type VizConfig } from '../viz-types'

const LEAF = 'DesertHouse/Cactus/2026-08-12'

/** Patches with Process blurriness scores; `clusterBlurry` and `clusterSharp` share cluster 7. */
function seedStores() {
  const det = (id: string, extra: object) => ({ id, patchId: id, photoId: `${id}.jpg`, leafGroupId: LEAF, ...extra })
  detectionsStore.set({
    sharp: det('sharp', { pixelMassPixels: 100 }),
    blurry: det('blurry', { pixelMassPixels: 100 }),
    unscored: det('unscored', { pixelMassPixels: 100 }),
    clusterBlurry: det('clusterBlurry', { clusterId: 7, score: 0.9 }),
    clusterSharp: det('clusterSharp', { clusterId: 7, score: 0.4 }),
  } as never)
  patchesStore.set({
    sharp: { id: 'sharp', blurScore: 12 },
    blurry: { id: 'blurry', blurScore: 91.5 },
    unscored: { id: 'unscored' },
    clusterBlurry: { id: 'clusterBlurry', blurScore: 88 },
    clusterSharp: { id: 'clusterSharp', blurScore: 20 },
  } as never)
}

function build(overrides: Partial<VizConfig>) {
  return buildVizDetections({ ...defaultVizConfig([LEAF], false), ...overrides })
}

afterEach(() => {
  detectionsStore.set({})
  patchesStore.set({})
})

describe('viz blurriness limit', () => {
  it('keeps everything at 100 (the default)', () => {
    seedStores()
    const result = build({})
    expect(result.detections).toHaveLength(5)
    expect(result.blurDropped).toBe(0)
  })

  it('leaves out patches scored above the limit and keeps unscored ones', () => {
    seedStores()
    const result = build({ blurLimit: 70 })
    expect(result.detections.map((d) => d.id).sort()).toEqual(['clusterSharp', 'sharp', 'unscored'])
    expect(result.blurDropped).toBe(2)
  })

  it('applies before choosing cluster representatives, so a sharp member stands in', () => {
    seedStores()
    const ids = build({ blurLimit: 70, onePerCluster: true }).detections.map((d) => d.id)
    expect(ids).toContain('clusterSharp')
    expect(ids).not.toContain('clusterBlurry')
  })
})
