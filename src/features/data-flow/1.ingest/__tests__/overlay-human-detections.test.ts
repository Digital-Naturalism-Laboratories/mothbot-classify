import { describe, it, expect, beforeEach } from 'vitest'
import { overlayHumanDetections, HUMAN_DETECTOR_ID } from '../overlay-human-detections'
import { patchesStore } from '~/stores/entities/5.patches'
import { detectionsStore } from '~/stores/entities/detections'

const STEM = 'bowedBarbo_2026-06-26T23-33-07+02-00'
const DIR = 'bowedBarbo_2026-06-26'
const BOT = 'Mothbot_MBD-0-2.pt'

function xAnylabelingJson(nShapes: number) {
  return {
    version: '2.0',
    imagePath: `${STEM}.jpg`,
    imageHeight: 4000,
    imageWidth: 6000,
    shapes: Array.from({ length: nShapes }, (_, i) => ({
      label: 'creature',
      shape_type: 'rotation',
      direction: 0.1 * i,
      points: [[i, i], [i + 10, i], [i + 10, i + 8], [i, i + 8]],
    })),
  }
}

/** Mock night-folder directory handle: resolves `<stem>.json` + listed crops by name. */
function makeNightDir(jsonObj: unknown, crops: Set<string>) {
  return {
    getFileHandle: async (name: string) => {
      if (name === `${STEM}.json`) {
        return { getFile: async () => ({ text: async () => JSON.stringify(jsonObj) }) as unknown as File }
      }
      if (crops.has(name)) {
        return { getFile: async () => ({ text: async () => '' }) as unknown as File }
      }
      throw Object.assign(new Error('NotFound'), { name: 'NotFoundError' })
    },
  }
}

/** A bot patch for the photo, carrying the night-folder navigator on its imageFile. */
function botPatch(nightDir: ReturnType<typeof makeNightDir>) {
  const id = `${STEM}_0_${BOT}`
  return {
    id,
    name: id,
    leafGroupId: 'night-1',
    photoId: 'photo-1',
    detectorId: BOT,
    imageFile: {
      name: `${STEM}_0_${BOT}.jpg`,
      path: `${DIR}/${STEM}_0_${BOT}.jpg`,
      size: 0,
      parentDir: nightDir,
    },
  } as never
}

describe('overlayHumanDetections', () => {
  beforeEach(() => {
    patchesStore.set({})
    detectionsStore.set({})
  })

  it('adds HumanDetection patches/detections anchored to the bot patch of the same photo', async () => {
    const nightDir = makeNightDir(
      xAnylabelingJson(2),
      new Set([`${STEM}_0_HumanDetection.jpg`, `${STEM}_1_HumanDetection.jpg`]),
    )
    patchesStore.set({ [`${STEM}_0_${BOT}`]: botPatch(nightDir) })

    const added = await overlayHumanDetections()
    expect(added).toBe(2)

    const patches = patchesStore.get()
    const dets = detectionsStore.get()
    const id0 = `${STEM}_0_HumanDetection`
    expect(patches[id0]?.detectorId).toBe(HUMAN_DETECTOR_ID)
    expect(patches[id0]?.leafGroupId).toBe('night-1')
    expect(patches[id0]?.photoId).toBe('photo-1')
    expect(patches[id0]?.imageFile?.name).toBe(`${STEM}_0_HumanDetection.jpg`)
    expect(dets[id0]?.detectorId).toBe(HUMAN_DETECTOR_ID)
    expect(dets[id0]?.points?.length).toBe(4)
    // Both detectors now present → drives the switcher.
    const detectorIds = new Set(Object.values(patches).map((p) => p.detectorId).filter(Boolean))
    expect(detectorIds.has(HUMAN_DETECTOR_ID)).toBe(true)
    expect(detectorIds.has(BOT)).toBe(true)
  })

  it('skips a shape whose crop image is missing', async () => {
    // JSON has 2 shapes but only crop 0 exists on disk.
    const nightDir = makeNightDir(xAnylabelingJson(2), new Set([`${STEM}_0_HumanDetection.jpg`]))
    patchesStore.set({ [`${STEM}_0_${BOT}`]: botPatch(nightDir) })

    const added = await overlayHumanDetections()
    expect(added).toBe(1)
    expect(patchesStore.get()[`${STEM}_1_HumanDetection`]).toBeUndefined()
  })

  it('does nothing when there is no bot patch to anchor to', async () => {
    // No bot patches → no night folder to probe.
    const added = await overlayHumanDetections()
    expect(added).toBe(0)
  })

  it('does not duplicate a human patch already loaded from records', async () => {
    const id0 = `${STEM}_0_HumanDetection`
    const nightDir = makeNightDir(xAnylabelingJson(1), new Set([`${STEM}_0_HumanDetection.jpg`]))
    patchesStore.set({
      [`${STEM}_0_${BOT}`]: botPatch(nightDir),
      [id0]: { id: id0, name: id0, leafGroupId: 'night-1', photoId: 'photo-1', detectorId: HUMAN_DETECTOR_ID } as never,
    })

    const added = await overlayHumanDetections()
    expect(added).toBe(0)
  })
})
