import { useEffect, useMemo, useState } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { useStore } from '@nanostores/react'
import { deriveSiteFromDeploymentFolder } from '~/features/data-flow/1.ingest/ingest-paths'
import { extractDatasetRouteIds, extractRouteIds } from './catalog-utils'
import { activeHierarchyStore } from '~/features/mothbox-next/active-hierarchy'
import { nightsStore } from '~/stores/entities/4.nights'
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
  const nights = useStore(nightsStore)
  const leafGroupIds = useStore(activeHierarchyStore)?.leafGroupIds ?? []
  const scopeContext = useMemo(() => {
    return resolveCatalogScopeContext({
      pathname: route?.pathname || '',
      projectIdOverride,
      initialScope,
      nights,
      leafGroupIds,
    })
  }, [route?.pathname, projectIdOverride, initialScope, nights, leafGroupIds])
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
  nights?: Record<string, { id?: string; projectId?: string; siteId?: string; deploymentId?: string }>
  leafGroupIds?: string[]
}): CatalogScopeContext {
  const { pathname, projectIdOverride, initialScope, nights = {}, leafGroupIds = [] } = params
  const legacyIds = extractRouteIds(pathname)
  const datasetIds = extractDatasetRouteIds(pathname, nights, leafGroupIds)
  const projectId = projectIdOverride || datasetIds.projectId || legacyIds.projectId
  const deploymentId = projectIdOverride ? undefined : datasetIds.deploymentId || legacyIds.deploymentId
  const nightId = projectIdOverride ? undefined : datasetIds.nightId || legacyIds.nightId
  const siteId = deploymentId
    ? datasetIds.siteId || deriveSiteFromDeploymentFolder(deploymentId)
    : undefined
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
