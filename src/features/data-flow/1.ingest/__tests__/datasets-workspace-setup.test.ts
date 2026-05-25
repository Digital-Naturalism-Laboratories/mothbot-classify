import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pickerErrorStore } from '~/stores/ui'
import { hydrateDatasetsWorkspaceFromDisk } from '../datasets-workspace-setup'

vi.mock('~/features/data-flow/3.persist/files.persistence', () => ({
  loadDatasetsDirectory: vi.fn(async () => ({ name: 'datasets' })),
  ensureReadPermission: vi.fn(async () => true),
}))

vi.mock('~/stores/datasets-workspace', () => ({
  setDatasetsWorkspaceFolderName: vi.fn(),
  clearDatasetsWorkspace: vi.fn(),
}))

vi.mock('~/stores/datasets-registry', () => ({
  clearDatasetsRegistry: vi.fn(),
}))

vi.mock('../scan-datasets-folder', () => ({
  scanDatasetsFolder: vi.fn(),
}))

vi.mock('../load-workspace-species-lists', () => ({
  loadWorkspaceSpeciesLists: vi.fn(async () => 0),
}))

vi.mock('../ensure-default-dataset-open', () => ({
  rememberDefaultDatasetSelection: vi.fn(() => false),
}))

import { scanDatasetsFolder } from '../scan-datasets-folder'

describe('hydrateDatasetsWorkspaceFromDisk', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    pickerErrorStore.set(null)
  })

  it('surfaces scan failure in pickerErrorStore', async () => {
    vi.mocked(scanDatasetsFolder).mockRejectedValueOnce(new Error('scan failed'))

    const ok = await hydrateDatasetsWorkspaceFromDisk()

    expect(ok).toBe(false)
    expect(pickerErrorStore.get()).toMatch(/could not scan/i)
  })

  it('clears picker error after successful setup', async () => {
    pickerErrorStore.set('previous error')
    vi.mocked(scanDatasetsFolder).mockResolvedValueOnce([])

    const ok = await hydrateDatasetsWorkspaceFromDisk()

    expect(ok).toBe(true)
    expect(pickerErrorStore.get()).toBeNull()
  })
})
