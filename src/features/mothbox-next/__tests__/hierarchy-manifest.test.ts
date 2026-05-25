import { describe, expect, it } from 'vitest'
import {
  defaultDinalabHierarchy,
  defaultLeafCameraDayId,
  defaultPatchImagesOnlyHierarchy,
  inferFlatPatchImagesHierarchy,
  isDefaultLeafCameraDayId,
  resolveHierarchyFromManifest,
} from '../hierarchy-manifest'
import type { MothboxNextDatasetManifest } from '../dataset-manifest'

const baseManifest: MothboxNextDatasetManifest = {
  format: 'mothbox-next-dataset',
  version: 2,
  dataset_id: 'Only-Images',
  folders: {
    records: '02_records/',
    classifications: '03_classifications/',
    patches: '01_patches/',
  },
  records: {
    patches: '02_records/patches.ndjson',
    deployments: '02_records/deployments.ndjson',
    camera_days: '02_records/camera-days.ndjson',
  },
}

describe('hierarchy-manifest', () => {
  it('builds default Dinalab hierarchy from v2 manifest', () => {
    const hierarchy = resolveHierarchyFromManifest({ manifest: baseManifest })
    expect(hierarchy.levels.map((level) => level.key)).toEqual(['deployment', 'night'])
    expect(hierarchy.leaf.patch_field).toBe('camera_day_id')
  })

  it('uses explicit v3 hierarchy when present', () => {
    const manifest: MothboxNextDatasetManifest = {
      ...baseManifest,
      version: 3,
      hierarchy: defaultPatchImagesOnlyHierarchy(baseManifest),
    }

    const hierarchy = resolveHierarchyFromManifest({ manifest })
    expect(hierarchy.levels).toHaveLength(1)
    expect(hierarchy.levels[0]?.label).toBe('All Patches')
  })

  it('infers flat patch-images hierarchy from synthetic camera day id', () => {
    const cameraDayId = defaultLeafCameraDayId('Only-Images')
    expect(isDefaultLeafCameraDayId(cameraDayId)).toBe(true)

    const inferred = inferFlatPatchImagesHierarchy({
      manifest: baseManifest,
      cameraDayIds: [cameraDayId],
    })

    expect(inferred?.levels).toHaveLength(1)
    expect(inferred?.leaf.key).toBe('night')
  })

  it('defaultDinalabHierarchy excludes site level', () => {
    const hierarchy = defaultDinalabHierarchy(baseManifest)
    expect(hierarchy.levels.some((level) => level.key === 'site')).toBe(false)
    expect(hierarchy.levels[0]?.parent_field).toBeNull()
  })
})
