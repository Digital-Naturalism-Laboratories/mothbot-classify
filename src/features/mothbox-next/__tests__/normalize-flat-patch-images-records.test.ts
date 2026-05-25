import { describe, expect, it } from 'vitest'
import {
  FLAT_PATCH_IMAGES_LEAF_LABEL,
  isPatchImagesOnlyPackage,
  normalizeFlatPatchImagesRecords,
} from '../normalize-flat-patch-images-records'
import { defaultLeafCameraDayId } from '../hierarchy-manifest'
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

describe('normalize-flat-patch-images-records', () => {
  it('detects patch_image_only sources', () => {
    expect(
      isPatchImagesOnlyPackage({
        manifest: baseManifest,
        patchSources: [{ patch_id: 'a.pt', source_type: 'patch_image_only' }],
      }),
    ).toBe(true)
  })

  it('does not treat Dinalab packages with deployment records as flat', () => {
    expect(
      isPatchImagesOnlyPackage({
        manifest: {
          ...baseManifest,
          hierarchy: {
            levels: [{ key: 'night', label: 'Night', records: '', id_field: 'camera_day_id', parent_field: null }],
            leaf: { key: 'night', patch_field: 'camera_day_id' },
          },
        },
        patchSources: [{ patch_id: 'a.pt', source_type: 'crop_from_photo' }],
        deployments: [{ deployment_id: 'Dinacon2025_Les_BeachPalm_grupoKite_2025-06-23' }],
      }),
    ).toBe(false)
  })

  it('collapses path-derived hierarchy into one All Patches leaf', () => {
    const leafId = defaultLeafCameraDayId('Only-Images')
    const normalized = normalizeFlatPatchImagesRecords({
      datasetId: 'Only-Images',
      manifest: baseManifest,
      patches: [
        {
          patch_id: 'a.pt',
          dataset_id: 'Only-Images',
          asset_path: '00_source/2025-06-23/a.jpg',
          deployment_id: '00_source',
          camera_day_id: '00_source__2025-06-23',
        },
      ],
      patchSources: [{ patch_id: 'a.pt', source_type: 'patch_image_only' }],
      deployments: [{ deployment_id: '00_source' }],
      cameraDays: [{ camera_day_id: '00_source__2025-06-23', deployment_id: '00_source', night_date: '2025-06-23' }],
    })

    expect(normalized.deployments).toHaveLength(0)
    expect(normalized.cameraDays).toEqual([{ camera_day_id: leafId, night_date: FLAT_PATCH_IMAGES_LEAF_LABEL }])
    expect(normalized.patches[0]?.camera_day_id).toBe(leafId)
    expect(normalized.hierarchy.levels).toHaveLength(1)
  })
})
