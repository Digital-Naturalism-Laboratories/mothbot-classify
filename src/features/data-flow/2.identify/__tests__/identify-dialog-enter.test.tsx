import { cleanup, render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { IdentifyDialog } from '~/features/data-flow/2.identify/identify-dialog'
import { projectSpeciesSelectionStore } from '~/stores/species/project-species-list'

window.HTMLElement.prototype.scrollIntoView = vi.fn()

// A selected species list that knows Insecta and Copeza.
vi.mock('~/features/data-flow/2.identify/species-search', () => ({
  searchSpecies: ({ query }: { query: string }) =>
    [
      { scientificName: 'Insecta', taxonRank: 'class', class: 'Insecta' },
      { scientificName: 'Copeza', taxonRank: 'genus', genus: 'Copeza' },
    ].filter((t) => query && t.scientificName.toLowerCase().includes(query.toLowerCase())),
}))

afterEach(() => {
  cleanup()
  projectSpeciesSelectionStore.set({})
})

function renderDialog(withSpeciesList: boolean) {
  if (withSpeciesList) projectSpeciesSelectionStore.set({ p: 'list.csv' })
  const onSubmit = vi.fn()
  render(<IdentifyDialog open={true} onOpenChange={() => {}} onSubmit={onSubmit} datasetId='p' detectionIds={['t']} />)
  return onSubmit
}

describe('IdentifyDialog - Enter', () => {
  it.each([false, true])('picks the highlighted taxon, not the half-typed text (species list: %s)', async (withSpeciesList) => {
    const user = userEvent.setup({ delay: null })
    const onSubmit = renderDialog(withSpeciesList)
    await user.keyboard('inse{Enter}')
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0]![0]).toBe('Insecta')
    expect(onSubmit.mock.calls[0]![1]).toMatchObject({ scientificName: 'Insecta', taxonRank: 'class' })
  })

  it('still adds a morphospecies when nothing matches', async () => {
    const user = userEvent.setup({ delay: null })
    const onSubmit = renderDialog(true)
    await user.keyboard('zzqx{Enter}')
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0]![0]).toBe('zzqx')
  })
})
