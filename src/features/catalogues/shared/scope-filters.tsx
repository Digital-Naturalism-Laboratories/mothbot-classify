import { cn } from '~/utils/cn'

export type ScopeType = 'all' | 'project' | 'site' | 'deployment' | 'night'

export type ScopeFiltersProps = {
  scope: ScopeType
  onScopeChange: (s: ScopeType) => void
  hasProject: boolean
  hasSite: boolean
  hasDeployment: boolean
  hasNight: boolean
  counts?: Record<ScopeType, number>
}

export function ScopeFilters(props: ScopeFiltersProps) {
  const { scope, onScopeChange, hasProject, hasSite, hasDeployment, hasNight, counts } = props
  const items: Array<{ key: ScopeType; label: string; disabled?: boolean; count?: number }> = [
    { key: 'all', label: 'All Datasets', count: counts?.all },
    { key: 'project', label: 'This Dataset', disabled: !hasProject, count: counts?.project },
    { key: 'site', label: 'This Site', disabled: !hasSite, count: counts?.site },
    { key: 'deployment', label: 'This Deployment', disabled: !hasDeployment, count: counts?.deployment },
    { key: 'night', label: 'This Night', disabled: !hasNight, count: counts?.night },
  ]
  return (
    <div className='flex items-center gap-6'>
      {items.map((it) => (
        <button
          key={it.key}
          className={cn(
            '!text-14 text-ink-primary/80 font-normal px-8 py-4 rounded ring-1 ring-inset ring-black/10 inline-flex items-center gap-6',
            scope === it.key && 'ring-black/50 text-ink-primary',
            it.disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-neutral-50',
          )}
          disabled={it.disabled}
          onClick={() => {
            if (it.disabled) return
            onScopeChange(it.key)
          }}
        >
          {it.label}
          {typeof it.count === 'number' ? <CountPill value={it.count} /> : null}
        </button>
      ))}
    </div>
  )
}

function CountPill(props: { value: number }) {
  const { value } = props
  return (
    <span
      className={cn(
        '!text-11 rounded-[2px] !min-w-16 bg-neutral-50 px-2 !py-1 text-neutral-700 ring-1 ring-inset ring-neutral-100',
        value > 0 && 'bg-neutral-100 ring-neutral-200',
      )}
    >
      {value}
    </span>
  )
}
