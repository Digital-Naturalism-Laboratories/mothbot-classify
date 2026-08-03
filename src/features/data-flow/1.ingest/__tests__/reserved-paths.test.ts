import { describe, expect, it } from 'vitest'
import {
  excludePackageArchiveIndexedFiles,
  isPackageArchivePatchMediaPath,
  isPackageArchiveRelativePath,
} from '../reserved-paths'

describe('reserved-paths', () => {
  it('detects package archive paths', () => {
    expect(isPackageArchiveRelativePath('00_source/Les/night/patches/a.jpg')).toBe(true)
    expect(isPackageArchiveRelativePath('01_patches/a.jpg')).toBe(false)
    expect(isPackageArchivePatchMediaPath('00_source/Les/night/patches/a.jpg')).toBe(true)
  })

  it('excludes archive paths from indexed file lists', () => {
    const files = [
      { path: 'dataset.json' },
      { path: '01_patches/a.jpg' },
      { path: '00_source/legacy/patches/b.jpg' },
    ]

    expect(excludePackageArchiveIndexedFiles(files).map((f) => f.path)).toEqual([
      'dataset.json',
      '01_patches/a.jpg',
      '00_source/legacy/patches/b.jpg',
    ])
  })
})
