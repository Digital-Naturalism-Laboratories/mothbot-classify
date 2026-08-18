import { describe, expect, it } from 'vitest'
import { orderPatchIds } from '../patch-grid'

/** Width comes from the detection bbox, so points drive the size ordering. */
function det(id: string, width: number, clusterId?: number) {
  return {
    id,
    patchId: id,
    photoId: `${id}.jpg`,
    leafGroupId: 'night',
    ...(clusterId === undefined ? {} : { clusterId }),
    points: [
      [0, 0],
      [width, 0],
      [width, 10],
      [0, 10],
    ],
  }
}

function patch(id: string) {
  return { id, name: id, leafGroupId: 'night', photoId: `${id}.jpg` }
}

function order(
  spec: Record<string, { width: number; cluster?: number }>,
  options: Parameters<typeof orderPatchIds>[0] extends infer T
    ? Omit<T & object, 'patches' | 'detections'>
    : never = {} as never,
) {
  const ids = Object.keys(spec)
  return orderPatchIds({
    patches: ids.map(patch) as never,
    detections: Object.fromEntries(ids.map((id) => [id, det(id, spec[id]!.width, spec[id]!.cluster)])) as never,
    ...options,
  })
}

describe('orderPatchIds — defaults', () => {
  it('orders clusters by their largest member, keeping members together', () => {
    // Cluster 1's biggest member (90) beats cluster 2's (40), so all of
    // cluster 1 comes first even though c2big > c1small.
    const result = order({
      c1big: { width: 90, cluster: 1 },
      c1small: { width: 5, cluster: 1 },
      c2big: { width: 40, cluster: 2 },
      c2small: { width: 20, cluster: 2 },
    })
    expect(result).toEqual(['c1big', 'c1small', 'c2big', 'c2small'])
  })

  it('puts every clustered patch ahead of every unclustered one', () => {
    // The lone patch (60) is bigger than cluster 2's rep (40) but still trails
    // it, because clustered items form their own block first.
    const result = order({
      c1: { width: 90, cluster: 1 },
      lone: { width: 60, cluster: -1 },
      c2: { width: 40, cluster: 2 },
    })
    expect(result).toEqual(['c1', 'c2', 'lone'])
  })

  it('sorts the unclustered block by size too', () => {
    const result = order({
      c1: { width: 10, cluster: 1 },
      loneSmall: { width: 30, cluster: -1 },
      loneBig: { width: 300, cluster: -1 },
    })
    expect(result).toEqual(['c1', 'loneBig', 'loneSmall'])
  })

  it('treats a missing cluster field the same as unclustered', () => {
    const result = order({
      none: { width: 500 },
      clustered: { width: 10, cluster: 4 },
    })
    expect(result).toEqual(['clustered', 'none'])
  })

  it('keeps sub-clusters of one cluster adjacent and in order', () => {
    const result = order({
      a: { width: 50, cluster: 3.2 },
      b: { width: 80, cluster: 3.1 },
      other: { width: 200, cluster: 9 },
    })
    expect(result).toEqual(['other', 'b', 'a'])
  })

  it('sorts within a cluster by size, largest first', () => {
    const result = order({
      mid: { width: 50, cluster: 1 },
      big: { width: 90, cluster: 1 },
      small: { width: 10, cluster: 1 },
    })
    expect(result).toEqual(['big', 'mid', 'small'])
  })
})

describe('orderPatchIds — toggles', () => {
  it('ignores clusters when grouping is off, sorting purely by size', () => {
    const result = order(
      {
        c1big: { width: 90, cluster: 1 },
        c1small: { width: 5, cluster: 1 },
        c2mid: { width: 40, cluster: 2 },
      },
      { groupByClusters: false },
    )
    expect(result).toEqual(['c1big', 'c2mid', 'c1small'])
  })

  it('interleaves unclustered patches by size when "clustered first" is off', () => {
    const result = order(
      {
        c1: { width: 90, cluster: 1 },
        lone: { width: 60, cluster: -1 },
        c2: { width: 40, cluster: 2 },
      },
      { clusteredFirst: false },
    )
    expect(result).toEqual(['c1', 'lone', 'c2'])
  })

  it('still separates clustered from unclustered when cluster grouping is off', () => {
    // The two toggles are independent: this partitions without keeping
    // cluster members contiguous.
    const result = order(
      {
        lone: { width: 100, cluster: -1 },
        c1: { width: 50, cluster: 1 },
        c2: { width: 20, cluster: 2 },
      },
      { groupByClusters: false },
    )
    expect(result).toEqual(['c1', 'c2', 'lone'])
  })

  it('falls back to cluster id order when size sorting is off', () => {
    const result = order(
      {
        c2: { width: 900, cluster: 2 },
        c1: { width: 10, cluster: 1 },
      },
      { sortBySize: false },
    )
    expect(result).toEqual(['c1', 'c2'])
  })

  it('reverses whatever order the other options produced', () => {
    const spec = {
      c1big: { width: 90, cluster: 1 },
      c1small: { width: 5, cluster: 1 },
      c2: { width: 40, cluster: 2 },
    }
    expect(order(spec)).toEqual(['c1big', 'c1small', 'c2'])
    expect(order(spec, { reversed: true })).toEqual(['c2', 'c1small', 'c1big'])
  })

  it('sorts by name alone when every organization is off', () => {
    const result = order(
      { zeta: { width: 90, cluster: 1 }, alpha: { width: 5, cluster: 2 } },
      { groupByClusters: false, sortBySize: false },
    )
    expect(result).toEqual(['alpha', 'zeta'])
  })
})

describe('orderPatchIds — edge cases', () => {
  it('returns an empty array for no patches', () => {
    expect(orderPatchIds({ patches: [] as never, detections: {} as never })).toEqual([])
  })

  it('does not crash when a patch has no detection', () => {
    const result = orderPatchIds({
      patches: [patch('orphan'), patch('sized')] as never,
      detections: { sized: det('sized', 40, -1) } as never,
    })
    expect(result).toHaveLength(2)
    expect(result[0]).toBe('sized')
  })

  it('is deterministic when sizes tie', () => {
    const result = order({ zeta: { width: 20, cluster: -1 }, alpha: { width: 20, cluster: -1 } })
    expect(result).toEqual(['alpha', 'zeta'])
  })
})
