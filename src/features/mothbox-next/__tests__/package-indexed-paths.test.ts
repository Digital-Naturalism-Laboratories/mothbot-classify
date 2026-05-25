import { describe, expect, it } from 'vitest'
import {
  createPackageFileAccessFromIndexedFiles,
  normalizeIndexedPathsToPackageRoot,
} from '../package-indexed-access'

describe('normalizeIndexedPathsToPackageRoot', () => {
  it('strips picked directory name so package paths are relative to dataset.json', () => {
    const files = [
      { path: 'dinacon2025/dataset.json', name: 'dataset.json' },
      { path: 'dinacon2025/02_records/patches.ndjson', name: 'patches.ndjson' },
      { path: 'dinacon2025/01_patches/foo.jpg', name: 'foo.jpg' },
    ]

    const normalized = normalizeIndexedPathsToPackageRoot(files)

    expect(normalized.map((f) => f.path)).toEqual([
      'dataset.json',
      '02_records/patches.ndjson',
      '01_patches/foo.jpg',
    ])
  })

  it('treats patches folder as present when patch assets are indexed', async () => {
    const stubFile = { size: 1 } as File
    const files = normalizeIndexedPathsToPackageRoot([
      { path: 'dinacon2025/dataset.json', name: 'dataset.json', file: stubFile },
      { path: 'dinacon2025/01_patches/foo.jpg', name: 'foo.jpg', file: stubFile },
    ])

    const access = createPackageFileAccessFromIndexedFiles({ files: files as any, packageRoot: '' })
    expect(await access.fileExists('01_patches/')).toBe(true)
  })

  it('resolves in-place patch assets under a nested deployment folder', async () => {
    const deployment = 'Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20'
    const patchPath = `${deployment}/patches/hopeCobo_0.jpg`
    const stubFile = { size: 1 } as File
    const files = [
      { path: 'dataset.json', name: 'dataset.json', file: stubFile },
      { path: '02_records/patches.ndjson', name: 'patches.ndjson', file: stubFile },
      { path: patchPath, name: 'hopeCobo_0.jpg', file: stubFile },
    ]

    const access = createPackageFileAccessFromIndexedFiles({ files: files as any, packageRoot: '' })
    expect(await access.fileExists(patchPath)).toBe(true)
    expect(await access.fileExists(`${deployment}/patches/`)).toBe(true)
  })

  it('leaves legacy trees unchanged when dataset.json is not nested under one folder', () => {
    const files = [
      { path: 'project/site/deploy/night/patches/a.jpg', name: 'a.jpg' },
    ]

    expect(normalizeIndexedPathsToPackageRoot(files)).toEqual(files)
  })
})
