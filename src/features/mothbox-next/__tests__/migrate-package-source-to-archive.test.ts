import { describe, expect, it } from 'vitest'
import {
  detectPackageSourceArchiveRelocation,
  deriveSourcePhotoAssetPathFromBotPath,
  rewritePatchSourcesForArchivePrefix,
} from '../migrate-package-source-to-archive'
import { resolveIndexedEntry } from '../package-indexed-access'
import type { PatchSourceRecord } from '../records'
import type { IndexedFile } from '~/stores/entities/photos'

describe('migrate-package-source-to-archive', () => {
  it('detects relocation when all bot paths exist only under 00_source', () => {
    const patchSources: PatchSourceRecord[] = [
      {
        patch_id: 'a.pt',
        source_type: 'crop_from_photo',
        original_bot_detection_path: 'Deploy/2025-06-21/foo_botdetection.json',
      },
    ]
    const indexedPaths = ['00_source/Deploy/2025-06-21/foo_botdetection.json']

    const result = detectPackageSourceArchiveRelocation({ patchSources, indexedPaths })
    expect(result.shouldMigrate).toBe(true)
    expect(result.matchedCount).toBe(1)
  })

  it('skips when dual-layout has both in-place and archive paths', () => {
    const patchSources: PatchSourceRecord[] = [
      {
        patch_id: 'a.pt',
        source_type: 'crop_from_photo',
        original_bot_detection_path: 'Deploy/2025-06-21/foo_botdetection.json',
      },
    ]
    const indexedPaths = [
      'Deploy/2025-06-21/foo_botdetection.json',
      '00_source/Deploy/2025-06-21/foo_botdetection.json',
    ]

    const result = detectPackageSourceArchiveRelocation({ patchSources, indexedPaths })
    expect(result.shouldMigrate).toBe(false)
    expect(result.reason).toBe('not-all-rows-qualified')
  })

  it('no-ops when paths already use 00_source prefix', () => {
    const patchSources: PatchSourceRecord[] = [
      {
        patch_id: 'a.pt',
        source_type: 'crop_from_photo',
        original_bot_detection_path: '00_source/Deploy/2025-06-21/foo_botdetection.json',
      },
    ]

    const result = detectPackageSourceArchiveRelocation({
      patchSources,
      indexedPaths: ['00_source/Deploy/2025-06-21/foo_botdetection.json'],
    })
    expect(result.shouldMigrate).toBe(false)
    expect(result.reason).toBe('already-archived')
  })

  it('rewrites path fields and derives source_photo_asset_path', () => {
    const indexedPaths = [
      '00_source/Deploy/night/foo_botdetection.json',
      '00_source/Deploy/night/patches/a.pt.jpg',
    ]
    const rows = rewritePatchSourcesForArchivePrefix({
      patchSources: [
        {
          patch_id: 'a.pt',
          source_type: 'crop_from_photo',
          original_bot_detection_path: 'Deploy/night/foo_botdetection.json',
          original_patch_path: 'Deploy/night/patches/a.pt.jpg',
        },
      ],
      indexedPaths,
    })

    expect(rows[0]?.original_bot_detection_path).toBe('00_source/Deploy/night/foo_botdetection.json')
    expect(rows[0]?.original_patch_path).toBe('00_source/Deploy/night/patches/a.pt.jpg')
    expect(rows[0]?.source_photo_asset_path).toBe('00_source/Deploy/night/foo.jpg')
  })

  it('deriveSourcePhotoAssetPathFromBotPath replaces bot suffix with jpg', () => {
    expect(deriveSourcePhotoAssetPathFromBotPath('night/foo_botdetection.json')).toBe('night/foo.jpg')
  })
})

describe('resolveIndexedEntry archiveFallback', () => {
  it('resolves files under 00_source when record path omits prefix', () => {
    const entry: IndexedFile = {
      path: '00_source/Deploy/night/photo.jpg',
      name: 'photo.jpg',
      size: 1,
    }
    const byPath = { [entry.path]: entry }

    const hit = resolveIndexedEntry({
      byPath,
      packageRoot: '',
      filePath: 'Deploy/night/photo.jpg',
      archiveFallback: true,
    })

    expect(hit?.path).toBe('00_source/Deploy/night/photo.jpg')
  })
})
