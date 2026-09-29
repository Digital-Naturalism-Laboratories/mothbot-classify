import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FileSystemDirectoryHandleLike, FileSystemFileHandleLike } from '~/utils/fs-directory-handle'
import { readTextFile } from '~/utils/fs-directory-handle'

const mocks = vi.hoisted(() => ({ idbGetMock: vi.fn(), idbPutMock: vi.fn() }))

vi.mock('~/utils/index-db', async () => {
  const actual = await vi.importActual<typeof import('~/utils/index-db')>('~/utils/index-db')
  return { ...actual, idbGet: mocks.idbGetMock, idbPut: mocks.idbPutMock }
})

import { morphoCoversStore } from '~/features/data-flow/3.persist/covers'
import { serializeNdjsonLines } from '../parse-ndjson'
import { parseMorphoCoverRecords } from '../parse-package-records'
import {
  morphoCoverRecordsToMap,
  morphoCoversToRecords,
  PACKAGE_MORPHO_COVERS_RECORD,
  syncMorphoCoversWithPackage,
} from '../morpho-covers-package'

const NIGHT = 'Hoya/Hoya_168m_doubleParina_2025-01-26/2025-01-26'

describe('morpho-covers-package', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    morphoCoversStore.set({})
  })

  it('round-trips covers as ndjson records', () => {
    const covers = { 'moth a': { leafGroupId: NIGHT, patchId: 'p1' } }
    const text = serializeNdjsonLines(morphoCoversToRecords(covers))

    expect(morphoCoverRecordsToMap(parseMorphoCoverRecords(text))).toEqual(covers)
  })

  it('loads covers from the package file and ignores the old browser-wide covers', async () => {
    mocks.idbGetMock.mockResolvedValue({ 'moth b': { leafGroupId: NIGHT, patchId: 'p2' } })
    const handle = createInMemoryHandle({
      [PACKAGE_MORPHO_COVERS_RECORD]: serializeNdjsonLines([{ morpho_key: 'moth a', leaf_group_id: NIGHT, patch_id: 'p1' }]),
    })

    const result = await syncMorphoCoversWithPackage({ packageHandle: handle, findPatch: () => ({ leafGroupId: NIGHT }) })

    expect(result).toEqual({ source: 'package', count: 1 })
    expect(morphoCoversStore.get()).toEqual({ 'moth a': { leafGroupId: NIGHT, patchId: 'p1' } })
  })

  it('seeds a package without a covers file from browser covers for its own patches only', async () => {
    mocks.idbGetMock.mockResolvedValue({
      'moth a': { leafGroupId: NIGHT, patchId: 'mine' },
      'moth b': { leafGroupId: 'Other/dep/2025-02-05', patchId: 'other-dataset' },
    })
    const handle = createInMemoryHandle({})

    const result = await syncMorphoCoversWithPackage({ packageHandle: handle, findPatch: (id) => (id === 'mine' ? { leafGroupId: NIGHT } : undefined) })

    expect(result).toEqual({ source: 'seeded', count: 1 })
    expect(morphoCoversStore.get()).toEqual({ 'moth a': { leafGroupId: NIGHT, patchId: 'mine' } })
    expect(parseMorphoCoverRecords(await readTextFile(handle, PACKAGE_MORPHO_COVERS_RECORD))).toEqual([
      { morpho_key: 'moth a', leaf_group_id: NIGHT, patch_id: 'mine' },
    ])
    // The shared browser covers stay intact for datasets not opened yet.
    expect(mocks.idbPutMock).not.toHaveBeenCalled()
  })

  it('matches old Classify covers keyed by crop file name and old night ids', async () => {
    mocks.idbGetMock.mockResolvedValue({
      'moth a': { leafGroupId: 'Hoya/168m/Hoya_168m_doubleParina_2025-01-26/2025-01-26', patchId: 'dp_HDR0_0_Mothbot_yolo1.pt.jpg' },
    })
    const handle = createInMemoryHandle({})
    const packagePatches: Record<string, { leafGroupId: string }> = { 'dp_HDR0_0_Mothbot_yolo1.pt': { leafGroupId: 'package-night' } }

    const result = await syncMorphoCoversWithPackage({ packageHandle: handle, findPatch: (id) => packagePatches[id] })

    expect(result).toEqual({ source: 'seeded', count: 1 })
    expect(morphoCoversStore.get()).toEqual({
      'moth a': { leafGroupId: 'package-night', patchId: 'dp_HDR0_0_Mothbot_yolo1.pt' },
    })
  })

  it('clears covers left from another dataset when this one has none', async () => {
    morphoCoversStore.set({ stale: { leafGroupId: NIGHT, patchId: 'from-previous-dataset' } })
    mocks.idbGetMock.mockResolvedValue(null)
    const handle = createInMemoryHandle({})

    const result = await syncMorphoCoversWithPackage({ packageHandle: handle, findPatch: () => undefined })

    expect(result).toEqual({ source: 'none', count: 0 })
    expect(morphoCoversStore.get()).toEqual({})
    await expect(readTextFile(handle, PACKAGE_MORPHO_COVERS_RECORD)).rejects.toThrow()
  })
})

function createInMemoryHandle(initialFiles: Record<string, string>): FileSystemDirectoryHandleLike {
  const files = new Map(Object.entries(initialFiles))

  function createDirHandle(parts: string[]): FileSystemDirectoryHandleLike {
    return {
      async getDirectoryHandle(name: string, options?: { create?: boolean }) {
        const nextParts = [...parts, name]
        const prefix = `${nextParts.join('/')}/`
        const hasNested = [...files.keys()].some((path) => path.startsWith(prefix))
        if (!hasNested && !options?.create) throw notFoundError()
        return createDirHandle(nextParts)
      },
      async getFileHandle(name: string, options?: { create?: boolean }) {
        const path = [...parts, name].join('/')
        if (!files.has(path) && !options?.create) throw notFoundError()
        if (options?.create && !files.has(path)) files.set(path, '')
        const handle: FileSystemFileHandleLike = {
          async getFile() {
            const text = files.get(path) ?? ''
            return { async text() { return text } } as File
          },
          async createWritable() {
            let content = files.get(path) ?? ''
            return {
              async write(data: Blob | string) {
                content = typeof data === 'string' ? data : await data.text()
              },
              async close() {
                files.set(path, content)
              },
            }
          },
        }
        return handle
      },
    }
  }

  return createDirHandle([])
}

function notFoundError() {
  const err = new Error('not found on disk')
  err.name = 'NotFoundError'
  return err
}
