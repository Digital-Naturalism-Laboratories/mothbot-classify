import { describe, expect, it } from 'vitest'
import {
  getBranchSpineProps,
  getElbowClassName,
  getStemDownClassName,
  TREE_LINE_LAYOUT,
} from '../taxonomy-tree-lines'

describe('getBranchSpineProps', () => {
  it('returns null with no rows', () => {
    expect(getBranchSpineProps(0)).toBeNull()
  })

  it('uses zero height for a single child (elbows only, no shared spine)', () => {
    const spine = getBranchSpineProps(1)
    expect(spine?.style?.top).toBe(TREE_LINE_LAYOUT.rowCenterOffset / 3)
    expect(spine?.style?.height).toBe(0)
    expect(spine?.style?.bottom).toBeUndefined()
  })

  it('uses bottom offset when multiple siblings share the spine', () => {
    const spine = getBranchSpineProps(4)
    expect(spine?.style?.bottom).toBe(TREE_LINE_LAYOUT.rowCenterOffset)
    expect(spine?.style?.height).toBeUndefined()
  })
})

describe('stemDown', () => {
  it('centers in the toggle column', () => {
    const className = getStemDownClassName()
    expect(className).toContain('left-1/2')
    expect(className).toContain('-translate-x-1/2')
  })
})

describe('elbow', () => {
  it('uses short corner only; branch spine supplies vertical', () => {
    const className = getElbowClassName('toggle')
    expect(className).toContain('h-[12px]')
    expect(className).toContain('w-[18px]')
  })
})
