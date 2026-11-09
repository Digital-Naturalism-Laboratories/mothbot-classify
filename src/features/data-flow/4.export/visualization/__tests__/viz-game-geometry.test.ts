import { describe, it, expect } from 'vitest'
import {
  ShelfPacker,
  alphaBounds,
  convexHull,
  maskExtremePoints,
  maxExtent,
  minutesAfterNoon,
  openMask,
  polygonArea,
  silhouetteHull,
  simplifyHull,
  type RgbaImage,
} from '../viz-game-geometry'

function rgba(w: number, h: number, on: (x: number, y: number) => boolean): RgbaImage {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (on(x, y)) data[(y * w + x) * 4 + 3] = 255
  return { width: w, height: h, data }
}

function mask(w: number, h: number, on: (x: number, y: number) => boolean): Uint8Array {
  const m = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (on(x, y)) m[y * w + x] = 1
  return m
}

describe('alphaBounds', () => {
  it('finds the tight half-open box of opaque pixels', () => {
    const img = rgba(10, 8, (x, y) => x >= 2 && x <= 5 && y >= 3 && y <= 6)
    expect(alphaBounds(img, 50)).toEqual({ x0: 2, y0: 3, x1: 6, y1: 7 })
  })
  it('returns null for a fully transparent image', () => {
    expect(alphaBounds(rgba(4, 4, () => false), 50)).toBeNull()
  })
})

describe('openMask', () => {
  it('removes a one-pixel antenna but keeps the body', () => {
    const w = 30, h = 20
    const m = mask(w, h, (x, y) => (x >= 10 && x < 22 && y >= 6 && y < 16) || (y === 3 && x >= 2 && x < 28))
    const opened = openMask(m, w, h, 2)
    expect(opened[3 * w + 5]).toBe(0) // antenna gone
    expect(opened[10 * w + 15]).toBe(1) // body kept
    expect(opened[6 * w + 10]).toBe(1) // body corner kept (square element)
  })
})

describe('convexHull / simplifyHull', () => {
  it('hulls a square with interior points to its 4 corners', () => {
    const hull = convexHull([0, 0, 4, 0, 4, 4, 0, 4, 2, 2, 1, 3])
    expect(hull.length).toBe(8)
    expect(polygonArea(hull)).toBe(16)
  })
  it('simplifies to the vertex cap and stays inside the original', () => {
    const circle: number[] = []
    for (let i = 0; i < 40; i++) circle.push(Math.cos((i / 40) * Math.PI * 2) * 10, Math.sin((i / 40) * Math.PI * 2) * 10)
    const hull = convexHull(circle)
    const simple = simplifyHull(hull, 8)
    expect(simple.length).toBe(16)
    expect(polygonArea(simple)).toBeLessThanOrEqual(polygonArea(hull))
    expect(polygonArea(simple)).toBeGreaterThan(0.85 * polygonArea(hull))
  })
})

describe('silhouetteHull', () => {
  it('is centred on the sprite and spans a solid rectangle', () => {
    const w = 40, h = 20
    const hull = silhouetteHull(mask(w, h, () => true), w, h)
    const xs = hull.filter((_, i) => i % 2 === 0), ys = hull.filter((_, i) => i % 2 === 1)
    const lo = (v: number[]) => v.reduce((a, b) => Math.min(a, b)), hi = (v: number[]) => v.reduce((a, b) => Math.max(a, b))
    expect(lo(xs)).toBeCloseTo(-20); expect(hi(xs)).toBeCloseTo(20)
    expect(lo(ys)).toBeCloseTo(-10); expect(hi(ys)).toBeCloseTo(10)
  })
  it('falls back to the raw mask when opening would erase a speck', () => {
    const w = 3, h = 3
    const hull = silhouetteHull(mask(w, h, (x, y) => x === 1 && y === 1), w, h)
    expect(hull.length).toBeGreaterThanOrEqual(6)
    expect(maxExtent(hull)).toBeCloseTo(Math.SQRT2)
  })
  it('caps the vertex count', () => {
    const w = 60, h = 60
    const hull = silhouetteHull(mask(w, h, (x, y) => (x - 30) ** 2 + (y - 30) ** 2 < 28 ** 2), w, h, 10)
    expect(hull.length).toBeLessThanOrEqual(20)
  })
})

describe('maskExtremePoints', () => {
  it('emits the outer corners of each row', () => {
    expect(maskExtremePoints(mask(4, 1, (x) => x >= 1 && x <= 2), 4, 1)).toEqual([1, 0, 1, 1, 3, 0, 3, 1])
  })
})

describe('ShelfPacker', () => {
  it('packs without overlap and spills onto new pages', () => {
    const packer = new ShelfPacker(64, 1)
    const placed = Array.from({ length: 30 }, () => ({ ...packer.place(14, 14), w: 14, h: 14 }))
    expect(packer.pageCount).toBeGreaterThan(1)
    for (let i = 0; i < placed.length; i++) {
      const a = placed[i]!
      expect(a.x + a.w).toBeLessThanOrEqual(64)
      expect(a.y + a.h).toBeLessThanOrEqual(64)
      for (let j = i + 1; j < placed.length; j++) {
        const b = placed[j]!
        if (a.page !== b.page) continue
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
        expect(overlap).toBe(false)
      }
    }
  })
})

describe('minutesAfterNoon', () => {
  it('runs one night as a single increasing range', () => {
    expect(minutesAfterNoon(new Date(2026, 5, 22, 21, 30).getTime())).toBe(570)
    expect(minutesAfterNoon(new Date(2026, 5, 23, 2, 0).getTime())).toBe(840)
  })
})
