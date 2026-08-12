import { describe, expect, it } from 'vitest'
import { buildDetectionPolygonPoints } from '../detection-overlay'

describe('buildDetectionPolygonPoints', () => {
  it('passes through a rotated 4-point box', () => {
    const points = [
      [100, 200],
      [180, 210],
      [175, 260],
      [95, 250],
    ]
    expect(buildDetectionPolygonPoints({ points })).toBe('100,200 180,210 175,260 95,250')
  })

  it('expands a 2-point rectangle into four corners', () => {
    const points = [
      [10, 20],
      [110, 220],
    ]
    expect(buildDetectionPolygonPoints({ points })).toBe('10,20 110,20 110,220 10,220')
  })

  it('normalizes a rectangle given bottom-right first', () => {
    const points = [
      [110, 220],
      [10, 20],
    ]
    expect(buildDetectionPolygonPoints({ points })).toBe('10,20 110,20 110,220 10,220')
  })

  it('returns null for a zero-area rectangle', () => {
    expect(buildDetectionPolygonPoints({ points: [[50, 50], [50, 90]] })).toBeNull()
  })

  it('returns null when points are missing or too few', () => {
    expect(buildDetectionPolygonPoints({ points: undefined })).toBeNull()
    expect(buildDetectionPolygonPoints({ points: [] })).toBeNull()
    expect(buildDetectionPolygonPoints({ points: [[1, 2]] })).toBeNull()
  })

  it('drops non-finite coordinates and bails when too few remain', () => {
    const points = [
      [Number.NaN, 10],
      [20, 30],
      [40, 50],
    ]
    // Only two valid points survive, and they form a real rectangle.
    expect(buildDetectionPolygonPoints({ points })).toBe('20,30 40,30 40,50 20,50')
  })

  it('keeps polygons with more than four points', () => {
    const points = [
      [0, 0],
      [10, 0],
      [10, 10],
      [5, 15],
      [0, 10],
    ]
    expect(buildDetectionPolygonPoints({ points })).toBe('0,0 10,0 10,10 5,15 0,10')
  })
})
