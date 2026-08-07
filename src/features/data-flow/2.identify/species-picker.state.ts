import { atom } from 'nanostores'
import { toast } from 'sonner'
import { speciesListsStore } from '~/features/data-flow/2.identify/species-list.store'
import { projectSpeciesSelectionStore } from '~/stores/species/project-species-list'

export const $isSpeciesPickerOpen = atom<boolean>(false)
export const $speciesPickerProjectId = atom<string | undefined>(undefined)

export function ensureSpeciesListSelection(params: { projectId?: string; onReady: () => void }) {
  const { projectId, onReady } = params

  if (!projectId) {
    const proceed = onReady
    proceed()
    return
  }

  const selectionByProject = projectSpeciesSelectionStore.get() || {}
  const lists = speciesListsStore.get() || {}
  const selectedId = selectionByProject?.[projectId]
  const selectedList = selectedId ? lists[selectedId] : undefined

  // A selection saved earlier can point at a CSV that turned out not to be a
  // species list (or was edited on disk since). Re-prompt instead of letting the
  // user identify against a list with nothing usable in it.
  const selectionIsUnusable = !!selectedId && (!selectedList || selectedList.validation?.status === 'invalid')
  const hasSelection = !!selectedId && !selectionIsUnusable
  const anySpeciesLists = Object.keys(lists).length > 0

  if (hasSelection || !anySpeciesLists) {
    const proceed = onReady
    proceed()
    return
  }

  if (selectionIsUnusable) {
    toast.error('Your saved species list can’t be used', {
      description: selectedList?.validation?.reason ?? 'The file is missing or is no longer a valid species list. Choose a different CSV.',
    })
  }

  $speciesPickerProjectId.set(projectId)
  $isSpeciesPickerOpen.set(true)

  let cleaned = false
  let unsubSelection: () => void = () => {}
  let unsubOpen: () => void = () => {}

  function cleanup() {
    if (cleaned) return
    cleaned = true
    unsubSelection()
    unsubOpen()
  }

  unsubSelection = projectSpeciesSelectionStore.subscribe((val) => {
    const nextHas = !!(val || {})?.[projectId]
    if (nextHas) {
      cleanup()
      const proceed = onReady
      proceed()
    }
  })

  unsubOpen = $isSpeciesPickerOpen.subscribe((open) => {
    if (!open) cleanup()
  })
}
