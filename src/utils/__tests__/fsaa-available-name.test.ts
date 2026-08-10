import { describe, expect, it } from 'vitest'
import { fsaaResolveAvailableFileName, type FileSystemDirectoryHandleLike } from '../fsaa'

/** Minimal in-memory stand-in for the File System Access API. */
function makeRoot(params: { dirs: string[]; files: string[] }): FileSystemDirectoryHandleLike {
  const { dirs, files } = params

  function makeDir(prefix: string): FileSystemDirectoryHandleLike {
    return {
      async getDirectoryHandle(name: string) {
        const next = prefix ? `${prefix}/${name}` : name
        if (!dirs.includes(next)) throw Object.assign(new Error('NotFound'), { name: 'NotFoundError' })
        return makeDir(next)
      },
      async getFileHandle(name: string) {
        const full = prefix ? `${prefix}/${name}` : name
        if (!files.includes(full)) throw Object.assign(new Error('NotFound'), { name: 'NotFoundError' })
        return {} as any
      },
    }
  }

  return makeDir('')
}

describe('fsaaResolveAvailableFileName', () => {
  it('keeps the original name when nothing collides', async () => {
    const root = makeRoot({ dirs: ['AMNH', 'AMNH/exports'], files: [] })
    const out = await fsaaResolveAvailableFileName(root, ['AMNH', 'exports', 'night_mosaic.png'])
    expect(out).toEqual(['AMNH', 'exports', 'night_mosaic.png'])
  })

  it('appends _2 when the name is taken', async () => {
    const root = makeRoot({
      dirs: ['AMNH', 'AMNH/exports'],
      files: ['AMNH/exports/night_mosaic.png'],
    })
    const out = await fsaaResolveAvailableFileName(root, ['AMNH', 'exports', 'night_mosaic.png'])
    expect(out).toEqual(['AMNH', 'exports', 'night_mosaic_2.png'])
  })

  it('skips past existing numbered versions', async () => {
    const root = makeRoot({
      dirs: ['AMNH', 'AMNH/exports'],
      files: [
        'AMNH/exports/night_mosaic.png',
        'AMNH/exports/night_mosaic_2.png',
        'AMNH/exports/night_mosaic_3.png',
      ],
    })
    const out = await fsaaResolveAvailableFileName(root, ['AMNH', 'exports', 'night_mosaic.png'])
    expect(out).toEqual(['AMNH', 'exports', 'night_mosaic_4.png'])
  })

  it('preserves the extension and dots inside the stem', async () => {
    const root = makeRoot({
      dirs: ['exports'],
      files: ['exports/list_doi.org.10.15468.png'],
    })
    const out = await fsaaResolveAvailableFileName(root, ['exports', 'list_doi.org.10.15468.png'])
    expect(out).toEqual(['exports', 'list_doi.org.10.15468_2.png'])
  })

  it('returns the original path when the folder does not exist yet', async () => {
    const root = makeRoot({ dirs: [], files: [] })
    const out = await fsaaResolveAvailableFileName(root, ['brand-new', 'exports', 'x.png'])
    expect(out).toEqual(['brand-new', 'exports', 'x.png'])
  })

  it('writes into the root folder when there are no directory parts', async () => {
    const root = makeRoot({ dirs: [], files: ['x.png'] })
    const out = await fsaaResolveAvailableFileName(root, ['x.png'])
    expect(out).toEqual(['x_2.png'])
  })

  it('gives up and reuses the original name once attempts run out', async () => {
    const root = makeRoot({
      dirs: ['exports'],
      files: ['exports/x.png', 'exports/x_2.png', 'exports/x_3.png'],
    })
    const out = await fsaaResolveAvailableFileName(root, ['exports', 'x.png'], { maxAttempts: 2 })
    expect(out).toEqual(['exports', 'x.png'])
  })
})
