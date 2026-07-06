import { useStore } from '@nanostores/react'
import { leafGroupsStore } from '~/stores/entities/leaf-groups'
import { leafGroupSummariesStore } from '~/stores/entities/night-summaries'
import { activeHierarchyStore } from '~/features/mothbox-next/active-hierarchy'
import { activeNightIdsStore, setActiveNightIds, toggleActiveNightId } from '~/stores/ui'
import { PanelHeading } from '~/styles'
import { cn } from '~/utils/cn'

type Props = {
  className?: string
}

export function NightSelectorSection(props: Props) {
  const { className } = props
  const leafGroups = useStore(leafGroupsStore)
  const summaries = useStore(leafGroupSummariesStore)
  const activeNightIds = useStore(activeNightIdsStore)
  const hierarchy = useStore(activeHierarchyStore)

  const leafGroupIds = hierarchy?.leafGroupIds ?? []
  const nights = leafGroupIds
    .map((id) => leafGroups[id])
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name))

  if (nights.length < 2) return null

  const allSelected = nights.every((n) => activeNightIds.has(n.id))

  function toggleSelectAll() {
    if (allSelected) {
      // Deselect all but keep the first one active (at least one must be selected)
      setActiveNightIds([nights[0]!.id])
    } else {
      setActiveNightIds(nights.map((n) => n.id))
    }
  }

  return (
    <div className={cn('mb-16', className)}>
      <div className='mb-6 flex items-center justify-between'>
        <PanelHeading>Nights</PanelHeading>
        <button
          type='button'
          onClick={toggleSelectAll}
          className='text-12 text-blue-600 hover:text-blue-800 cursor-pointer select-none'
        >
          {allSelected ? 'Deselect all' : 'Select all'}
        </button>
      </div>
      <div className='space-y-2'>
        {nights.map((night) => {
          const checked = activeNightIds.has(night.id)
          const summary = summaries?.[night.id]
          return (
            <label
              key={night.id}
              className='flex items-center gap-8 cursor-pointer text-13 select-none'
            >
              <input
                type='checkbox'
                checked={checked}
                onChange={() => toggleActiveNightId(night.id)}
                className='rounded accent-blue-600 cursor-pointer'
              />
              <span
                className={cn(
                  'flex-1 truncate',
                  checked ? 'text-ink-primary font-medium' : 'text-ink-secondary',
                )}
              >
                {night.name}
              </span>
              {summary != null && (
                <span className='text-neutral-400 text-12 font-mono tabular-nums'>
                  {summary.totalDetections}
                </span>
              )}
            </label>
          )
        })}
      </div>
    </div>
  )
}
