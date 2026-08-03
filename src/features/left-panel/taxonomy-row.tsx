import { Icon } from '~/components/atomic/Icon'
import { ClickableRow } from './clickable-row'
import { CircleMinusIcon, CirclePlusIcon } from 'lucide-react'
import { Row } from '~/styles'
import { getTaxonomyPrefix } from './taxonomy-prefix'
import { getElbowClassName, getStemDownClassName, TREE_LINE_LAYOUT } from './taxonomy-tree-lines'

export type TaxonomyRowProps = {
  rank: 'class' | 'order' | 'family' | 'genus' | 'species'
  name: string
  count: number
  selected?: boolean
  onSelect: () => void
  inBranch?: boolean
  canToggle?: boolean
  expanded?: boolean
  onToggleExpanded?: () => void
  hasChildren?: boolean
  isMorphoSpecies?: boolean
  hasExpandedChildren?: boolean
  isAbsoluteLast?: boolean
}

export function TaxonomyRow(props: TaxonomyRowProps) {
  const {
    rank,
    name,
    count,
    selected,
    onSelect,
    inBranch,
    canToggle,
    expanded,
    onToggleExpanded,
    hasChildren,
    isMorphoSpecies,
    hasExpandedChildren,
    isAbsoluteLast,
  } = props
  const prefix = getTaxonomyPrefix({ rank, isMorpho: isMorphoSpecies })
  const showStemDown = !!(expanded && hasChildren)

  return (
    <div className='relative w-full'>
      {inBranch ? <span className={getElbowClassName(canToggle ? 'toggle' : 'label')} /> : null}

      <Row className='relative w-full flex-1 items-center'>
        <ToggleColumn canToggle={canToggle} expanded={expanded} onToggleExpanded={onToggleExpanded} showStemDown={showStemDown} />

        <ClickableRow
          selected={selected}
          onSelect={onSelect}
          prefix={prefix}
          name={name}
          count={count}
          hasExpandedChildren={hasExpandedChildren}
          isAbsoluteLast={isAbsoluteLast}
        />
      </Row>
    </div>
  )
}

type ToggleColumnProps = {
  canToggle?: boolean
  expanded?: boolean
  onToggleExpanded?: () => void
  showStemDown: boolean
}

function ToggleColumn(props: ToggleColumnProps) {
  const { canToggle, expanded, onToggleExpanded, showStemDown } = props
  const { toggleWidth } = TREE_LINE_LAYOUT

  return (
    <div
      className='relative flex shrink-0 items-center justify-center self-stretch'
      style={{ width: toggleWidth }}
    >
      {showStemDown ? <span className={getStemDownClassName()} /> : null}
      <ToggleControl canToggle={canToggle} expanded={expanded} onToggleExpanded={onToggleExpanded} />
    </div>
  )
}

type ToggleControlProps = { canToggle?: boolean; expanded?: boolean; onToggleExpanded?: () => void }
function ToggleControl(props: ToggleControlProps) {
  const { canToggle, expanded, onToggleExpanded } = props

  if (!canToggle) return <div className='h-16 w-full' />

  return (
    <div
      className='relative z-10 flex h-16 w-full items-center justify-center bg-sidebar cursor-pointer text-neutral-500 hover:text-ink-primary [&>circle]:!opacity-100'
      onClick={(e) => {
        e.stopPropagation()
        if (onToggleExpanded) onToggleExpanded()
      }}
      aria-label={expanded ? 'Collapse' : 'Expand'}
    >
      <Icon icon={expanded ? CircleMinusIcon : CirclePlusIcon} size={14} className='[&>circle]:opacity-40' />
    </div>
  )
}
