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
    const files = normalizeIndexedPathsToPackageRoot([
      { path: 'dinacon2025/dataset.json', name: 'dataset.json' },
      { path: 'dinacon2025/01_patches/foo.jpg', name: 'foo.jpg' },
    ])

    const access = createPackageFileAccessFromIndexedFiles({ files: files as any, packageRoot: '' })
    expect(await access.fileExists('01_patches/')).toBe(true)
  })

  it('leaves legacy trees unchanged when dataset.json is not nested under one folder', () => {
    const files = [
      { path: 'project/site/deploy/night/patches/a.jpg', name: 'a.jpg' },
    ]

    expect(normalizeIndexedPathsToPackageRoot(files)).toEqual(files)
  })
})
