import { describe, expect, it } from 'vitest'
import { countUnassignedDetectionsForNight, nightHasMachineIdentification } from '../night-labeling-mode'
import type { DetectionEntity } from '~/stores/entities/detections'

describe('nightHasMachineIdentification', () => {
  it('returns true when a night photo has legacy bot detection JSON', () => {
    const result = nightHasMachineIdentification({
      leafGroupId: 'night-1',
      photos: {
        'photo.jpg': { leafGroupId: 'night-1', botDetectionFile: { path: 'night/photo_botdetection.json' } },
      },
      detections: {},
    })

    expect(result).toBe(true)
  })

  it('returns true when an auto detection has machine taxonomy', () => {
    const result = nightHasMachineIdentification({
      leafGroupId: 'night-1',
      photos: {},
      detections: {
        'patch-a.jpg': {
          id: 'patch-a.jpg',
          patchId: 'patch-a.jpg',
          photoId: 'patch-a',
          leafGroupId: 'night-1',
          detectedBy: 'auto',
          taxon: { order: 'Lepidoptera' },
        } satisfies DetectionEntity,
      },
    })

    expect(result).toBe(true)
  })

  it('returns false for patch-images-only style nights with no bot labels', () => {
    const result = nightHasMachineIdentification({
      leafGroupId: 'night-1',
      photos: {
        'patch-a': { leafGroupId: 'night-1' },
      },
      detections: {
        'patch-a.jpg': {
          id: 'patch-a.jpg',
          patchId: 'patch-a.jpg',
          photoId: 'patch-a',
          leafGroupId: 'night-1',
          detectedBy: 'auto',
        } satisfies DetectionEntity,
      },
    })

    expect(result).toBe(false)
  })
})

describe('countUnassignedDetectionsForNight', () => {
  it('counts auto-bucket detections for the night', () => {
    const count = countUnassignedDetectionsForNight({
      leafGroupId: 'night-1',
      detections: {
        a: { id: 'a', patchId: 'a', photoId: 'a', leafGroupId: 'night-1', detectedBy: 'auto' } satisfies DetectionEntity,
        b: { id: 'b', patchId: 'b', photoId: 'b', leafGroupId: 'night-1', detectedBy: 'user' } satisfies DetectionEntity,
        c: { id: 'c', patchId: 'c', photoId: 'c', leafGroupId: 'night-2', detectedBy: 'auto' } satisfies DetectionEntity,
      },
    })

    expect(count).toBe(1)
  })
})
