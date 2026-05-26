import { cn } from '~/utils/cn'

export type ClickableRowProps = {
  selected?: boolean
  onSelect: () => void
  name: string
  count: number
  prefix?: string
  hasExpandedChildren?: boolean
  isAbsoluteLast?: boolean
  className?: string
}

export function ClickableRow(props: ClickableRowProps) {
  const { selected, onSelect, prefix, name, count, hasExpandedChildren, isAbsoluteLast, className } = props

  return (
    <div
      className={cn(
        'flex flex-1 items-center justify-between rounded-[4px] border !border-sidebar hover:z-2 relative -mt-1 px-8 py-6 cursor-pointer',
        ' ring-inset ',
        selected ? 'z-2 bg-blue-500/10 ring-1 ring-blue-500/10 hover:bg-blue-500/20 hover:ring-blue-500/20 ' : 'bg-background text-ink-primary hover:bg-blue-500/5 hover:ring-1 hover:ring-blue-500/10 ',
        hasExpandedChildren ? 'rounded-bl-md' : '',
        isAbsoluteLast ? 'rounded-br-md' : '',
        'select-none',
        className,
      )}
      onClick={onSelect}
    >
      <span className='text-13 font-medium'>
        {prefix ? <span className='mr-6 text-11 text-neutral-500'>{prefix}</span> : null}
        {name}
      </span>
      <span className='text-11 font-mono text-muted-foreground'>{count}</span>
    </div>
  )
}
