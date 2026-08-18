import { describe, it, expect } from 'vitest'
import { computePlacements, type PreparedItem, type PackGeomResult } from '../viz-pack'

/** A solid rectangular silhouette of size w×h (no padding, offset 0). */
function solidItem(id: string, w: number, h: number): PreparedItem {
  const rs: number[] = [], cs: number[] = []
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { rs.push(y); cs.push(x) }
  return {
    id, sw: w, sh: h, mw: w, mh: h,
    maskR: Uint16Array.from(rs), maskC: Uint16Array.from(cs),
    offR: 0, offC: 0, focus: 1, opaque: w * h,
  }
}

/** Re-stamp every placement into a grid; fail on any out-of-bounds or double-cover. */
function assertNoOverlap(items: PreparedItem[], result: PackGeomResult): void {
  const occ = new Uint8Array(result.width * result.height)
  for (const p of result.placements) {
    const it = items[p.index]!
    for (let k = 0; k < it.maskR.length; k++) {
      const y = p.dy + it.offR + it.maskR[k]!
      const x = p.dx + it.offC + it.maskC[k]!
      expect(y >= 0 && y < result.height && x >= 0 && x < result.width).toBe(true)
      const idx = y * result.width + x
      expect(occ[idx]).toBe(0)
      occ[idx] = 1
    }
  }
}

describe('computePlacements — bar', () => {
  it('places every item bottom-up with no overlaps', () => {
    const items = Array.from({ length: 20 }, (_, i) => solidItem(`b${i}`, 30, 30))
    const res = computePlacements(items, { layout: 'bar', width: 100 })
    expect(res.stats.placed).toBe(20)
    expect(res.stats.noFit).toBe(0)
    expect(res.height).toBeGreaterThan(0)
    assertNoOverlap(items, res)
    // Cropped so content starts at the top.
    expect(Math.min(...res.placements.map((p) => p.dy))).toBe(0)
  })

  it('skips items wider than the canvas rather than overlapping', () => {
    const items = [solidItem('wide', 200, 20), solidItem('ok', 20, 20)]
    const res = computePlacements(items, { layout: 'bar', width: 100 })
    expect(res.stats.placed).toBe(1)
    expect(res.stats.noFit).toBe(1)
    assertNoOverlap(items, res)
  })
})

describe('computePlacements — radial', () => {
  it('packs a square canvas without overlaps and within bounds', () => {
    const items = Array.from({ length: 60 }, (_, i) => solidItem(`r${i}`, 20, 20))
    const res = computePlacements(items, { layout: 'radial', width: 400, seed: 7 })
    expect(res.width).toBe(400)
    expect(res.height).toBe(400) // radial is square
    expect(res.stats.placed).toBeGreaterThan(0)
    expect(res.center).toEqual({ x: 200, y: 200 })
    // Packed-disc radius is positive and within the canvas.
    expect(res.contentRadius).toBeGreaterThan(0)
    expect(res.contentRadius).toBeLessThanOrEqual(Math.hypot(400, 400))
    assertNoOverlap(items, res)
  })
})

describe('computePlacements — shape', () => {
  it('only places silhouettes inside the base mask', () => {
    const W = 200, H = 200
    // Base mask: left half filled.
    const data = new Uint8Array(W * H)
    for (let y = 0; y < H; y++) for (let x = 0; x < W / 2; x++) data[y * W + x] = 1

    const items = Array.from({ length: 80 }, (_, i) => solidItem(`s${i}`, 16, 16))
    const res = computePlacements(items, { layout: 'shape', width: W, baseMask: { data, w: W, h: H }, seed: 3 })
    expect(res.stats.placed).toBeGreaterThan(0)
    assertNoOverlap(items, res)
    // Every covered pixel must be inside the base mask (x < W/2).
    for (const p of res.placements) {
      const it = items[p.index]!
      for (let k = 0; k < it.maskR.length; k++) {
        const x = p.dx + it.offC + it.maskC[k]!
        expect(data[(p.dy + it.offR + it.maskR[k]!) * W + x]).toBe(1)
      }
    }
  })
})

describe('computePlacements — candidate density at scale', () => {
  /** Mostly tiny insects with a long tail of big moths, as a real night looks. */
  function buildNight(): PreparedItem[] {
    const items: PreparedItem[] = []
    let i = 0
    for (let n = 0; n < 26_500; n++) items.push(solidItem(`s${i++}`, 12 + (n % 10), 14 + (n % 12)))
    for (let n = 0; n < 1_100; n++) items.push(solidItem(`m${i++}`, 45 + (n % 30), 50 + (n % 30)))
    for (let n = 0; n < 200; n++) items.push(solidItem(`L${i++}`, 150 + (n % 120), 160 + (n % 120)))
    return items
  }

  it('still places the big items when thousands of small ones go first', () => {
    // Regression: the candidate spiral was capped at a flat 200k positions, so
    // at this item count the step inflated until no legal gap could be found —
    // and because size-sort-reversed feeds the smallest first, it was the
    // largest moths that got dropped. Every one of them vanished.
    const items = buildNight().sort((a, b) => a.mw * a.mh - b.mw * b.mh)
    const res = computePlacements(items, { layout: 'radial', width: 6000 })

    const placedIds = new Set(res.placements.map((p) => items[p.index]!.id))
    const large = items.filter((it) => it.id.startsWith('L'))
    const largePlaced = large.filter((it) => placedIds.has(it.id)).length

    expect(largePlaced).toBe(large.length)
    expect(res.stats.placed).toBe(items.length)
    expect(res.stats.noFit).toBe(0)
  })
})
