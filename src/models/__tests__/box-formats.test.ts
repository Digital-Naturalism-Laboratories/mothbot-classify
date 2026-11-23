import { describe, expect, it } from 'vitest'
import {
  cornersFromXyxyr,
  cornersPxFromBox,
  cornersRelFromPx,
  directionFromCorners,
  parseLabelledBox,
  uprightBoxOfCorners,
} from '../box-formats'
import { buildDetectionPolygonPoints } from '../detection-overlay'

const corners = [
  [100, 50],
  [300, 50],
  [300, 150],
  [100, 150],
]

describe('box formats', () => {
  it('converts pixel corners to relative corners and back', () => {
    const box = cornersRelFromPx({ points: corners, imageWidth: 400, imageHeight: 200 })
    expect(box).toEqual({ format: 'obb-corners-rel', coordinates: [0.25, 0.25, 0.75, 0.25, 0.75, 0.75, 0.25, 0.75] })
    expect(cornersPxFromBox({ box: box!, imageWidth: 400, imageHeight: 200 })).toEqual(corners)
  })

  it('needs the image size and four corners for a relative box', () => {
    expect(cornersRelFromPx({ points: corners })).toBeUndefined()
    expect(cornersRelFromPx({ points: corners.slice(0, 2), imageWidth: 10, imageHeight: 10 })).toBeUndefined()
    expect(cornersPxFromBox({ box: { format: 'obb-corners-rel', coordinates: [0, 0, 1, 0, 1, 1, 0, 1] } })).toBeUndefined()
  })

  it('reads upright and Antenna-style boxes', () => {
    expect(cornersPxFromBox({ box: { format: 'xyxy-px', coordinates: [1, 2, 3, 4] } })).toEqual([
      [1, 2],
      [3, 2],
      [3, 4],
      [1, 4],
    ])
    const turned = cornersFromXyxyr({ x1: 0, y1: 0, x2: 4, y2: 2, rotation: Math.PI / 2 })
    expect(turned.map(([x, y]) => [Math.round(x! * 1e9) / 1e9, Math.round(y! * 1e9) / 1e9])).toEqual([
      [3, -1],
      [3, 3],
      [1, 3],
      [1, -1],
    ])
  })

  it('validates stored boxes', () => {
    expect(parseLabelledBox({ format: 'obb-corners-rel', coordinates: [0, 1] })).toEqual({ format: 'obb-corners-rel', coordinates: [0, 1] })
    expect(parseLabelledBox({ format: 'mystery', coordinates: [] })).toBeUndefined()
    expect(parseLabelledBox({ format: 'xyxy-px', coordinates: ['1'] })).toBeUndefined()
  })

  it('gives X-AnyLabeling’s direction: the first edge’s angle, 0 to 2π, y down', () => {
    expect(directionFromCorners(corners)).toBe(0)
    // A first edge pointing at −88° (nearly straight up on screen), as in a real hand label: ≈ 4.748.
    const rad = (-88 * Math.PI) / 180
    expect(directionFromCorners([[0, 0], [Math.cos(rad), Math.sin(rad)]])).toBeCloseTo(4.7473, 3)
    expect(uprightBoxOfCorners(corners)).toEqual([100, 50, 300, 150])
  })

  it('draws a relative box over the photo when there are no pixel points', () => {
    const box = { format: 'obb-corners-rel' as const, coordinates: [0.25, 0.25, 0.75, 0.25, 0.75, 0.75, 0.25, 0.75] }
    expect(buildDetectionPolygonPoints({ box, imageWidth: 400, imageHeight: 200 })).toBe('100,50 300,50 300,150 100,150')
    expect(buildDetectionPolygonPoints({ box })).toBeNull()
  })
})
