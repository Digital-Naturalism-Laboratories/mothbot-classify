import { buildNightRouteParams, resolveLeafGroupEntityIdFromRoute } from '~/features/data-flow/1.ingest/ingest-paths'
import type { ResolvedHierarchy } from './resolve-hierarchy-nodes'
import type { LeafGroupEntity } from '~/stores/entities/leaf-groups'

export type HomeTreeMode = 'manifest' | 'legacy' | 'none'

export type ProjectTreeStores = {
  resolved: ResolvedHierarchy | null | undefined
  sites: Record<string, { projectId: string }>
  deployments: Record<string, { projectId: string }>
  projectId: string
}

export function isSingleLeafHierarchy(resolved: ResolvedHierarchy | null | undefined) {
  if (!resolved) return false
  return resolved.hierarchy.levels.length === 1 && resolved.leafGroupIds.length === 1
}

export function projectHasLegacyTreeRows(params: Pick<ProjectTreeStores, 'sites' | 'deployments' | 'projectId'>) {
  const { sites, deployments, projectId } = params
  const hasSite = Object.values(sites ?? {}).some((site) => site.projectId === projectId)
  const hasDeployment = Object.values(deployments ?? {}).some((deployment) => deployment.projectId === projectId)
  return hasSite || hasDeployment
}

/**
 * Legacy entity tree (site → deployment → night) when stores are hydrated.
 * Manifest tree only when legacy rows are missing (e.g. stale cache, patch-images-only).
 */
export function resolveHomeTreeMode(params: ProjectTreeStores): HomeTreeMode {
  if (projectHasLegacyTreeRows(params)) return 'legacy'
  if (params.resolved?.leafGroupIds.length) return 'manifest'
  return 'none'
}

export function shouldUseManifestHomeTree(params: ProjectTreeStores) {
  return resolveHomeTreeMode(params) === 'manifest' && isSingleLeafHierarchy(params.resolved)
}

export function buildDatasetSingleLeafUrl(folderName: string) {
  return `/datasets/${encodeURIComponent(folderName)}`
}

export function buildLeafGroupUrl(params: { folderName: string; leafGroupId: string; singleLeafDataset?: boolean }) {
  const { folderName, leafGroupId, singleLeafDataset } = params
  if (singleLeafDataset) return buildDatasetSingleLeafUrl(folderName)

  const encodedFolder = encodeURIComponent(folderName)
  const encodedLeaf = encodeURIComponent(leafGroupId)
  return `/datasets/${encodedFolder}/groups/${encodedLeaf}`
}

export function buildLegacyNightUrl(params: {
  projectId: string
  deploymentId: string
  night: Pick<LeafGroupEntity, 'id' | 'name'>
}) {
  const routeParams = buildNightRouteParams(params)
  return `/projects/${routeParams.projectId}/deployments/${routeParams.deploymentId}/nights/${routeParams.nightId}`
}

export function buildLeafGroupLinkParams(params: {
  folderName?: string | null
  projectId: string
  deploymentId: string
  night: Pick<LeafGroupEntity, 'id' | 'name'>
  singleLeafDataset?: boolean
}) {
  const { folderName, projectId, deploymentId, night, singleLeafDataset } = params

  if (folderName && singleLeafDataset) {
    return {
      to: '/datasets/$folderName' as const,
      params: { folderName },
    }
  }

  if (folderName) {
    return {
      to: '/datasets/$folderName/groups/$leafGroupId' as const,
      params: {
        folderName,
        leafGroupId: night.id,
      },
    }
  }

  return {
    to: '/projects/$projectId/deployments/$deploymentId/nights/$nightId' as const,
    params: buildNightRouteParams({ projectId, deploymentId, night }),
  }
}

export function parseDatasetFolderFromPathname(pathname: string): string | null {
  const parts = (pathname ?? '').replace(/^\/+/, '').split('/').filter(Boolean)
  if (parts[0] !== 'datasets' || !parts[1]) return null
  return decodeURIComponent(parts[1])
}

export function isDatasetSingleLeafPathname(pathname: string) {
  const parts = (pathname ?? '').replace(/^\/+/, '').split('/').filter(Boolean)
  return parts[0] === 'datasets' && !!parts[1] && !parts[2]
}

export function parseLeafGroupIdFromPathname(pathname: string): string | null {
  const parts = (pathname ?? '').replace(/^\/+/, '').split('/').filter(Boolean)
  if (parts[0] === 'datasets' && parts[2] === 'groups' && parts[3]) {
    return decodeURIComponent(parts[3])
  }
  return null
}

export function parseLegacyNightRoute(pathname: string) {
  const parts = (pathname ?? '').replace(/^\/+/, '').split('/').filter(Boolean)
  if (parts[0] !== 'projects') return null
  if (parts[2] !== 'deployments' || parts[4] !== 'nights') return null

  const projectId = parts[1]
  const deploymentId = parts[3]
  const leafGroupId = parts[5]
  if (!projectId || !deploymentId || !leafGroupId) return null

  return { projectId, deploymentId, leafGroupId }
}

export function resolveLeafGroupIdFromRoute(params: {
  pathname: string
  nights: Record<string, Pick<LeafGroupEntity, 'id'> | undefined>
  leafGroupIds?: string[]
}) {
  const { pathname, nights, leafGroupIds = [] } = params
  const fromGroupsRoute = parseLeafGroupIdFromPathname(pathname)
  if (fromGroupsRoute) return fromGroupsRoute

  if (isDatasetSingleLeafPathname(pathname) && leafGroupIds.length === 1) {
    return leafGroupIds[0] ?? null
  }

  const legacy = parseLegacyNightRoute(pathname)
  if (!legacy) return null

  return resolveLeafGroupEntityIdFromRoute({
    nights,
    projectId: legacy.projectId,
    deploymentId: legacy.deploymentId,
    leafGroupId: legacy.leafGroupId,
  })
}
