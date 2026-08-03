import { useEffect, useMemo, useState } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { useStore } from '@nanostores/react'
import { deriveSiteFromDeploymentFolder } from '~/features/data-flow/1.ingest/ingest-paths'
import { extractDatasetRouteIds, extractRouteIds } from './catalog-utils'
import { activeHierarchyStore } from '~/features/mothbox-next/active-hierarchy'
import { leafGroupsStore } from '~/stores/entities/leaf-groups'
import type { ScopeType } from './scope-filters'

export type CatalogScopeContext = {
  projectId?: string
  siteId?: string
  deploymentId?: string
  leafGroupId?: string
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
  const nights = useStore(leafGroupsStore)
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
  const leafGroupId = projectIdOverride ? undefined : datasetIds.leafGroupId || legacyIds.leafGroupId
  const siteId = deploymentId
    ? datasetIds.siteId || deriveSiteFromDeploymentFolder(deploymentId)
    : undefined
  const defaultScope = initialScope || (projectIdOverride ? 'project' : 'all')

  return {
    projectId,
    siteId,
    deploymentId,
    leafGroupId,
    defaultScope,
    hasProject: !!projectId,
    hasSite: !!(projectId && siteId),
    hasDeployment: !!(projectId && deploymentId),
    hasNight: !!(projectId && deploymentId && leafGroupId),
  }
}
