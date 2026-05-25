import { describe, expect, it } from 'vitest'
import { resolveDefaultDatasetFolderName } from '../resolve-default-dataset-folder'

describe('resolveDefaultDatasetFolderName', () => {
  const entries = [
    { folderName: 'alpha', hasManifest: true },
    { folderName: 'beta', hasManifest: true },
  ]

  it('returns null when the registry is empty', () => {
    expect(resolveDefaultDatasetFolderName({ entries: [] })).toBeNull()
  })

  it('returns the first entry when there is no last-used name', () => {
    expect(resolveDefaultDatasetFolderName({ entries })).toBe('alpha')
  })

  it('returns the last-used folder when it is still in the registry', () => {
    expect(resolveDefaultDatasetFolderName({ entries, lastUsedFolderName: 'beta' })).toBe('beta')
  })

  it('falls back to the first entry when last-used is missing from the registry', () => {
    expect(resolveDefaultDatasetFolderName({ entries, lastUsedFolderName: 'removed' })).toBe('alpha')
  })

  it('picks the first sorted folder when entries are not pre-sorted', () => {
    const unsorted = [
      { folderName: 'zebra', hasManifest: true },
      { folderName: 'alpha', hasManifest: true },
    ]
    expect(resolveDefaultDatasetFolderName({ entries: unsorted })).toBe('alpha')
  })
})
