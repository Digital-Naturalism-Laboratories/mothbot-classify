import { describe, expect, it } from 'vitest'
import { buildHierarchyBreadcrumbs } from '../build-hierarchy-breadcrumbs'
import { defaultPatchImagesOnlyHierarchy } from '../hierarchy-manifest'
import { resolveHierarchyNodes, walkAncestorChain } from '../resolve-hierarchy-nodes'
import type { MothboxNextDatasetManifest } from '../dataset-manifest'

const patchImagesManifest: MothboxNextDatasetManifest = {
  format: 'mothbox-next-dataset',
  version: 3,
  dataset_id: 'Only-Images',
  hierarchy: defaultPatchImagesOnlyHierarchy({
    format: 'mothbox-next-dataset',
    version: 3,
    dataset_id: 'Only-Images',
    folders: {
      records: '02_records/',
      classifications: '03_classifications/',
      patches: '01_patches/',
    },
    records: {
      patches: '02_records/patches.ndjson',
      camera_days: '02_records/camera-days.ndjson',
    },
  }),
  folders: {
    records: '02_records/',
    classifications: '03_classifications/',
    patches: '01_patches/',
  },
  records: {
    patches: '02_records/patches.ndjson',
    camera_days: '02_records/camera-days.ndjson',
  },
}

describe('resolve-hierarchy-nodes', () => {
  it('resolves single-level patch-images tree', () => {
    const cameraDayId = 'Only-Images__default'
    const resolved = resolveHierarchyNodes({
      manifest: patchImagesManifest,
      deployments: [],
      cameraDays: [{ camera_day_id: cameraDayId, night_date: 'All Patches' }],
    })

    expect(resolved.leafGroupIds).toEqual([cameraDayId])
    expect(resolved.nodesByLevel.night).toHaveLength(1)
    expect(resolved.nodesByLevel.night?.[0]?.label).toBe('All Patches')
  })

  it('walks ancestor chain for multi-level Dinalab hierarchy', () => {
    const resolved = resolveHierarchyNodes({
      manifest: {
        ...patchImagesManifest,
        dataset_id: 'dinacon',
        hierarchy: {
          levels: [
            {
              key: 'deployment',
              label: 'Deployment',
              records: '02_records/deployments.ndjson',
              id_field: 'deployment_id',
              parent_field: null,
            },
            {
              key: 'night',
              label: 'Night',
              records: '02_records/camera-days.ndjson',
              id_field: 'camera_day_id',
              parent_field: 'deployment_id',
            },
          ],
          leaf: { key: 'night', patch_field: 'camera_day_id' },
        },
      },
      deployments: [{ deployment_id: 'siteA_device1_2025-01-01' }],
      cameraDays: [
        {
          camera_day_id: 'siteA_device1_2025-01-01__2025-01-01',
          deployment_id: 'siteA_device1_2025-01-01',
          night_date: '2025-01-01',
        },
      ],
    })

    const chain = walkAncestorChain({
      resolved,
      leafGroupId: 'siteA_device1_2025-01-01__2025-01-01',
    })

    expect(chain.map((node) => node.levelKey)).toEqual(['deployment', 'night'])
  })
})

describe('build-hierarchy-breadcrumbs', () => {
  it('builds one crumb for flat patch-images route', () => {
    const cameraDayId = 'Only-Images__default'
    const resolved = resolveHierarchyNodes({
      manifest: patchImagesManifest,
      deployments: [],
      cameraDays: [{ camera_day_id: cameraDayId, night_date: 'All Patches' }],
    })

    const crumbs = buildHierarchyBreadcrumbs({
      pathname: `/datasets/Only-Images/groups/${encodeURIComponent(cameraDayId)}`,
      resolved,
      folderName: 'Only-Images',
      nights: { [cameraDayId]: { id: cameraDayId, name: 'Images' } },
    })

    expect(crumbs).toHaveLength(1)
    expect(crumbs[0]?.entityName).toBe('All Patches')
    expect(crumbs[0]?.label).toBe('All Patches')
  })
})
