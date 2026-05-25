import { describe, expect, it } from 'vitest'
import { buildForeignMergePolicy, buildPendingSetupPolicy } from '../content-integration-policy'
import {
  indexedSourceRootsFromPatchSources,
  findUnmergedForeignFolders,
} from '../package-foreign-folders'

describe('indexedSourceRootsFromPatchSources', () => {
  it('collects first path segment from patch and bot detection paths', () => {
    const roots = indexedSourceRootsFromPatchSources([
      { original_patch_path: 'night-a/patches/foo.jpg' } as never,
      { original_bot_detection_path: 'night-b/photo_botdetection.json' } as never,
    ])

    expect([...roots]).toEqual(['night-a', 'night-b'])
  })
})

describe('findUnmergedForeignFolders', () => {
  it('excludes indexed folders and photos-only candidates', () => {
    const candidates = [
      { folderName: 'indexed', botDetectionFileCount: 2, photosOnly: false },
      { folderName: 'new-night', botDetectionFileCount: 1, photosOnly: false },
      { folderName: 'photos', botDetectionFileCount: 0, photosOnly: true },
    ]

    const result = findUnmergedForeignFolders({
      candidates,
      indexedSourceRoots: new Set(['indexed']),
    })

    expect(result).toEqual([{ folderName: 'new-night', botDetectionFileCount: 1, photosOnly: false }])
  })
})

describe('buildPendingSetupPolicy', () => {
  it('returns null when all pending folders are tracked or dismissed', () => {
    const policy = buildPendingSetupPolicy({
      pendingMigration: [{ folderName: 'a', kind: 'legacy-root' }],
      registry: [{ folderName: 'a', hasManifest: true }],
      dismissedFolderNames: new Set(['b']),
    })

    expect(policy).toBeNull()
  })

  it('returns pending-setup policy for untracked folders', () => {
    const pending = [{ folderName: 'fresh', kind: 'legacy-root' as const }]
    const policy = buildPendingSetupPolicy({
      pendingMigration: pending,
      registry: [],
    })

    expect(policy).toEqual({ kind: 'pending-setup', pending })
  })
})

describe('buildForeignMergePolicy', () => {
  it('returns null when every candidate is already indexed', () => {
    const policy = buildForeignMergePolicy({
      packageFolderName: 'pkg',
      patchSources: [{ original_patch_path: 'night-a/patches/x.jpg' } as never],
      candidates: [{ folderName: 'night-a', botDetectionFileCount: 1, photosOnly: false }],
    })

    expect(policy).toBeNull()
  })

  it('returns foreign-merge policy with photos-only side list', () => {
    const policy = buildForeignMergePolicy({
      packageFolderName: 'pkg',
      patchSources: [],
      candidates: [
        { folderName: 'night-b', botDetectionFileCount: 2, photosOnly: false },
        { folderName: 'raw-photos', botDetectionFileCount: 0, photosOnly: true },
      ],
    })

    expect(policy).toEqual({
      kind: 'foreign-merge',
      packageFolderName: 'pkg',
      foreignFolders: [{ folderName: 'night-b', botDetectionFileCount: 2, photosOnly: false }],
      photosOnly: [{ folderName: 'raw-photos', botDetectionFileCount: 0, photosOnly: true }],
    })
  })
})
