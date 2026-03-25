import { useEffect, useMemo, useState } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { deriveSiteFromDeploymentFolder } from '~/features/data-flow/1.ingest/ingest-paths'
import { extractRouteIds } from './catalog-utils'
import type { ScopeType } from './scope-filters'

export type CatalogScopeContext = {
  projectId?: string
  siteId?: string
  deploymentId?: string
  nightId?: string
  defaultScope: ScopeType
  hasProject: boolean
  hasSite: boolean
  hasDeployment: boolean
  hasNight: boolean
}

export function useCatalogScopeContext(params: {
  open: boolean
  projectIdOverride?: string
  initialScope?: ScopeType
}) {
  const { open, projectIdOverride, initialScope } = params
  const route = useRouterState({ select: (state) => state.location })
  const scopeContext = useMemo(() => {
    return resolveCatalogScopeContext({
      pathname: route?.pathname || '',
      projectIdOverride,
      initialScope,
    })
  }, [route?.pathname, projectIdOverride, initialScope])
  const [usageScope, setUsageScope] = useState<ScopeType>(scopeContext.defaultScope)

  useEffect(() => {
    if (!open) return
    setUsageScope(scopeContext.defaultScope)
  }, [open, scopeContext.defaultScope])

  const res = {
    ...scopeContext,
    usageScope,
    setUsageScope,
  }

  return res
}

export function resolveCatalogScopeContext(params: {
  pathname: string
  projectIdOverride?: string
  initialScope?: ScopeType
}): CatalogScopeContext {
  const { pathname, projectIdOverride, initialScope } = params
  const routeIds = extractRouteIds(pathname)
  const projectId = projectIdOverride || routeIds.projectId
  const deploymentId = projectIdOverride ? undefined : routeIds.deploymentId
  const nightId = projectIdOverride ? undefined : routeIds.nightId
  const siteId = deploymentId ? deriveSiteFromDeploymentFolder(deploymentId) : undefined
  const defaultScope = initialScope || (projectIdOverride ? 'project' : 'all')

  return {
    projectId,
    siteId,
    deploymentId,
    nightId,
    defaultScope,
    hasProject: !!projectId,
    hasSite: !!(projectId && siteId),
    hasDeployment: !!(projectId && deploymentId),
    hasNight: !!(projectId && deploymentId && nightId),
  }
}
