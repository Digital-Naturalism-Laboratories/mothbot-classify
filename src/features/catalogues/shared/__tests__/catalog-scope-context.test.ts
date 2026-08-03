import { describe, expect, it } from 'vitest'
import { resolveCatalogScopeContext } from '../catalog-scope-context'

describe('resolveCatalogScopeContext', () => {
  it('derives route scope from the current project route', () => {
    const result = resolveCatalogScopeContext({
      pathname: '/projects/ProjectA/deployments/Deploy_Site1_2025/nights/Night1',
    })

    expect(result).toEqual({
      projectId: 'ProjectA',
      siteId: 'Site1',
      deploymentId: 'Deploy_Site1_2025',
      leafGroupId: 'Night1',
      defaultScope: 'all',
      hasProject: true,
      hasSite: true,
      hasDeployment: true,
      hasNight: true,
    })
  })

  it('uses all-datasets scope for home-launched dialogs', () => {
    const result = resolveCatalogScopeContext({
      pathname: '/',
    })

    expect(result.defaultScope).toBe('all')
    expect(result.projectId).toBeUndefined()
  })

  it('derives scope from single-leaf dataset URL when one night is hydrated', () => {
    const leafId = 'Only-Images__default'
    const result = resolveCatalogScopeContext({
      pathname: '/datasets/Only-Images',
      nights: {
        [leafId]: {
          id: leafId,
          projectId: 'Only-Images',
          siteId: 'Only-Images',
          deploymentId: 'Only-Images',
        },
      },
      leafGroupIds: [leafId],
    })

    expect(result.projectId).toBe('Only-Images')
    expect(result.leafGroupId).toBe(leafId)
    expect(result.hasProject).toBe(true)
    expect(result.hasNight).toBe(true)
  })

  it('derives scope from dataset group routes when nights are hydrated', () => {
    const leafGroupId = 'Hoya/168m/doubleParina · 2025-01-26/2025-01-28'
    const result = resolveCatalogScopeContext({
      pathname: `/datasets/Hoya/groups/${encodeURIComponent(leafGroupId)}`,
      nights: {
        [leafGroupId]: {
          id: leafGroupId,
          projectId: 'Hoya',
          siteId: '168m',
          deploymentId: 'doubleParina · 2025-01-26',
        },
      },
    })

    expect(result.projectId).toBe('Hoya')
    expect(result.siteId).toBe('168m')
    expect(result.deploymentId).toBe('doubleParina · 2025-01-26')
    expect(result.leafGroupId).toBe(leafGroupId)
    expect(result.hasNight).toBe(true)
  })

  it('uses project scope when opened from a project route', () => {
    const result = resolveCatalogScopeContext({
      pathname: '/projects/ProjectA/deployments/Deploy_Site1_2025/nights/Night1',
      projectIdOverride: 'ProjectA',
      initialScope: 'project',
    })

    expect(result).toEqual({
      projectId: 'ProjectA',
      siteId: undefined,
      deploymentId: undefined,
      leafGroupId: undefined,
      defaultScope: 'project',
      hasProject: true,
      hasSite: false,
      hasDeployment: false,
      hasNight: false,
    })
  })
})
