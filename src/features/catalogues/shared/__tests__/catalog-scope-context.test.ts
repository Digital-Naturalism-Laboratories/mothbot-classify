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
      nightId: 'Night1',
      defaultScope: 'all',
      hasProject: true,
      hasSite: true,
      hasDeployment: true,
      hasNight: true,
    })
  })

  it('prefers project override and project default scope for home-launched dialogs', () => {
    const result = resolveCatalogScopeContext({
      pathname: '/',
      projectIdOverride: 'ProjectA',
      initialScope: 'project',
    })

    expect(result).toEqual({
      projectId: 'ProjectA',
      siteId: undefined,
      deploymentId: undefined,
      nightId: undefined,
      defaultScope: 'project',
      hasProject: true,
      hasSite: false,
      hasDeployment: false,
      hasNight: false,
    })
  })
})
