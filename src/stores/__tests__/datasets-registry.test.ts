import { beforeEach, describe, expect, it } from 'vitest'
import { mothboxNextPackageStore } from '~/features/mothbox-next/active-package'
import { projectsStore } from '~/stores/entities/1.projects'
import { resetAllEntityStores } from '~/stores/entities'
import {
  activeDatasetFolderNameStore,
  datasetsRegistryStore,
  setActiveDatasetFolderName,
  setDatasetsRegistry,
} from '../datasets-registry'

describe('setDatasetsRegistry', () => {
  beforeEach(() => {
    resetAllEntityStores()
    datasetsRegistryStore.set([])
    activeDatasetFolderNameStore.set(null)
  })

  it('clears active folder when it is no longer in the registry', () => {
    setActiveDatasetFolderName('removed-dataset')
    setDatasetsRegistry([{ folderName: 'other-dataset', hasManifest: true }])

    expect(activeDatasetFolderNameStore.get()).toBeNull()
  })

  it('keeps active folder when it remains in the registry', () => {
    setActiveDatasetFolderName('kept-dataset')
    setDatasetsRegistry([
      { folderName: 'kept-dataset', hasManifest: true },
      { folderName: 'other-dataset', hasManifest: true },
    ])

    expect(activeDatasetFolderNameStore.get()).toBe('kept-dataset')
  })

  it('clears open package entities when active folder leaves the registry', () => {
    projectsStore.set({ Hoya: { id: 'Hoya', name: 'Hoya' } })
    mothboxNextPackageStore.set({
      packageRoot: 'Hoya',
      manifest: { dataset_id: 'Hoya', hierarchy: { levels: [] } },
      loaded: {} as never,
    })
    setActiveDatasetFolderName('removed-dataset')

    setDatasetsRegistry([{ folderName: 'other-dataset', hasManifest: true }])

    expect(activeDatasetFolderNameStore.get()).toBeNull()
    expect(mothboxNextPackageStore.get()).toBeNull()
    expect(projectsStore.get()).toEqual({})
  })
})
