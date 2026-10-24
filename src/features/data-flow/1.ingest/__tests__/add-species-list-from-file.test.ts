import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FileSystemDirectoryHandleLike } from '~/utils/fs-directory-handle'

// jsdom's Blob lacks arrayBuffer()/text(), which every browser has.
function readBlob<T>(blob: Blob, read: (reader: FileReader) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as T)
    reader.onerror = () => reject(reader.error)
    read(reader)
  })
}
Blob.prototype.arrayBuffer ??= function (this: Blob) {
  return readBlob<ArrayBuffer>(this, (r) => r.readAsArrayBuffer(this))
}
Blob.prototype.text ??= function (this: Blob) {
  return readBlob<string>(this, (r) => r.readAsText(this))
}

const mocks = vi.hoisted(() => ({
  root: null as FileSystemDirectoryHandleLike | null,
  validity: 'valid' as 'valid' | 'invalid',
}))

vi.mock('~/features/data-flow/1.ingest/datasets-folder-handle', () => ({
  requireDatasetsFolderHandle: async () => mocks.root,
}))

// Parsing runs in a Web Worker in the app; here just register the list by file name.
vi.mock('~/features/data-flow/1.ingest/species.ingest', async () => {
  const { speciesListsStore } = await import('~/features/data-flow/2.identify/species-list.store')
  return {
    ingestSpeciesListsFromFiles: async (params: { files: Array<{ name: string; path: string }> }) => {
      const lists = { ...speciesListsStore.get() }
      for (const f of params.files) {
        lists[f.name] = {
          id: f.name,
          fileName: f.name,
          name: f.name,
          doi: '',
          sourcePath: f.path,
          recordCount: 1,
          records: [],
          validation: mocks.validity === 'invalid' ? { status: 'invalid', reason: 'No taxon columns' } : { status: 'valid' },
        } as never
      }
      speciesListsStore.set(lists)
    },
  }
})

vi.mock('~/utils/index-db', async () => {
  const actual = await vi.importActual<typeof import('~/utils/index-db')>('~/utils/index-db')
  return { ...actual, idbGet: vi.fn(), idbPut: vi.fn() }
})

import { addSpeciesListFromFile } from '../add-species-list-from-file'
import { speciesListsStore } from '~/features/data-flow/2.identify/species-list.store'
import { projectSpeciesSelectionStore } from '~/stores/species/project-species-list'

describe('addSpeciesListFromFile', () => {
  let files: Map<string, Blob>

  beforeEach(() => {
    files = new Map()
    mocks.root = createMemoryDir(files, [])
    mocks.validity = 'valid'
    speciesListsStore.set({})
    projectSpeciesSelectionStore.set({})
  })

  it('copies the list into Species/ and selects it for the project', async () => {
    const id = await addSpeciesListFromFile({ file: csv('alaska.csv', 'species\nA b'), projectId: 'proj' })

    expect(id).toBe('alaska.csv')
    expect(await files.get('Species/alaska.csv')?.text()).toBe('species\nA b')
    expect(projectSpeciesSelectionStore.get()).toEqual({ proj: 'alaska.csv' })
    expect(speciesListsStore.get()['alaska.csv']?.sourcePath).toBe('Species/alaska.csv')
  })

  it('reuses an identical copy instead of duplicating it', async () => {
    files.set('Species/alaska.csv', csv('alaska.csv', 'species\nA b'))

    const id = await addSpeciesListFromFile({ file: csv('alaska.csv', 'species\nA b'), projectId: 'proj' })

    expect(id).toBe('alaska.csv')
    expect([...files.keys()]).toEqual(['Species/alaska.csv'])
  })

  it('never overwrites a different list with the same name', async () => {
    files.set('Species/alaska.csv', csv('alaska.csv', 'species\nOld list'))

    const id = await addSpeciesListFromFile({ file: csv('alaska.csv', 'species\nNew list'), projectId: 'proj' })

    expect(id).toBe('alaska (2).csv')
    expect(await files.get('Species/alaska.csv')?.text()).toBe('species\nOld list')
    expect(await files.get('Species/alaska (2).csv')?.text()).toBe('species\nNew list')
  })

  it('does not copy or select a file that is not a species list', async () => {
    mocks.validity = 'invalid'

    const id = await addSpeciesListFromFile({ file: csv('notes.csv', 'hello'), projectId: 'proj' })

    expect(id).toBeNull()
    expect(files.size).toBe(0)
    expect(speciesListsStore.get()).toEqual({})
    expect(projectSpeciesSelectionStore.get()).toEqual({})
  })

  it('still loads the list for this session without a datasets folder', async () => {
    mocks.root = null

    const id = await addSpeciesListFromFile({ file: csv('alaska.csv', 'species\nA b'), projectId: 'proj' })

    expect(id).toBe('alaska.csv')
    expect(projectSpeciesSelectionStore.get()).toEqual({ proj: 'alaska.csv' })
  })
})

function csv(name: string, text: string) {
  return new File([text], name, { type: 'text/csv' })
}

function createMemoryDir(files: Map<string, Blob>, parts: string[]): FileSystemDirectoryHandleLike {
  const prefix = parts.length ? `${parts.join('/')}/` : ''
  const notFound = () => Object.assign(new Error('not found'), { name: 'NotFoundError' })
  return {
    async getDirectoryHandle(name: string, options?: { create?: boolean }) {
      const exists = [...files.keys()].some((p) => p.startsWith(`${prefix}${name}/`))
      if (!exists && !options?.create) throw notFound()
      return createMemoryDir(files, [...parts, name])
    },
    async getFileHandle(name: string, options?: { create?: boolean }) {
      const path = `${prefix}${name}`
      if (!files.has(path) && !options?.create) throw notFound()
      return {
        async getFile() {
          const blob = files.get(path) ?? new Blob([])
          return new File([blob], name)
        },
        async createWritable() {
          let content: Blob = new Blob([])
          return {
            async write(data: Blob | string) {
              content = typeof data === 'string' ? new Blob([data]) : data
            },
            async close() {
              files.set(path, content)
            },
          }
        },
      }
    },
  } as FileSystemDirectoryHandleLike
}
