import { describe, expect, it } from 'vitest'
import { buildHierarchyBreadcrumbs } from '../build-hierarchy-breadcrumbs'
import { buildLeafGroupUrl } from '../hierarchy-routes'
import type { ResolvedHierarchy } from '../resolve-hierarchy-nodes'

const flatResolved: ResolvedHierarchy = {
  hierarchy: {
    levels: [
      {
        key: 'night',
        label: 'All Patches',
        records: '02_records/camera-days.ndjson',
        id_field: 'camera_day_id',
        parent_field: null,
      },
    ],
    leaf: { key: 'night', patch_field: 'camera_day_id' },
  },
  nodesByLevel: {
    night: [{ levelKey: 'night', id: 'Only-Images__default', label: 'All Patches' }],
  },
  nodeByKey: {
    'night:Only-Images__default': { levelKey: 'night', id: 'Only-Images__default', label: 'All Patches' },
  },
  leafGroupIds: ['Only-Images__default'],
}

describe('buildHierarchyBreadcrumbs', () => {
  it('leaf href matches buildLeafGroupUrl for single-leaf packages', () => {
    const crumbs = buildHierarchyBreadcrumbs({
      pathname: '/datasets/Only-Images',
      resolved: flatResolved,
      folderName: 'Only-Images',
      nights: { 'Only-Images__default': { id: 'Only-Images__default', name: 'All Patches' } },
    })

    expect(crumbs).toHaveLength(1)
    expect(crumbs[0]?.href).toBe(
      buildLeafGroupUrl({
        folderName: 'Only-Images',
        leafGroupId: 'Only-Images__default',
        singleLeafDataset: true,
      }),
    )
  })
})
