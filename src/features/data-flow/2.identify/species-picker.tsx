import { useStore } from '@nanostores/react'
import { AlertTriangleIcon, CheckCircleIcon, XCircleIcon } from 'lucide-react'
import { useMemo } from 'react'
import { toast } from 'sonner'
import { Icon } from '~/components/atomic/Icon'
import { CommandDialog, CommandEmpty, CommandInput, CommandItem, CommandList } from '~/components/ui/command'
import { projectSpeciesSelectionStore, saveProjectSpeciesSelection } from '~/stores/species/project-species-list'
import { SpeciesList, speciesListsStore } from '~/features/data-flow/2.identify/species-list.store'
import { isInSpeciesNamedFolder } from '~/features/data-flow/1.ingest/species-indexed-paths'
import { describeSpeciesListValidation } from '~/models/taxonomy/species-list-validation'
import { cn } from '~/utils/cn'
import { Column } from '~/styles'
import { $isSpeciesPickerOpen, $speciesPickerProjectId } from './species-picker.state'

// state is in species-picker.state.ts to satisfy fast refresh rules

export function SpeciesPicker() {
  const isOpen = useStore($isSpeciesPickerOpen)
  const projectId = useStore($speciesPickerProjectId) || ''
  const lists = useStore(speciesListsStore)
  const selection = useStore(projectSpeciesSelectionStore)

  const options = useMemo(() => {
    const all = Object.values(lists ?? {})
    return [...all].sort((a, b) => {
      // Unusable CSVs sink to the bottom — they're still listed so the user can
      // see why a file they expected to work isn't selectable.
      const aInvalid = a.validation?.status === 'invalid'
      const bInvalid = b.validation?.status === 'invalid'
      if (aInvalid !== bInvalid) return aInvalid ? 1 : -1

      const aInSpecies = isInSpeciesNamedFolder(a.sourcePath ?? '')
      const bInSpecies = isInSpeciesNamedFolder(b.sourcePath ?? '')
      if (aInSpecies !== bInSpecies) return aInSpecies ? -1 : 1
      return (a.name ?? '').localeCompare(b.name ?? '')
    })
  }, [lists])

  function handleSelect(listId: string) {
    if (!listId || !projectId) return

    const chosen = lists?.[listId]
    const validation = chosen?.validation

    // A CSV that isn't a species list can't be used — keep the picker open so
    // the user can choose a different one instead of silently getting nothing.
    if (validation?.status === 'invalid') {
      toast.error(`“${chosen?.fileName ?? 'This file'}” can't be used as a species list`, {
        description: `${validation.reason ?? ''} Pick a different CSV.`.trim(),
      })
      return
    }

    if (validation?.status === 'incomplete') {
      toast.warning(`“${chosen?.fileName ?? 'This list'}” is incomplete`, {
        description: validation.reason,
      })
    }

    void saveProjectSpeciesSelection({ projectId, speciesListId: listId })
    $isSpeciesPickerOpen.set(false)
  }

  function handleOpenChange(next: boolean) {
    $isSpeciesPickerOpen.set(next)
  }

  return (
    <CommandDialog open={isOpen} onOpenChange={handleOpenChange} className='max-w-[520px] !p-0'>
      <CommandInput placeholder='Search species lists…' withSearchIcon />
      <CommandList className='p-8'>
        <CommandEmpty>No species lists found.</CommandEmpty>

        {options.map((opt) => (
          <ListItem key={opt.id} list={opt} isSelected={selection?.[projectId] === opt.id} onSelect={handleSelect} />
        ))}
      </CommandList>
    </CommandDialog>
  )
}

function ListItem(props: { list: SpeciesList; isSelected?: boolean; onSelect: (id: string) => void }) {
  const { list, isSelected, onSelect } = props

  const status = list.validation?.status
  const isInvalid = status === 'invalid'
  const isIncomplete = status === 'incomplete'
  const statusLabel = describeSpeciesListValidation(list.validation)

  return (
    <CommandItem onSelect={() => onSelect(list.id)} className='text-ellipsis !py-4'>
      <Column className='gap-2 flex-1 min-w-0'>
        <span className={cn('flex-1 flex items-center gap-6', isInvalid && 'text-ink-secondary')}>
          <span className='truncate'>{list.name}</span>
          {statusLabel ? (
            <span
              className={cn(
                'shrink-0 rounded px-4 py-1 text-10 font-medium',
                isInvalid ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700',
              )}
            >
              {statusLabel}
            </span>
          ) : null}
        </span>
        <span className='flex-1 text-11 font-mono text-ink-secondary truncate'>{list.sourcePath || list.doi}</span>
        {list.validation?.reason ? (
          <span className={cn('text-11', isInvalid ? 'text-red-600' : 'text-amber-600')}>{list.validation.reason}</span>
        ) : null}
      </Column>
      {isSelected ? <Icon icon={CheckCircleIcon} className='text-brand mr-6 shrink-0' /> : null}
      {isInvalid ? <Icon icon={XCircleIcon} className='text-red-500 mr-6 shrink-0' /> : null}
      {isIncomplete && !isSelected ? <Icon icon={AlertTriangleIcon} className='text-amber-500 mr-6 shrink-0' /> : null}
    </CommandItem>
  )
}
