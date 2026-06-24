import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import {
  fixturePackageRoot,
  walkFixtureFiles,
} from '~/features/mothbox-next/__tests__/node-fixture-access'
import * as ingestPackageModule from '~/features/data-flow/1.ingest/package/ingest-package'
import { applyIndexedFilesState } from '~/features/data-flow/1.ingest/files.initialize'
import { resetAllEntityStores } from '~/stores/entities'
import { detectionsStore } from '~/stores/entities/detections'
import { patchesStore } from '~/stores/entities/5.patches'
import { photosStore } from '~/stores/entities/photos'
import { mothboxNextPackageStore } from '~/features/mothbox-next/active-package'
import { indexedFilesStore } from '~/features/data-flow/1.ingest/files.state'
import {
  activeDatasetFolderNameStore,
  datasetsRegistryStore,
  setDatasetsRegistry,
} from '~/stores/datasets-registry'
import { tryRestorePackageFromSessionCache } from '~/features/data-flow/3.persist/restore-package-session-cache'
import { applyLoadedPackageToStores } from '~/features/mothbox-next/reload-package'
import { mergeIndexedWithHandles } from '~/features/data-flow/3.persist/package-session-cache'
import { savePackageSessionCacheFromStores } from '~/features/data-flow/3.persist/save-package-session-cache'
import {
  computePackageSessionFingerprint,
  loadPackageSessionCache,
} from '~/features/data-flow/3.persist/package-session-cache'
import type { IndexedFile } from '~/stores/entities/photos'

const idbMemory = vi.hoisted(() => new Map<string, Map<string, unknown>>())

vi.mock('~/utils/index-db', () => ({
  DB_NAME: 'mothbox-labeler-test',
  idbPut: async (_db: string, store: string, key: string, value: unknown) => {
    if (!idbMemory.has(store)) idbMemory.set(store, new Map())
    idbMemory.get(store)!.set(key, value)
  },
  idbGet: async (_db: string, store: string, key: string) => {
    return idbMemory.get(store)?.get(key)
  },
  idbDelete: async (_db: string, store: string, key: string) => {
    idbMemory.get(store)?.delete(key)
  },
  openIdb: vi.fn(),
}))

const openDatasetByFolderNameMock = vi.hoisted(() => vi.fn(async () => true))

vi.mock('../open-dataset-by-folder', () => ({
  openDatasetByFolderName: openDatasetByFolderNameMock,
}))

vi.mock('../scan-datasets-folder', () => ({
  scanDatasetsFolder: vi.fn(async () => {
    setDatasetsRegistry([
      { folderName: 'dinacon-fixture', datasetId: 'dinacon', hasManifest: true },
    ])
    return datasetsRegistryStore.get()
  }),
}))

vi.mock('../load-workspace-species-lists', () => ({
  loadWorkspaceSpeciesLists: vi.fn(async () => 0),
}))

vi.mock('~/features/data-flow/3.persist/files.persistence', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/features/data-flow/3.persist/files.persistence')>()
  return {
    ...actual,
    loadLastActiveDatasetFolderName: vi.fn(() => 'dinacon-fixture'),
    saveLastActiveDatasetFolderName: vi.fn(),
  }
})

import { finishDatasetsWorkspaceSetup } from '../datasets-workspace-setup'

const FIXTURE_FOLDER = '04_dinacon_lightweight_substrate'
const CACHE_FOLDER_NAME = 'dinacon-fixture'

async function buildFixtureIndexedFiles(): Promise<IndexedFile[]> {
  const packageRoot = fixturePackageRoot(FIXTURE_FOLDER)
  const walked = await walkFixtureFiles(packageRoot)

  return Promise.all(
    walked.map(async (fileMeta) => {
      const bytes = await readFile(path.join(packageRoot, fileMeta.path))
      const textContent = bytes.toString('utf8')
      return {
        path: fileMeta.path,
        name: fileMeta.name,
        size: fileMeta.size,
        file: { text: async () => textContent } as File,
      }
    }),
  )
}

describe('smoke: startup and package session cache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    idbMemory.clear()
    resetAllEntityStores()
    datasetsRegistryStore.set([])
    activeDatasetFolderNameStore.set(null)
    mothboxNextPackageStore.set(null)
    indexedFilesStore.set([])
  })

  it('finishDatasetsWorkspaceSetup scans registry without opening a dataset on disk', async () => {
    const result = await finishDatasetsWorkspaceSetup({ autoMigrate: false })

    expect(result.rememberedDefaultDataset).toBe(true)
    expect(openDatasetByFolderNameMock).not.toHaveBeenCalled()
    expect(activeDatasetFolderNameStore.get()).toBe('dinacon-fixture')
    expect(datasetsRegistryStore.get()).toHaveLength(1)
  })

  it('round-trips package entities through IDB cache without re-ingesting NDJSON', async () => {
    const ingestSpy = vi.spyOn(ingestPackageModule, 'ingestMothboxNextPackageFromIndexedFiles')
    const indexed = await buildFixtureIndexedFiles()
    const ingest = await ingestPackageModule.ingestMothboxNextPackageFromIndexedFiles({ files: indexed })
    expect(ingest.ok).toBe(true)
    applyIndexedFilesState({ indexed, ingestMode: 'mothbox-next' })

    const detectionIdsBefore = Object.keys(detectionsStore.get() || {}).sort()
    expect(detectionIdsBefore).toHaveLength(5)

    await savePackageSessionCacheFromStores({ folderName: CACHE_FOLDER_NAME })

    const cached = await loadPackageSessionCache(CACHE_FOLDER_NAME)
    expect(cached?.fingerprint).toBeTruthy()
    expect(cached?.detections).toEqual(detectionsStore.get())

    resetAllEntityStores()
    mothboxNextPackageStore.set(null)
    indexedFilesStore.set([])

    const restored = await tryRestorePackageFromSessionCache({
      folderName: CACHE_FOLDER_NAME,
      indexed,
    })

    expect(restored).toBe(true)
    expect(ingestSpy).toHaveBeenCalledTimes(1)
    expect(Object.keys(patchesStore.get() || {})).toHaveLength(5)
    expect(Object.keys(detectionsStore.get() || {}).sort()).toEqual(detectionIdsBefore)
    expect(mothboxNextPackageStore.get()?.manifest.dataset_id).toBeTruthy()
    expect((indexedFilesStore.get() || []).length).toBeGreaterThan(0)

    const firstPatch = Object.values(patchesStore.get() || {})[0]
    expect(firstPatch?.imageFile?.path).toBeTruthy()
    expect(firstPatch?.imageFile?.file ?? firstPatch?.imageFile?.handle ?? firstPatch?.imageFile?.parentDir).toBeTruthy()
  })

  it('restores source photos using full live index when cache meta omits archive paths', async () => {
    const indexed = await buildFixtureIndexedFiles()
    const archivePhotoPath =
      '00_source/Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20/2025-06-21/hopeCobo_2025_06_22__04_58_06_HDR0.jpg'

    await ingestPackageModule.ingestMothboxNextPackageFromIndexedFiles({ files: indexed })
    applyIndexedFilesState({ indexed, ingestMode: 'mothbox-next' })
    await savePackageSessionCacheFromStores({ folderName: CACHE_FOLDER_NAME })

    const cached = await loadPackageSessionCache(CACHE_FOLDER_NAME)
    expect(cached).toBeTruthy()
    expect(cached?.indexedMeta.some((entry) => entry.path === archivePhotoPath)).toBe(false)

    resetAllEntityStores()

    const indexedWithArchivePhoto = [
      ...indexed,
      {
        path: archivePhotoPath,
        name: 'hopeCobo_2025_06_22__04_58_06_HDR0.jpg',
        size: 1,
        file: { text: async () => '' } as File,
      },
    ]

    mothboxNextPackageStore.set({
      packageRoot: cached!.packageRoot,
      manifest: cached!.manifest,
      loaded: cached!.loaded,
    })

    const mergedIndexed = mergeIndexedWithHandles({
      meta: cached!.indexedMeta,
      live: indexedWithArchivePhoto,
    })

    await applyLoadedPackageToStores({
      loaded: cached!.loaded,
      indexedFiles: mergedIndexed,
      sourceResolutionIndexed: indexedWithArchivePhoto,
    })

    const photoId = 'hopeCobo_2025_06_22__04_58_06_HDR0.jpg'
    expect(photosStore.get()?.[photoId]?.imageFile?.path).toBe(archivePhotoPath)
  })

  it('rejects stale cache when the indexed tree changes', async () => {
    const indexed = await buildFixtureIndexedFiles()
    await ingestPackageModule.ingestMothboxNextPackageFromIndexedFiles({ files: indexed })
    applyIndexedFilesState({ indexed, ingestMode: 'mothbox-next' })
    await savePackageSessionCacheFromStores({ folderName: CACHE_FOLDER_NAME })

    resetAllEntityStores()

    const indexedWithExtra = [
      ...indexed,
      {
        path: '03_classifications/new-file.ndjson',
        name: 'new-file.ndjson',
        size: 1,
        file: { text: async () => '' } as File,
      },
    ]

    const restored = await tryRestorePackageFromSessionCache({
      folderName: CACHE_FOLDER_NAME,
      indexed: indexedWithExtra,
    })

    expect(restored).toBe(false)
    expect(Object.keys(detectionsStore.get() || {})).toHaveLength(0)

    const fingerprintBefore = (await loadPackageSessionCache(CACHE_FOLDER_NAME))?.fingerprint
    const fingerprintAfter = await computePackageSessionFingerprint({ indexed: indexedWithExtra })
    expect(fingerprintAfter).not.toBe(fingerprintBefore)
  })

  it('rejects stale cache when existing classification content changes in place', async () => {
    const indexed = await buildFixtureIndexedFiles()
    await ingestPackageModule.ingestMothboxNextPackageFromIndexedFiles({ files: indexed })
    applyIndexedFilesState({ indexed, ingestMode: 'mothbox-next' })
    await savePackageSessionCacheFromStores({ folderName: CACHE_FOLDER_NAME })

    resetAllEntityStores()

    const mutated = indexed.map((entry) => {
      if (!entry.path.startsWith('03_classifications/') || !entry.name.endsWith('.ndjson')) return entry
      return {
        ...entry,
        file: { text: async () => '{"patch_id":"mutated-in-place"}\n' } as File,
      }
    })

    const restored = await tryRestorePackageFromSessionCache({
      folderName: CACHE_FOLDER_NAME,
      indexed: mutated,
    })

    expect(restored).toBe(false)
    expect(Object.keys(detectionsStore.get() || {})).toHaveLength(0)

    const fingerprintBefore = (await loadPackageSessionCache(CACHE_FOLDER_NAME))?.fingerprint
    const fingerprintAfter = await computePackageSessionFingerprint({ indexed: mutated })
    expect(fingerprintAfter).not.toBe(fingerprintBefore)
  })
})
