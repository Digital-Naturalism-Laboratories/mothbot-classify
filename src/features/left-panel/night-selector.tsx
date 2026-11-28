import { useStore } from '@nanostores/react'
import { leafGroupsStore, type LeafGroupEntity } from '~/stores/entities/leaf-groups'
import { deploymentsStore } from '~/stores/entities/3.deployments'
import { leafGroupSummariesStore } from '~/stores/entities/night-summaries'
import { activeHierarchyStore } from '~/features/mothbox-next/active-hierarchy'
import { activeNightIdsStore, setActiveNightIds, toggleActiveNightId } from '~/stores/ui'
import { PanelHeading } from '~/styles'
import { cn } from '~/utils/cn'

type Props = {
  className?: string
  /**
   * Patches each night shows with the chosen detection run. Without it, a night's
   * summary is used, which counts every run.
   */
  countByNight?: Record<string, number>
}

export function NightSelectorSection(props: Props) {
  const { className, countByNight } = props
  const leafGroups = useStore(leafGroupsStore)
  const deployments = useStore(deploymentsStore)
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

  // Nights of different deployments can share a date: list them under their deployment.
  const groups = new Map<string, LeafGroupEntity[]>()
  for (const night of nights) {
    const key = night.deploymentId ?? ''
    groups.set(key, [...(groups.get(key) ?? []), night])
  }
  const grouped = groups.size > 1
  const deploymentName = (id: string) =>
    Object.values(deployments ?? {}).find((d) => d.id === id || d.id.endsWith(`/${id}`))?.name ?? id

  const nightRow = (night: LeafGroupEntity) => {
    const checked = activeNightIds.has(night.id)
    const count = countByNight ? countByNight[night.id] ?? 0 : summaries?.[night.id]?.totalDetections
    return (
      <label key={night.id} className='flex items-center gap-8 cursor-pointer text-13 select-none'>
        <input
          type='checkbox'
          checked={checked}
          onChange={() => toggleActiveNightId(night.id)}
          className='rounded accent-blue-600 cursor-pointer'
        />
        <span className={cn('flex-1 truncate', checked ? 'text-ink-primary font-medium' : 'text-ink-secondary')}>
          {night.name}
        </span>
        {count != null && <span className='text-neutral-400 text-12 font-mono tabular-nums'>{count}</span>}
      </label>
    )
  }

  return (
    <div className={cn('mb-16', className)}>
      <div className='mb-6 flex items-center justify-between'>
        <PanelHeading>Sessions</PanelHeading>
        <button
          type='button'
          onClick={toggleSelectAll}
          className='text-12 text-blue-600 hover:text-blue-800 cursor-pointer select-none'
        >
          {allSelected ? 'Deselect all' : 'Select all'}
        </button>
      </div>
      {grouped ? (
        <div className='space-y-8'>
          {[...groups.entries()]
            .sort(([a], [b]) => deploymentName(a).localeCompare(deploymentName(b)))
            .map(([deploymentId, list]) => (
              <div key={deploymentId} className='space-y-2'>
                <div className='truncate text-12 font-medium text-neutral-500'>{deploymentName(deploymentId)}</div>
                {list.map(nightRow)}
              </div>
            ))}
        </div>
      ) : (
        <div className='space-y-2'>{nights.map(nightRow)}</div>
      )}
    </div>
  )
}
