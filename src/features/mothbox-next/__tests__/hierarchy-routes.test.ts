import { describe, expect, it } from 'vitest'
import {
  buildDatasetSingleLeafUrl,
  buildLeafGroupLinkParams,
  buildLeafGroupUrl,
  isDatasetSingleLeafPathname,
  isSingleLeafHierarchy,
  resolveLeafGroupIdFromRoute,
  resolveHomeTreeMode,
  shouldUseManifestHomeTree,
} from '../hierarchy-routes'
import type { ResolvedHierarchy } from '../resolve-hierarchy-nodes'

const singleLeafResolved: ResolvedHierarchy = {
  hierarchy: {
    levels: [{ key: 'camera_day', label: 'Night' }],
    leaf: { key: 'camera_day', label: 'Night' },
  },
  nodesByLevel: {
    camera_day: [{ id: 'Only-Images__default', levelKey: 'camera_day', label: 'All Patches' }],
  },
  leafGroupIds: ['Only-Images__default'],
}

const multiLevelResolved: ResolvedHierarchy = {
  hierarchy: {
    levels: [
      { key: 'deployment', label: 'Deployment' },
      { key: 'camera_day', label: 'Night' },
    ],
    leaf: { key: 'camera_day', label: 'Night' },
  },
  nodesByLevel: {
    deployment: [{ id: 'dep-1', levelKey: 'deployment', label: 'hopeCobo · 2025-06-20' }],
    camera_day: [{ id: 'night-1', levelKey: 'camera_day', label: '2025-06-21', parentId: 'dep-1' }],
  },
  leafGroupIds: ['night-1'],
}

describe('isSingleLeafHierarchy', () => {
  it('returns true for flat patch-images packages', () => {
    expect(isSingleLeafHierarchy(singleLeafResolved)).toBe(true)
  })

  it('returns false for Dinalab deployment → night packages', () => {
    expect(isSingleLeafHierarchy(multiLevelResolved)).toBe(false)
  })
})

describe('shouldUseManifestHomeTree', () => {
  it('is true only for single-leaf manifest packages (short dataset URL)', () => {
    expect(
      shouldUseManifestHomeTree({
        resolved: singleLeafResolved,
        sites: { 'Dinacon2025/site/Les_BeachPalm': { projectId: 'Dinacon2025' } },
        deployments: { dep: { projectId: 'Dinacon2025' } },
        projectId: 'Only-Images',
      }),
    ).toBe(true)
    expect(
      shouldUseManifestHomeTree({
        resolved: multiLevelResolved,
        sites: {},
        deployments: {},
        projectId: 'Dinacon2025',
      }),
    ).toBe(false)
  })

  it('returns true for flat packages with no site/deployment entities', () => {
    expect(
      shouldUseManifestHomeTree({
        resolved: singleLeafResolved,
        sites: {},
        deployments: {},
        projectId: 'Only-Images',
      }),
    ).toBe(true)
  })
})

describe('resolveHomeTreeMode', () => {
  it('prefers legacy tree when site/deployment entity rows exist', () => {
    expect(
      resolveHomeTreeMode({
        resolved: multiLevelResolved,
        sites: { 'Dinacon2025/site/Les_BeachPalm': { projectId: 'Dinacon2025' } },
        deployments: { dep: { projectId: 'Dinacon2025' } },
        projectId: 'Dinacon2025',
      }),
    ).toBe('legacy')
  })

  it('uses manifest tree when legacy rows are missing but hierarchy is resolved', () => {
    expect(
      resolveHomeTreeMode({
        resolved: multiLevelResolved,
        sites: {},
        deployments: {},
        projectId: 'Dinacon2025',
      }),
    ).toBe('manifest')
  })

  it('returns none when neither hierarchy nor legacy rows exist', () => {
    expect(
      resolveHomeTreeMode({
        resolved: { ...multiLevelResolved, leafGroupIds: [] },
        sites: {},
        deployments: {},
        projectId: 'Dinacon2025',
      }),
    ).toBe('none')
  })
})

describe('buildLeafGroupLinkParams', () => {
  it('uses short dataset URL for single-leaf packages', () => {
    expect(
      buildLeafGroupLinkParams({
        folderName: 'Only-Images',
        projectId: 'Only-Images',
        deploymentId: 'Only-Images',
        night: { id: 'Only-Images__default', name: 'All Patches' },
        singleLeafDataset: true,
      }),
    ).toEqual({
      to: '/datasets/$folderName',
      params: { folderName: 'Only-Images' },
    })
  })

  it('uses groups URL for multi-level packages', () => {
    expect(
      buildLeafGroupLinkParams({
        folderName: 'Dinacon2025',
        projectId: 'Dinacon2025',
        deploymentId: 'hopeCobo',
        night: { id: 'night-1', name: '2025-06-21' },
      }),
    ).toEqual({
      to: '/datasets/$folderName/groups/$leafGroupId',
      params: { folderName: 'Dinacon2025', leafGroupId: 'night-1' },
    })
  })
})

describe('resolveLeafGroupIdFromRoute', () => {
  it('resolves leaf from short dataset URL', () => {
    expect(
      resolveLeafGroupIdFromRoute({
        pathname: '/datasets/Only-Images',
        nights: {},
        leafGroupIds: ['Only-Images__default'],
      }),
    ).toBe('Only-Images__default')
  })

  it('still resolves leaf from groups URL', () => {
    expect(
      resolveLeafGroupIdFromRoute({
        pathname: '/datasets/Dinacon2025/groups/night-1',
        nights: { 'night-1': { id: 'night-1' } },
      }),
    ).toBe('night-1')
  })
})

describe('buildLeafGroupUrl', () => {
  it('builds short URL when single leaf', () => {
    expect(
      buildLeafGroupUrl({
        folderName: 'Only-Images',
        leafGroupId: 'Only-Images__default',
        singleLeafDataset: true,
      }),
    ).toBe(buildDatasetSingleLeafUrl('Only-Images'))
  })
})

describe('isDatasetSingleLeafPathname', () => {
  it('detects short dataset paths', () => {
    expect(isDatasetSingleLeafPathname('/datasets/Only-Images')).toBe(true)
    expect(isDatasetSingleLeafPathname('/datasets/Only-Images/groups/x')).toBe(false)
  })
})
