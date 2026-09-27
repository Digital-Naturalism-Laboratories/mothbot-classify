import { describe, expect, it } from 'vitest'
import type { PatchEntity } from '~/stores/entities/5.patches'
import { buildNightParts, formatNightPartTimeRange } from '../night-parts'

/** `count` patches on one photo taken at hh:mm on the night of 2026-07-27. */
function photoPatches(hh: number, mm: number, count: number, tag = ''): PatchEntity[] {
  const day = hh < 12 ? '28' : '27'
  const photoId = `jolly_2026_07_${day}__${String(hh).padStart(2, '0')}_${String(mm).padStart(2, '0')}_06_HDR0${tag}`
  return Array.from({ length: count }, (_, i) => ({ id: `${photoId}_${i}`, name: `${photoId}_${i}`, leafGroupId: 'night', photoId }))
}

function assertPartition(parts: ReturnType<typeof buildNightParts>, patches: PatchEntity[]) {
  const seen = new Set<string>()
  for (const part of parts) {
    expect(part.count).toBe(part.patchIds.size)
    for (const id of part.patchIds) {
      expect(seen.has(id)).toBe(false)
      seen.add(id)
    }
  }
  expect(seen.size).toBe(patches.length)
}

describe('buildNightParts', () => {
  it('leaves ordinary nights whole', () => {
    const patches = Array.from({ length: 50 }, (_, i) => photoPatches(20, i % 60, 100)).flat() // 5,000
    expect(buildNightParts({ patches })).toEqual([])
    expect(buildNightParts({ patches, threshold: 5_000 })).toEqual([])
  })

  it('splits a large night into balanced, time-ordered parts that cover every patch once', () => {
    // 300 photos × 200 patches = 60,000, shuffled so input order is not time order.
    const patches = Array.from({ length: 300 }, (_, i) => photoPatches(19 + Math.floor(i / 60), i % 60, 200)).flat()
    const shuffled = [...patches].sort((a, b) => (a.id.split('').reverse().join('') < b.id.split('').reverse().join('') ? -1 : 1))
    const parts = buildNightParts({ patches: shuffled, threshold: 25_000, targetSize: 15_000 })

    expect(parts).toHaveLength(4)
    assertPartition(parts, patches)
    for (const part of parts) expect(part.count).toBeLessThanOrEqual(15_000)
    for (let i = 1; i < parts.length; i++) {
      expect(parts[i]!.index).toBe(i)
      expect(parts[i]!.startMs!).toBeGreaterThan(parts[i - 1]!.endMs!)
    }
  })

  it('never splits one photo across parts, even a swarm photo bigger than a part', () => {
    const swarm = photoPatches(22, 30, 40_000, '_swarm')
    const patches = [...photoPatches(19, 0, 5_000), ...swarm, ...photoPatches(23, 0, 5_000)]
    const parts = buildNightParts({ patches, threshold: 25_000, targetSize: 15_000 })

    assertPartition(parts, patches)
    const holding = parts.filter((p) => swarm.some((s) => p.patchIds.has(s.id)))
    expect(holding).toHaveLength(1)
    expect(holding[0]!.patchIds.size).toBeGreaterThanOrEqual(40_000)
  })

  it('puts undated photos last and folds a small leftover into the previous part', () => {
    const dated = Array.from({ length: 140 }, (_, i) => photoPatches(20 + Math.floor(i / 60), i % 60, 200)).flat() // 28,000
    const undated = Array.from({ length: 5 }, (_, i) =>
      Array.from({ length: 100 }, (_, j) => ({ id: `nodate${i}_${j}`, name: `nodate${i}_${j}`, leafGroupId: 'night', photoId: `nodate${i}` })),
    ).flat() // 500
    const patches = [...undated, ...dated]
    const parts = buildNightParts({ patches, threshold: 25_000, targetSize: 15_000 })

    assertPartition(parts, patches)
    expect(parts).toHaveLength(2)
    expect(parts[1]!.patchIds.has('nodate0_0')).toBe(true)
    expect(parts[0]!.patchIds.has('nodate0_0')).toBe(false)
  })
})

describe('formatNightPartTimeRange', () => {
  it('formats wall-clock ranges and handles undated parts', () => {
    const start = new Date(2026, 6, 27, 19, 4).getTime()
    const end = new Date(2026, 6, 28, 0, 31).getTime()
    expect(formatNightPartTimeRange({ startMs: start, endMs: end })).toBe('19:04–00:31')
    expect(formatNightPartTimeRange({ startMs: start, endMs: start })).toBe('19:04')
    expect(formatNightPartTimeRange({ startMs: null, endMs: null })).toBe('undated')
  })
})
