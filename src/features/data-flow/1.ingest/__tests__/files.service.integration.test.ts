import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  return {
    pickDirectoryFilesWithPathsMock: vi.fn(),
    pickerErrorSetMock: vi.fn(),
    validateProjectRootSelectionMock: vi.fn(),
    persistPickedDirectoryMock: vi.fn(),
    forgetSavedDirectoryMock: vi.fn(),
    applyIndexedFilesStateMock: vi.fn(),
    singlePassIngestMock: vi.fn(),
  }
})

vi.mock('~/features/data-flow/1.ingest/files.fs', async () => {
  const actual = await vi.importActual<typeof import('~/features/data-flow/1.ingest/files.fs')>('~/features/data-flow/1.ingest/files.fs')
  return {
    ...actual,
    pickDirectoryFilesWithPaths: mocks.pickDirectoryFilesWithPathsMock,
  }
})

vi.mock('~/stores/ui', async () => {
  return {
    pickerErrorStore: {
      set: mocks.pickerErrorSetMock,
    },
  }
})

vi.mock('~/features/data-flow/1.ingest/files.validation', async () => {
  return {
    validateProjectRootSelection: mocks.validateProjectRootSelectionMock,
  }
})

vi.mock('~/features/data-flow/3.persist/files.persistence', async () => {
  return {
    persistPickedDirectory: mocks.persistPickedDirectoryMock,
    forgetSavedDirectory: mocks.forgetSavedDirectoryMock,
    ensureReadPermission: vi.fn(async () => true),
    loadSavedDirectory: vi.fn(async () => null),
  }
})

vi.mock('~/features/data-flow/1.ingest/files.initialize', async () => {
  return {
    applyIndexedFilesState: mocks.applyIndexedFilesStateMock,
  }
})

vi.mock('~/features/data-flow/1.ingest/files.single-pass', async () => {
  return {
    singlePassIngest: mocks.singlePassIngestMock,
  }
})

vi.mock('~/stores/dataset', async () => {
  return {
    datasetStore: {
      set: vi.fn(),
    },
  }
})

vi.mock('~/stores/entities', async () => {
  return {
    resetAllEntityStores: vi.fn(),
  }
})

vi.mock('~/features/data-flow/1.ingest/files.state', async () => {
  return {
    directoryFilesStore: { set: vi.fn() },
    selectedFilesStore: { set: vi.fn() },
  }
})

import { openDirectory } from '../files.service'

describe('files.service openDirectory integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.validateProjectRootSelectionMock.mockReturnValue({ ok: true })
    mocks.singlePassIngestMock.mockResolvedValue({ ok: true })
    mocks.persistPickedDirectoryMock.mockResolvedValue(undefined)
    mocks.forgetSavedDirectoryMock.mockResolvedValue(undefined)
  })

  it('re-prompts after too-deep pick and succeeds on second pick', async () => {
    const firstHandle = { name: 'night-1' }
    const secondHandle = { name: 'project-1' }

    mocks.pickDirectoryFilesWithPathsMock
      .mockResolvedValueOnce({
        indexed: [{ path: 'night-1/patches/a.jpg', name: 'a.jpg', size: 1 }],
        directoryHandle: firstHandle,
      })
      .mockResolvedValueOnce({
        indexed: [
          {
            path: 'project-1/site-1/deployment-1/night-1/patches/a.jpg',
            name: 'a.jpg',
            size: 1,
          },
        ],
        directoryHandle: secondHandle,
      })

    await openDirectory()

    expect(mocks.pickDirectoryFilesWithPathsMock).toHaveBeenCalledTimes(2)
    expect(mocks.pickerErrorSetMock).toHaveBeenCalledWith(expect.stringContaining('Please pick 2 level(s) up'))
    expect(mocks.persistPickedDirectoryMock).toHaveBeenCalledTimes(1)
    expect(mocks.persistPickedDirectoryMock).toHaveBeenCalledWith(secondHandle)
    expect(mocks.validateProjectRootSelectionMock).toHaveBeenCalledTimes(1)
    expect(mocks.applyIndexedFilesStateMock).toHaveBeenCalledTimes(1)
    expect(mocks.singlePassIngestMock).toHaveBeenCalledTimes(1)
    expect(mocks.forgetSavedDirectoryMock).not.toHaveBeenCalled()
    expect(mocks.pickerErrorSetMock).toHaveBeenLastCalledWith(null)
  })
})
