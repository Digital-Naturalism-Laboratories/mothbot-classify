import type { IndexedFile } from '~/features/data-flow/1.ingest/files.state'
import type { ScopeType } from './scope-filters'
import { deriveSiteFromDeploymentFolder } from '~/features/data-flow/1.ingest/ingest-paths'
import {
  isDatasetSingleLeafPathname,
  parseDatasetFolderFromPathname,
  parseLeafGroupIdFromPathname,
} from '~/features/mothbox-next/hierarchy-routes'
import type { LeafGroupSummaryEntity } from '~/stores/entities/night-summaries'
import { resolveDatasetId, type LeafGroupScopeEntity } from '~/features/mothbox-next/dataset-scope'

export type CatalogScopeIds = {
  projectId?: string
  siteId?: string
  deploymentId?: string
  leafGroupId?: string
}

export const CATALOG_SCOPE_ORDER: ScopeType[] = ['all', 'project', 'site', 'deployment', 'night']

export function isCatalogScopeSelectable(params: { usageScope: ScopeType; scopeIds: CatalogScopeIds }): boolean {
  const { usageScope, scopeIds } = params
  const { projectId, siteId, deploymentId, leafGroupId } = scopeIds

  if (usageScope === 'all') return true
  if (usageScope === 'project') return !!projectId
  if (usageScope === 'site') return !!(projectId && siteId)
  if (usageScope === 'deployment') return !!(projectId && deploymentId)
  if (usageScope === 'night') return !!(projectId && deploymentId && leafGroupId)

  return false
}

export function buildCatalogScopeCounts(params: {
  summaries?: Record<string, LeafGroupSummaryEntity>
  nights?: Record<string, LeafGroupScopeEntity>
  scopeIds: CatalogScopeIds
  countForScope: (allowedLeafGroupIds: Set<string> | undefined) => number
  scopeOrder?: ScopeType[]
}): Record<ScopeType, number> {
  const { summaries, nights, scopeIds, countForScope, scopeOrder = CATALOG_SCOPE_ORDER } = params
  const counts: Record<ScopeType, number> = {
    all: 0,
    project: 0,
    site: 0,
    deployment: 0,
    night: 0,
  }

  for (const usageScope of scopeOrder) {
    if (!isCatalogScopeSelectable({ usageScope, scopeIds })) continue

    const allowedLeafGroupIds = computeAllowedLeafGroupIds({
      usageScope,
      summaries: summaries ?? {},
      nights,
      ...scopeIds,
    })

    counts[usageScope] = countForScope(allowedLeafGroupIds)
  }

  return counts
}

export function buildNightsRecordFromIds(leafGroupIds: string[]): Record<string, LeafGroupScopeEntity> {
  const nights: Record<string, LeafGroupScopeEntity> = {}

  for (const leafGroupId of leafGroupIds) {
    nights[leafGroupId] = { id: leafGroupId }
  }

  return nights
}

export function extractRouteIds(pathname: string) {
  const parts = (pathname || '').replace(/^\/+/, '').split('/').filter(Boolean)
  const isProjects = parts[0] === 'projects'
  const projectId = isProjects ? parts[1] : undefined
  const hasDeploymentSegment = isProjects && parts[2] === 'deployments'
  const deploymentId = hasDeploymentSegment ? parts[3] : undefined
  const hasNightSegment = hasDeploymentSegment && parts[4] === 'nights'
  const leafGroupId = hasNightSegment ? parts[5] : undefined
  const siteId = deploymentId ? deriveSiteFromDeploymentFolder(deploymentId) : undefined
  return { projectId, siteId, deploymentId, leafGroupId }
}

export function extractDatasetRouteIds(
  pathname: string,
  nights: Record<string, LeafGroupScopeEntity>,
  leafGroupIds: string[] = [],
): CatalogScopeIds {
  if (!parseDatasetFolderFromPathname(pathname)) return {}

  let leafGroupId = parseLeafGroupIdFromPathname(pathname)
  if (!leafGroupId && isDatasetSingleLeafPathname(pathname)) {
    if (leafGroupIds.length === 1) leafGroupId = leafGroupIds[0]
    else {
      const nightList = Object.values(nights)
      if (nightList.length === 1) leafGroupId = nightList[0]?.id ?? Object.keys(nights)[0]
    }
  }
  if (!leafGroupId) return {}

  const night = resolveLeafGroupScopeEntity({ leafGroupId, nights })
  const datasetId = resolveDatasetId(night)
  if (!datasetId || !night?.deploymentId) return {}

  const resolvedLeafGroupId = night.id ?? leafGroupId
  const siteId = night.siteId ?? (night.deploymentId ? deriveSiteFromDeploymentFolder(night.deploymentId) : undefined)

  return {
    projectId: datasetId,
    siteId,
    deploymentId: night.deploymentId,
    leafGroupId: resolvedLeafGroupId,
  }
}

export async function ensureFileFromIndexed(indexed: IndexedFile): Promise<File | undefined> {
  const existing = indexed?.file
  if (existing) return existing

  const handle = indexed?.handle as { getFile?: () => Promise<File> } | undefined
  if (handle && typeof handle.getFile === 'function') {
    try {
      const file = await handle.getFile()
      return file
    } catch {
      return undefined
    }
  }
  return undefined
}

export function computeAllowedLeafGroupIds(params: {
  usageScope: ScopeType
  summaries: Record<string, LeafGroupSummaryEntity>
  nights?: Record<string, LeafGroupScopeEntity>
  projectId?: string
  siteId?: string
  deploymentId?: string
  leafGroupId?: string
}): Set<string> | undefined {
  const { usageScope, summaries, nights, projectId, siteId, deploymentId, leafGroupId } = params
  if (usageScope === 'all') return undefined

  const candidateLeafGroupIds = new Set<string>()
  for (const nid of Object.keys(summaries || {})) candidateLeafGroupIds.add(nid)
  for (const [key, night] of Object.entries(nights ?? {})) {
    if (night?.id) candidateLeafGroupIds.add(night.id)
    else if (key) candidateLeafGroupIds.add(key)
  }

  const ids = new Set<string>()
  for (const nid of candidateLeafGroupIds) {
    const night = resolveLeafGroupScopeEntity({ leafGroupId: nid, nights })
    if (!isLeafGroupAllowedInScope({ leafGroupId: nid, night, usageScope, projectId, siteId, deploymentId, leafGroupIdFilter: leafGroupId })) {
      continue
    }
    ids.add(nid)
  }

  return ids
}

function resolveLeafGroupScopeEntity(params: {
  leafGroupId: string
  nights?: Record<string, LeafGroupScopeEntity>
}): LeafGroupScopeEntity | undefined {
  const { leafGroupId, nights } = params
  if (!nights) return undefined

  const direct = nights[leafGroupId]
  if (direct) return { ...direct, id: direct.id ?? leafGroupId }

  for (const night of Object.values(nights)) {
    if (night?.id === leafGroupId) return { ...night, id: leafGroupId }
  }

  return undefined
}

function isLeafGroupAllowedInScope(params: {
  leafGroupId: string
  night?: LeafGroupScopeEntity
  usageScope: ScopeType
  projectId?: string
  siteId?: string
  deploymentId?: string
  leafGroupIdFilter?: string
}): boolean {
  const { leafGroupId, night, usageScope, projectId, siteId, deploymentId, leafGroupIdFilter } = params

  if (usageScope === 'project') {
    if (!projectId) return false
    const datasetId = resolveDatasetId(night)
    if (datasetId) return datasetId === projectId
    return leafGroupId.startsWith(`${projectId}/`)
  }

  if (usageScope === 'site') {
    if (!projectId || !siteId) return false
    const datasetId = resolveDatasetId(night)
    if (datasetId && night?.siteId) {
      return datasetId === projectId && night.siteId === siteId
    }
    const parts = leafGroupId.split('/').filter(Boolean)
    const deployment = parts[1] ?? ''
    const derivedSite = deriveSiteFromDeploymentFolder(deployment)
    return parts[0] === projectId && derivedSite === siteId
  }

  if (usageScope === 'deployment') {
    if (!projectId || !deploymentId) return false
    const datasetId = resolveDatasetId(night)
    if (datasetId && night?.deploymentId) {
      return datasetId === projectId && night.deploymentId === deploymentId
    }
    return leafGroupId.startsWith(`${projectId}/${deploymentId}/`)
  }

  if (usageScope === 'night') {
    if (!projectId || !deploymentId || !leafGroupIdFilter) return false
    if (night?.id) {
      const datasetId = resolveDatasetId(night)
      if (datasetId && night.deploymentId) {
        return datasetId === projectId && night.deploymentId === deploymentId && night.id === leafGroupIdFilter
      }
      const exact = `${projectId}/${deploymentId}/${leafGroupIdFilter}`
      return night.id === exact || night.id === leafGroupIdFilter
    }
    const exact = `${projectId}/${deploymentId}/${leafGroupIdFilter}`
    return leafGroupId === exact || leafGroupId === leafGroupIdFilter
  }

  return false
}

export function parseNightIdParts(leafGroupId: string) {
  const parts = (leafGroupId || '').split('/')
  const projectId = parts?.[0]
  const deploymentId = parts?.[1]
  const nightIdPart = parts?.[2]
  const siteId = deploymentId ? deriveSiteFromDeploymentFolder(deploymentId) : undefined
  return { projectId, siteId, deploymentId, leafGroupId: nightIdPart }
}

export function buildNightUrl(params: { projectId?: string; siteId?: string; deploymentId?: string; leafGroupId?: string }) {
  const { projectId, deploymentId, leafGroupId } = params
  const hasAll = !!(projectId && deploymentId && leafGroupId)
  if (!hasAll) return undefined
  return `/projects/${encodeURIComponent(projectId)}/deployments/${encodeURIComponent(deploymentId)}/nights/${encodeURIComponent(leafGroupId)}`
}
