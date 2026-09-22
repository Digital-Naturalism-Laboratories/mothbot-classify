import { afterEach, describe, expect, it, vi } from 'vitest'

/** A Process handoff must open the named dataset or nothing — never a different one. */
describe('startup dataset resolution with a Process handoff', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/')
    vi.resetModules()
  })

  async function setup(search: string, folderNames: string[]) {
    vi.resetModules()
    window.history.replaceState(null, '', `/${search}`)
    const registry = await import('~/stores/datasets-registry')
    registry.datasetsRegistryStore.set(
      folderNames.map((folderName) => ({ folderName }) as unknown as import('~/stores/datasets-registry').DatasetRegistryEntry),
    )
    const mod = await import('../ensure-default-dataset-open')
    return { mod, registry }
  }

  it('highlights the requested dataset when it is in the registry', async () => {
    const { mod, registry } = await setup('?dataset=Maine', ['AMNH', 'Maine'])
    expect(mod.rememberDefaultDatasetSelection()).toBe(true)
    expect(registry.activeDatasetFolderNameStore.get()).toBe('Maine')
  })

  it('does NOT fall back to another dataset when the requested one is missing', async () => {
    const { mod, registry } = await setup('?dataset=Maine', ['AMNH', 'BikeBlitz'])
    expect(mod.rememberDefaultDatasetSelection()).toBe(false)
    expect(registry.activeDatasetFolderNameStore.get()).toBeNull()
  })

  it('uses the normal default when there is no handoff', async () => {
    const { mod, registry } = await setup('', ['BikeBlitz', 'AMNH'])
    expect(mod.rememberDefaultDatasetSelection()).toBe(true)
    expect(registry.activeDatasetFolderNameStore.get()).toBe('AMNH') // alphabetical first
  })
})
