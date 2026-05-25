import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  return {
    pickDirectoryFilesWithPathsMock: vi.fn(),
    pickerErrorSetMock: vi.fn(),
    normalizeIndexedFilesForIngestMock: vi.fn(),
    ingestIndexedFolderFilesMock: vi.fn(),
    persistPickedDirectoryMock: vi.fn(),
    forgetSavedDirectoryMock: vi.fn(),
  }
})

vi.mock('~/features/data-flow/1.ingest/files.fs', async () => {
  const actual = await vi.importActual<typeof import('~/features/data-flow/1.ingest/files.fs')>('~/features/data-flow/1.ingest/files.fs')
  return {
    ...actual,
    pickDirectoryFilesWithPaths: mocks.pickDirectoryFilesWithPathsMock,
    normalizeIndexedFilesForIngest: mocks.normalizeIndexedFilesForIngestMock,
  }
})

vi.mock('~/stores/ui', async () => {
  return {
    pickerErrorStore: {
      set: mocks.pickerErrorSetMock,
    },
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

vi.mock('~/features/data-flow/1.ingest/ingest-folder-pipeline', async () => {
  return {
    ingestIndexedFolderFiles: mocks.ingestIndexedFolderFilesMock,
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
    mocks.ingestIndexedFolderFilesMock.mockImplementation(async () => {
      mocks.pickerErrorSetMock(null)
      return { ok: true, ingestMode: 'legacy', fileCount: 1 }
    })
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

    mocks.normalizeIndexedFilesForIngestMock
      .mockReturnValueOnce({ ok: false, levelsUp: 2, message: 'too deep' })
      .mockReturnValueOnce({
        ok: true,
        files: [
          {
            path: 'project-1/site-1/deployment-1/night-1/patches/a.jpg',
            name: 'a.jpg',
            size: 1,
          },
        ],
      })

    await openDirectory()

    expect(mocks.pickDirectoryFilesWithPathsMock).toHaveBeenCalledTimes(2)
    expect(mocks.pickerErrorSetMock).toHaveBeenCalledWith('too deep')
    expect(mocks.persistPickedDirectoryMock).toHaveBeenCalledTimes(1)
    expect(mocks.persistPickedDirectoryMock).toHaveBeenCalledWith(secondHandle)
    expect(mocks.ingestIndexedFolderFilesMock).toHaveBeenCalledTimes(1)
    expect(mocks.ingestIndexedFolderFilesMock).toHaveBeenCalledWith(
      expect.objectContaining({ pathsAlreadyNormalized: true }),
    )
    expect(mocks.forgetSavedDirectoryMock).not.toHaveBeenCalled()
    expect(mocks.pickerErrorSetMock).toHaveBeenLastCalledWith(null)
  })
})
