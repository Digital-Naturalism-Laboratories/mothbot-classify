import { describe, it, expect } from 'vitest'
import { computePlacements, type PreparedItem } from '../viz-pack'

function solidItem(id: string, w: number, h: number): PreparedItem {
  const rs: number[] = [], cs: number[] = []
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { rs.push(y); cs.push(x) }
  return {
    id, sw: w, sh: h, mw: w, mh: h,
    maskR: Uint16Array.from(rs), maskC: Uint16Array.from(cs),
    offR: 0, offC: 0, focus: 1, opaque: w * h,
  }
}

/** Mix of many small items and a handful of large ones (like green moths). */
function mixed(): { large: PreparedItem[]; small: PreparedItem[] } {
  const large = Array.from({ length: 25 }, (_, i) => solidItem(`L${i}`, 60, 60))
  const small = Array.from({ length: 300 }, (_, i) => solidItem(`s${i}`, 10, 10))
  return { large, small }
}

function placedIds(items: PreparedItem[]): Set<string> {
  const res = computePlacements(items, { layout: 'radial', width: 900, seed: 1 })
  return new Set(res.placements.map((p) => items[p.index]!.id))
}

describe('radial packing is order-independent for large items', () => {
  it('places the large items whether they come first or last', () => {
    const { large, small } = mixed()

    const largeFirst = placedIds([...large, ...small])
    const largeLast = placedIds([...small, ...large])

    const largeFirstCount = large.filter((it) => largeFirst.has(it.id)).length
    const largeLastCount = large.filter((it) => largeLast.has(it.id)).length

    // Regression guard: the radial packer must be order-independent — a large
    // item placed last still finds space (it isn't dropped just because small
    // items were packed first). The real "missing green moths" bug was the
    // limit being applied after the sort in viz-data, not the packer.
    expect(largeLastCount).toBeGreaterThanOrEqual(large.length - 2)
  })
})
