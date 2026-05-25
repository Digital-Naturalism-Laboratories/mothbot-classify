import { describe, expect, it } from 'vitest'
import { readLegacyDetectionShapes } from '../legacy-detection-file'

describe('legacy-detection-file', () => {
  it('reads shapes array from bot detection json', () => {
    const shapes = readLegacyDetectionShapes(
      JSON.stringify({
        shapes: [
          { patch_path: 'patches/a.jpg', label: 'foo', score: 0.9 },
          null,
          'not-a-shape',
        ],
      }),
    )

    expect(shapes).toHaveLength(1)
    expect(shapes[0]?.patch_path).toBe('patches/a.jpg')
    expect(shapes[0]?.score).toBe(0.9)
  })

  it('returns empty array when shapes missing', () => {
    expect(readLegacyDetectionShapes('{}')).toEqual([])
    expect(readLegacyDetectionShapes(JSON.stringify({ shapes: 'nope' }))).toEqual([])
  })
})
