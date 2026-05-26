import { ClickableRow } from './clickable-row'

export type CountsRowProps = {
  label: string
  count: number
  selected?: boolean
  onSelect: () => void
  isAbsoluteLast?: boolean
}

export function CountsRow(props: CountsRowProps) {
  const { label, count, selected, onSelect, isAbsoluteLast } = props

  return (
    <ClickableRow
      name={label}
      count={count}
      selected={selected}
      onSelect={onSelect}
      isAbsoluteLast={isAbsoluteLast}
      className='flex-none w-full'
    />
  )
}
