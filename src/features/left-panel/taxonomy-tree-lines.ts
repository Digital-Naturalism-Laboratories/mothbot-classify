import type { CSSProperties } from 'react'

/** Pixel layout for taxonomy tree connectors (1 Tailwind unit = 1px in this project). */
export const TREE_LINE_LAYOUT = {
  branchMarginLeft: 8,
  branchPaddingLeft: 16,
  toggleWidth: 20,
  trunkOffsetLeft: 1.5,
  connectorOffsetLeft: 14.5,
  curveRadius: 12,
  curveArm: 12,
  connectorToToggleWidth: 18,
  connectorToRowWidth: 35,
  rowCenterOffset: 15,
} as const

export type ElbowTarget = 'toggle' | 'label'

export type ConnectorLineProps = {
  className: string
  style?: CSSProperties
}

const SPINE_CLASS = 'pointer-events-none absolute z-0 w-px bg-ink-300'

const ELBOW_TOGGLE =
  'pointer-events-none absolute -left-[14.5px] bottom-1/2 z-0 box-border h-[12px] w-[18px] rounded-bl-[12px] border-b border-l border-ink-300'

const ELBOW_LABEL =
  'pointer-events-none absolute -left-[14.5px] bottom-1/2 z-0 box-border h-[12px] w-[35px] rounded-bl-[12px] border-b border-l border-ink-300'

const STEM_DOWN =
  'pointer-events-none absolute left-1/2 top-1/2 bottom-[-3px] z-0 w-px -translate-x-1/2 bg-ink-300'

export function getBranchSpineProps(directRowCount: number): ConnectorLineProps | null {
  if (directRowCount <= 0) return null

  const { trunkOffsetLeft, rowCenterOffset, toggleWidth } = TREE_LINE_LAYOUT
  const spineTop = rowCenterOffset / 3

  const style: CSSProperties = {
    left: trunkOffsetLeft,
    top: spineTop,
    width: 1,
  }

  if (directRowCount > 1) {
    return { className: SPINE_CLASS, style: { ...style, bottom: rowCenterOffset } }
  }

  return { className: SPINE_CLASS, style: { ...style, height: 0 } }
}

export function getStemDownClassName(): string {
  return STEM_DOWN
}

export function getElbowClassName(target: ElbowTarget): string {
  if (target === 'label') return ELBOW_LABEL
  return ELBOW_TOGGLE
}
