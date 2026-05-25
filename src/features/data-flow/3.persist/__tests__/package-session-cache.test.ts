import { describe, expect, it } from 'vitest'
import {
  computePackageRecordContentDigest,
  computePackageSessionFingerprint,
  hashString,
  isValidPackageSessionCacheEntry,
  isSessionCacheRenderable,
  mergeIndexedWithHandles,
  PACKAGE_SESSION_CACHE_VERSION,
  relinkIndexedRefFromLive,
  relinkPhotosIndexedFiles,
  stripFileFromIndexedRef,
  stripIndexedFilesFromPhotos,
  toIndexedFileMeta,
  type PackageSessionCacheEntry,
} from '../package-session-cache'
import type { PhotoEntity } from '~/stores/entities/photos'

describe('package-session-cache', () => {
  it('computePackageRecordContentDigest changes when ndjson text changes', async () => {
    const base = {
      path: '03_classifications/human/current_classifications.ndjson',
      name: 'current_classifications.ndjson',
      size: 10,
      file: { text: async () => '{"a":1}\n' } as File,
    }
    const changed = {
      ...base,
      file: { text: async () => '{"a":2}\n' } as File,
    }

    const before = await computePackageRecordContentDigest([base])
    const after = await computePackageRecordContentDigest([changed])

    expect(after).not.toBe(before)
  })

  it('computePackageSessionFingerprint includes record content in the digest', async () => {
    const manifest = {
      path: 'dataset.json',
      name: 'dataset.json',
      size: 2,
      file: { text: async () => '{"dataset_id":"demo"}' } as File,
    }
    const record = {
      path: '03_classifications/human/current_classifications.ndjson',
      name: 'current_classifications.ndjson',
      size: 3,
      file: { text: async () => '{"x":1}\n' } as File,
    }

    const first = await computePackageSessionFingerprint({ indexed: [manifest, record] })
    const second = await computePackageSessionFingerprint({
      indexed: [
        manifest,
        {
          ...record,
          file: { text: async () => '{"x":9}\n' } as File,
        },
      ],
    })

    expect(first).toBeTruthy()
    expect(second).not.toBe(first)
  })

  it('hashString is stable for the same input', () => {
    expect(hashString('dataset.json')).toBe(hashString('dataset.json'))
    expect(hashString('a')).not.toBe(hashString('b'))
  })

  it('stripFileFromIndexedRef removes file and handle', () => {
    const file = new File(['x'], 'patch.jpg')
    const stripped = stripFileFromIndexedRef({
      path: 'patches/a.jpg',
      name: 'a.jpg',
      size: 1,
      file,
      handle: { getFile: () => Promise.resolve(file) },
    })
    expect(stripped).toEqual({ path: 'patches/a.jpg', name: 'a.jpg', size: 1 })
  })

  it('mergeIndexedWithHandles attaches live handles by path', () => {
    const handle = { id: 'h1' }
    const merged = mergeIndexedWithHandles({
      meta: [{ path: 'dataset.json', name: 'dataset.json', size: 0 }],
      live: [
        {
          path: 'dataset.json',
          name: 'dataset.json',
          size: 12,
          handle,
        },
      ],
    })
    expect(merged[0]?.handle).toBe(handle)
    expect(merged[0]?.file).toBeUndefined()
  })

  it('relinkIndexedRefFromLive merges live handle and file by path', () => {
    const liveFile = new File([], 'photo.jpg')
    const liveByPath = {
      'n1/photo.jpg': {
        path: 'n1/photo.jpg',
        name: 'photo.jpg',
        size: 2,
        file: liveFile,
        handle: { id: 'live' },
      },
    }
    const relinked = relinkIndexedRefFromLive({
      ref: { path: 'n1/photo.jpg', name: 'photo.jpg', size: 1 },
      liveByPath,
    })
    expect(relinked?.file).toBe(liveFile)
    expect(relinked?.handle).toEqual({ id: 'live' })
  })

  it('stripIndexedFilesFromPhotos clears file blobs', () => {
    const photos: Record<string, PhotoEntity> = {
      p1: {
        id: 'p1',
        name: 'photo.jpg',
        nightId: 'n1',
        imageFile: {
          path: 'n1/photo.jpg',
          name: 'photo.jpg',
          size: 9,
          file: new File([], 'photo.jpg'),
        },
      },
    }
    const stripped = stripIndexedFilesFromPhotos(photos)
    expect(stripped.p1?.imageFile?.file).toBeUndefined()
    expect(stripped.p1?.imageFile?.path).toBe('n1/photo.jpg')
  })

  it('relinkPhotosIndexedFiles attaches live handles to stripped photos', () => {
    const file = new File([], 'photo.jpg')
    const photos: Record<string, PhotoEntity> = {
      p1: {
        id: 'p1',
        name: 'photo.jpg',
        nightId: 'n1',
        imageFile: { path: 'n1/photo.jpg', name: 'photo.jpg', size: 9 },
      },
    }
    const relinked = relinkPhotosIndexedFiles({
      photos,
      liveByPath: {
        'n1/photo.jpg': { path: 'n1/photo.jpg', name: 'photo.jpg', size: 9, file },
      },
    })
    expect(relinked.p1?.imageFile?.file).toBe(file)
  })

  it('toIndexedFileMeta drops file and handle', () => {
    const meta = toIndexedFileMeta([
      {
        path: 'a.ndjson',
        name: 'a.ndjson',
        size: 3,
        file: new File([], 'a.ndjson'),
        handle: {},
      },
    ])
    expect(meta).toEqual([{ path: 'a.ndjson', name: 'a.ndjson', size: 3 }])
  })

  it('isValidPackageSessionCacheEntry rejects stale versions and folder mismatch', () => {
    const base: PackageSessionCacheEntry = {
      cacheVersion: PACKAGE_SESSION_CACHE_VERSION,
      fingerprint: 'fp',
      folderName: 'my-dataset',
      savedAt: 1,
      packageRoot: 'root',
      manifest: { dataset_id: 'ds' } as PackageSessionCacheEntry['manifest'],
      loaded: {} as PackageSessionCacheEntry['loaded'],
      projects: {},
      sites: {},
      deployments: {},
      nights: {},
      photos: {},
      patches: {},
      detections: {},
      nightSummaries: {},
      morphoLinks: {},
      indexedMeta: [],
    }

    expect(isValidPackageSessionCacheEntry(base, 'my-dataset')).toBe(true)
    expect(isValidPackageSessionCacheEntry({ ...base, cacheVersion: 1 }, 'my-dataset')).toBe(false)
    expect(isValidPackageSessionCacheEntry(base, 'other-folder')).toBe(false)
    expect(isValidPackageSessionCacheEntry(null, 'my-dataset')).toBe(false)
  })

  it('isSessionCacheRenderable requires legacy rows or nights for a project', () => {
    const entry: PackageSessionCacheEntry = {
      cacheVersion: PACKAGE_SESSION_CACHE_VERSION,
      fingerprint: 'fp',
      folderName: 'Hoya',
      savedAt: 1,
      packageRoot: 'root',
      manifest: { dataset_id: 'Hoya' } as PackageSessionCacheEntry['manifest'],
      loaded: {} as PackageSessionCacheEntry['loaded'],
      projects: { Hoya: { id: 'Hoya', name: 'Hoya' } },
      sites: {},
      deployments: {},
      nights: { 'Hoya/dep/night': { id: 'Hoya/dep/night', name: '2025-01-26', projectId: 'Hoya', siteId: 's', deploymentId: 'd' } },
      photos: {},
      patches: {},
      detections: {},
      nightSummaries: {},
      morphoLinks: {},
      indexedMeta: [],
    }

    expect(isSessionCacheRenderable(entry)).toBe(true)
    expect(
      isSessionCacheRenderable({
        ...entry,
        sites: { 'Hoya/site/x': { id: 'Hoya/site/x', name: 'x', projectId: 'Hoya' } },
      }),
    ).toBe(true)
  })
})
