import { describe, expect, it, beforeEach } from 'vitest'
import { morphoLinksStore, setMorphoLinksForActiveDataset } from '~/features/data-flow/3.persist/links'
import type { FileSystemDirectoryHandleLike, FileSystemFileHandleLike } from '~/utils/fs-directory-handle'
import { readTextFile } from '~/utils/fs-directory-handle'
import { serializeNdjsonLines } from '../parse-ndjson'
import {
  LEGACY_PACKAGE_MORPHO_LINKS_JSON,
  mergeMorphoLinksIntoStore,
  migrateLegacyMorphoLinksInPackage,
  morphoLinkRecordsToMap,
  morphoLinksMapToRecords,
  PACKAGE_MORPHO_LINKS_RECORD,
  parseMorphoLinksJson,
  parseMorphoLinksNdjson,
} from '../morpho-links-package'

describe('morpho-links-package', () => {
  it('parses and normalizes legacy morpho_links.json', () => {
    const links = parseMorphoLinksJson(
      JSON.stringify({
        'Netelia-1': 'https://www.inaturalist.org/taxa/1',
        Sp1: 'https://example.com/sp1',
      }),
    )

    expect(links).toEqual({
      'netelia-1': 'https://www.inaturalist.org/taxa/1',
      sp1: 'https://example.com/sp1',
    })
  })

  it('round-trips morpho link records as ndjson', async () => {
    const rows = morphoLinksMapToRecords({
      netelia1: 'https://www.inaturalist.org/taxa/1',
    })

    expect(rows).toEqual([{ morpho_key: 'netelia1', url: 'https://www.inaturalist.org/taxa/1' }])

    const text = serializeNdjsonLines(rows)
    const parsed = parseMorphoLinksNdjson(text)
    expect(parsed).toEqual({ netelia1: 'https://www.inaturalist.org/taxa/1' })
    expect(morphoLinkRecordsToMap(rows)).toEqual(parsed)
  })

  it('merges into the morpho links store', () => {
    morphoLinksStore.set({ existing: 'https://example.com/existing' })
    mergeMorphoLinksIntoStore({ newkey: 'https://example.com/new' })

    expect(morphoLinksStore.get()).toEqual({
      existing: 'https://example.com/existing',
      newkey: 'https://example.com/new',
    })
  })

  it('replaces the morpho links store for package loads', () => {
    morphoLinksStore.set({ stale: 'https://example.com/stale' })
    setMorphoLinksForActiveDataset({ links: { fresh: 'https://example.com/fresh' }, mode: 'replace' })

    expect(morphoLinksStore.get()).toEqual({ fresh: 'https://example.com/fresh' })
  })

  describe('migrateLegacyMorphoLinksInPackage', () => {
    beforeEach(() => {
      morphoLinksStore.set({})
    })

    it('migrates legacy root json into ndjson and removes the legacy file', async () => {
      const handle = createInMemoryPackageHandle({
        [LEGACY_PACKAGE_MORPHO_LINKS_JSON]: JSON.stringify({ 'mosquito 2': 'https://example.com/mosquito' }),
      })

      const result = await migrateLegacyMorphoLinksInPackage({ packageHandle: handle })

      expect(result).toEqual({ importedCount: 1, removedLegacyFile: true })
      expect(morphoLinksStore.get()).toEqual({ 'mosquito 2': 'https://example.com/mosquito' })

      const ndjsonText = await readTextFile(handle, PACKAGE_MORPHO_LINKS_RECORD)
      const parsed = parseMorphoLinksNdjson(ndjsonText)
      expect(parsed).toEqual({ 'mosquito 2': 'https://example.com/mosquito' })

      await expect(readTextFile(handle, LEGACY_PACKAGE_MORPHO_LINKS_JSON)).rejects.toThrow()
    })
  })
})

function createInMemoryPackageHandle(initialFiles: Record<string, string>): FileSystemDirectoryHandleLike {
  const files = new Map(Object.entries(initialFiles))

  function splitPath(relativePath: string) {
    return relativePath.replaceAll('\\', '/').replace(/^\/+/, '').split('/').filter(Boolean)
  }

  function createDirHandle(parts: string[]): FileSystemDirectoryHandleLike {
    return {
      async getDirectoryHandle(name: string, options?: { create?: boolean }) {
        const nextParts = [...parts, name]
        const prefix = `${nextParts.join('/')}/`
        const hasNested = [...files.keys()].some((path) => path.startsWith(prefix) || path === nextParts.join('/'))
        if (!hasNested && !options?.create) throw new Error(`Directory not found: ${name}`)
        return createDirHandle(nextParts)
      },
      async getFileHandle(name: string, options?: { create?: boolean }) {
        const path = [...parts, name].join('/')
        if (!files.has(path) && !options?.create) throw new Error(`File not found: ${path}`)
        if (options?.create && !files.has(path)) files.set(path, '')

        const filePath = path
        const handle: FileSystemFileHandleLike = {
          async getFile() {
            const text = files.get(filePath) ?? ''
            return {
              async text() {
                return text
              },
            } as File
          },
          async createWritable() {
            let content = files.get(filePath) ?? ''
            return {
              async write(data: Blob | string) {
                content = typeof data === 'string' ? data : await data.text()
              },
              async close() {
                files.set(filePath, content)
              },
            }
          },
        }
        return handle
      },
      async removeEntry(name: string) {
        const path = [...parts, name].join('/')
        if (!files.delete(path)) throw new Error(`Missing entry: ${path}`)
      },
    }
  }

  return createDirHandle([])
}
