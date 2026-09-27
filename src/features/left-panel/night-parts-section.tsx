import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { cn } from '~/utils/cn'

type NightPartsSectionProps = {
  parts: Array<{ label: string; count: number }>
  /** Patches in the whole night. */
  total: number
  selected: number | 'all'
  onChange: (choice: number | 'all') => void
  className?: string
}

/**
 * Shown only for nights too large to view at once (see night-parts.ts). Lets
 * the user step through capture-time parts, or opt into the slow whole view.
 */
export function NightPartsSection(props: NightPartsSectionProps) {
  const { parts, total, selected, onChange, className } = props
  const index = selected === 'all' ? -1 : selected
  const canPrev = index > 0
  const canNext = index >= 0 && index < parts.length - 1
  const stepButton = 'shrink-0 rounded border border-amber-300 bg-white p-4 text-amber-900 hover:bg-amber-100 disabled:opacity-40 disabled:hover:bg-white'

  return (
    <div className={cn('rounded-md border border-amber-300 bg-amber-50 text-amber-900 p-12', className)}>
      <div className='text-14 font-semibold mb-4'>Large night · shown in parts</div>
      <p className='text-12 leading-snug mb-8'>
        {total.toLocaleString()} patches is more than Classify can show smoothly at once, so this night is split by
        capture time. Your IDs, clusters, and exports still cover the whole night.
      </p>
      <div className='flex items-center gap-6'>
        <button type='button' className={stepButton} aria-label='Previous part' disabled={!canPrev} onClick={() => onChange(index - 1)}>
          <ChevronLeftIcon className='h-14 w-14' />
        </button>
        <select
          aria-label='Night part'
          className='min-w-0 flex-1 rounded border border-amber-300 bg-white px-6 py-4 text-12 text-ink-primary'
          value={selected === 'all' ? 'all' : String(selected)}
          onChange={(e) => onChange(e.target.value === 'all' ? 'all' : Number(e.target.value))}
        >
          {parts.map((part, i) => (
            <option key={i} value={i}>
              Part {i + 1} of {parts.length} · {part.label} · {part.count.toLocaleString()}
            </option>
          ))}
          <option value='all'>All {total.toLocaleString()} at once (slow)</option>
        </select>
        <button type='button' className={stepButton} aria-label='Next part' disabled={!canNext} onClick={() => onChange(index + 1)}>
          <ChevronRightIcon className='h-14 w-14' />
        </button>
      </div>
    </div>
  )
}
