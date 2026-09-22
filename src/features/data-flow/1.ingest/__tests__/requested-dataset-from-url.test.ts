import { afterEach, describe, expect, it, vi } from 'vitest'

async function loadFresh(search: string) {
  vi.resetModules()
  window.history.replaceState(null, '', `/${search}`)
  return import('../requested-dataset-from-url')
}

describe('getRequestedDatasetFolderName (Process → Classify handoff)', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/')
  })

  it('returns the dataset name from ?dataset= and strips it from the URL', async () => {
    const mod = await loadFresh('?dataset=Maine')
    expect(mod.getRequestedDatasetFolderName()).toBe('Maine')
    expect(window.location.search).toBe('')
  })

  it('URL-decodes names with spaces', async () => {
    const mod = await loadFresh('?dataset=MB%20Projects')
    expect(mod.getRequestedDatasetFolderName()).toBe('MB Projects')
  })

  it('is one-shot per page load (cached after first read)', async () => {
    const mod = await loadFresh('?dataset=Maine')
    expect(mod.getRequestedDatasetFolderName()).toBe('Maine')
    // URL already stripped, but the cached value still answers consistently
    expect(mod.getRequestedDatasetFolderName()).toBe('Maine')
  })

  it('returns null when absent', async () => {
    const mod = await loadFresh('')
    expect(mod.getRequestedDatasetFolderName()).toBeNull()
  })

  it('rejects path-like values that could escape the datasets root', async () => {
    for (const bad of ['..', '.', 'a/b', 'a%5Cb', '%2Fetc']) {
      const mod = await loadFresh(`?dataset=${bad}`)
      expect(mod.getRequestedDatasetFolderName()).toBeNull()
    }
  })
})

describe('getRequestedDatasetHandoff (root path for the prompt)', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/')
  })

  it('carries the decoded root path and strips both params', async () => {
    const mod = await loadFresh('?dataset=Maine&root=%2FUsers%2Fme%2FMB%20Projects')
    expect(mod.getRequestedDatasetHandoff()).toEqual({ folderName: 'Maine', rootPath: '/Users/me/MB Projects' })
    expect(window.location.search).toBe('')
  })

  it('rootPath is null when only dataset is given', async () => {
    const mod = await loadFresh('?dataset=Maine')
    expect(mod.getRequestedDatasetHandoff()).toEqual({ folderName: 'Maine', rootPath: null })
  })

  it('drops an unsafe dataset name but keeps the root (root alone is a valid handoff)', async () => {
    const mod = await loadFresh('?dataset=..&root=%2Ftmp')
    expect(mod.getRequestedDatasetHandoff()).toEqual({ folderName: null, rootPath: '/tmp' })
    expect(mod.getRequestedDatasetFolderName()).toBeNull()
  })

  it('accepts a root-only handoff (Process could not tell which dataset was meant)', async () => {
    const mod = await loadFresh('?root=%2FUsers%2Fme%2FMB%20Projects%2FKrkCreate')
    expect(mod.getRequestedDatasetHandoff()).toEqual({
      folderName: null,
      rootPath: '/Users/me/MB Projects/KrkCreate',
    })
    expect(mod.requestedRootFolderName()).toBe('KrkCreate')
  })

  it('requestedRootFolderName returns the last segment, and null without a root', async () => {
    const withRoot = await loadFresh('?dataset=Maine&root=%2FUsers%2Fme%2FMB%20Projects')
    expect(withRoot.requestedRootFolderName()).toBe('MB Projects')
    const withoutRoot = await loadFresh('?dataset=Maine')
    expect(withoutRoot.requestedRootFolderName()).toBeNull()
  })
})
