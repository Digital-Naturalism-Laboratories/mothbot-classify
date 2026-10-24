import { useStore } from '@nanostores/react'
import { ListChecksIcon } from 'lucide-react'
import { Icon } from '~/components/atomic/Icon'
import { projectSpeciesSelectionStore } from '~/stores/species/project-species-list'
import { projectsStore } from '~/stores/entities/1.projects'
import { speciesListsLoadingStore, speciesListsStore } from './species-list.store'
import { $isSpeciesPickerOpen, $speciesPickerProjectId } from './species-picker.state'
import { cn } from '~/utils/cn'

/**
 * Shows the project's species list and opens the picker to choose or change it.
 * The picker also offers "Select other species list…" for a CSV anywhere on disk.
 */
export function SpeciesListControl(props: { projectId?: string; className?: string }) {
  const { className } = props
  const selection = useStore(projectSpeciesSelectionStore)
  const lists = useStore(speciesListsStore)
  const isLoading = useStore(speciesListsLoadingStore)
  const projects = useStore(projectsStore)
  // Opened outside a dataset's pages (e.g. the top bar's Species window), use the open dataset.
  const projectId = props.projectId || Object.keys(projects ?? {})[0]

  if (!projectId) return null

  const listId = selection?.[projectId]
  const listName = listId ? lists?.[listId]?.name : undefined

  function openPicker() {
    if (!projectId) return
    $speciesPickerProjectId.set(projectId)
    $isSpeciesPickerOpen.set(true)
  }

  return (
    <button
      type='button'
      onClick={openPicker}
      disabled={isLoading}
      className={cn(
        'inline-flex min-w-0 items-center gap-6 rounded-md px-8 py-4 text-left text-13',
        'transition-colors hover:bg-neutral-100 disabled:cursor-wait disabled:opacity-70',
        listName ? 'text-neutral-600' : 'text-amber-700',
        className,
      )}
    >
      <Icon icon={ListChecksIcon} className='shrink-0 opacity-70' />
      <span className='truncate'>
        {isLoading ? 'Loading species lists…' : listName ? `Species list: ${listName}` : 'No species list selected'}
      </span>
      {!isLoading ? <span className='shrink-0 font-medium text-neutral-900 underline underline-offset-2'>{listName ? 'Change' : 'Choose'}</span> : null}
    </button>
  )
}
