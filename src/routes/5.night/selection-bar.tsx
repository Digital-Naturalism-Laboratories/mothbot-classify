import { useMemo } from 'react'
import { KeyShortcuts } from '~/components/atomic/Kbd'
import { Tooltip } from '~/components/ui-custom/tooltip'
import { Button } from '~/components/ui/button'
import { useHotkey } from '~/utils/use-hotkey'
import { cn } from '~/utils/cn'

export type SelectionBarProps = {
  selectedCount: number
  onIdentify: () => void
  onAccept: () => void
  onUnselect: () => void
  onSelectAll: () => void
  onResetToAuto?: () => void
  className?: string
}

export function SelectionBar(props: SelectionBarProps) {
  const { selectedCount, onIdentify, onAccept, onUnselect, onSelectAll, onResetToAuto, className } = props

  const hasSelection = selectedCount > 0
  const label = useMemo(() => `${selectedCount} selected`, [selectedCount])

  useHotkey('d', () => { if (hasSelection) onIdentify() }, [hasSelection, onIdentify])
  useHotkey('a', () => { if (hasSelection) onAccept() }, [hasSelection, onAccept])
  useHotkey('u', () => { if (hasSelection) onUnselect() }, [hasSelection, onUnselect])
  useHotkey('shift+a', () => { onSelectAll() }, [onSelectAll])

  if (!hasSelection) return null

  return (
    <div
      className={cn(
        'fixed bottom-16 left-1/2 z-50 -translate-x-1/2 rounded-md border bg-white/95 px-16 py-12 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-white/70',
        className,
      )}
    >
      <div className='flex items-center gap-x-12'>
        <div className='text-13 text-neutral-700'>{label}</div>
        <div className='h-16 w-px bg-neutral-200' />
        <ActionButton label='Identify' keys={['D']} onClick={onIdentify} />
        <ActionButton label='Accept' keys={['A']} onClick={onAccept} tooltip='Accept selected identifications' />
        <ActionButton label='Unselect' keys={['U']} onClick={onUnselect} />
        <ActionButton label='Select All' keys={['⇧', 'A']} onClick={onSelectAll} />
        {onResetToAuto ? <ActionButton label='Reset' onClick={onResetToAuto} /> : null}
      </div>
    </div>
  )
}

type ActionButtonProps = { label: string; keys?: string[]; onClick: () => void; tooltip?: string }

function ActionButton(props: ActionButtonProps) {
  const { label, keys, onClick, tooltip } = props
  return (
    <Tooltip content={tooltip}>
      <Button size='sm' variant='outline' className='flex items-center gap-x-8' onClick={onClick}>
        <span>{label}</span>
        {keys && keys.length > 0 ? <KeyShortcuts keys={keys} /> : null}
      </Button>
    </Tooltip>
  )
}
