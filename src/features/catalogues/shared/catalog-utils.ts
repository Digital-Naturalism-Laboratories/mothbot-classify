import type { IndexedFile } from '~/features/data-flow/1.ingest/files.state'
import type { ScopeType } from './scope-filters'
import { deriveSiteFromDeploymentFolder } from '~/features/data-flow/1.ingest/ingest-paths'
import {
  isDatasetSingleLeafPathname,
  parseDatasetFolderFromPathname,
  parseLeafGroupIdFromPathname,
} from '~/features/mothbox-next/hierarchy-routes'
import type { NightSummaryEntity } from '~/stores/entities/night-summaries'

export type CatalogScopeIds = {
  projectId?: string
  siteId?: string
  deploymentId?: string
  nightId?: string
}

export const CATALOG_SCOPE_ORDER: ScopeType[] = ['all', 'project', 'site', 'deployment', 'night']

export function isCatalogScopeSelectable(params: { usageScope: ScopeType; scopeIds: CatalogScopeIds }): boolean {
  const { usageScope, scopeIds } = params
  const { projectId, siteId, deploymentId, nightId } = scopeIds

  if (usageScope === 'all') return true
  if (usageScope === 'project') return !!projectId
  if (usageScope === 'site') return !!(projectId && siteId)
  if (usageScope === 'deployment') return !!(projectId && deploymentId)
  if (usageScope === 'night') return !!(projectId && deploymentId && nightId)

  return false
}

export function buildCatalogScopeCounts(params: {
  summaries?: Record<string, NightSummaryEntity>
  nights?: Record<string, NightScopeEntity>
  scopeIds: CatalogScopeIds
  countForScope: (allowedNightIds: Set<string> | undefined) => number
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

    const allowedNightIds = computeAllowedNightIds({
      usageScope,
      summaries: summaries ?? {},
      nights,
      ...scopeIds,
    })

    counts[usageScope] = countForScope(allowedNightIds)
  }

  return counts
}

export function buildNightsRecordFromIds(nightIds: string[]): Record<string, NightScopeEntity> {
  const nights: Record<string, NightScopeEntity> = {}

  for (const nightId of nightIds) {
    nights[nightId] = { id: nightId }
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
  const nightId = hasNightSegment ? parts[5] : undefined
  const siteId = deploymentId ? deriveSiteFromDeploymentFolder(deploymentId) : undefined
  return { projectId, siteId, deploymentId, nightId }
}

export function extractDatasetRouteIds(
  pathname: string,
  nights: Record<string, NightScopeEntity>,
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

  const night = resolveNightScopeEntity({ nightId: leafGroupId, nights })
  if (!night?.projectId || !night.deploymentId) return {}

  const nightId = night.id ?? leafGroupId
  const siteId = night.siteId ?? (night.deploymentId ? deriveSiteFromDeploymentFolder(night.deploymentId) : undefined)

  return {
    projectId: night.projectId,
    siteId,
    deploymentId: night.deploymentId,
    nightId,
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

type NightScopeEntity = {
  id?: string
  projectId?: string
  siteId?: string
  deploymentId?: string
}

export function computeAllowedNightIds(params: {
  usageScope: ScopeType
  summaries: Record<string, NightSummaryEntity>
  nights?: Record<string, NightScopeEntity>
  projectId?: string
  siteId?: string
  deploymentId?: string
  nightId?: string
}): Set<string> | undefined {
  const { usageScope, summaries, nights, projectId, siteId, deploymentId, nightId } = params
  if (usageScope === 'all') return undefined

  const candidateNightIds = new Set<string>()
  for (const nid of Object.keys(summaries || {})) candidateNightIds.add(nid)
  for (const [key, night] of Object.entries(nights ?? {})) {
    if (night?.id) candidateNightIds.add(night.id)
    else if (key) candidateNightIds.add(key)
  }

  const ids = new Set<string>()
  for (const nid of candidateNightIds) {
    const night = resolveNightScopeEntity({ nightId: nid, nights })
    if (!isNightAllowedInScope({ nightId: nid, night, usageScope, projectId, siteId, deploymentId, nightIdFilter: nightId })) {
      continue
    }
    ids.add(nid)
  }

  return ids
}

function resolveNightScopeEntity(params: {
  nightId: string
  nights?: Record<string, NightScopeEntity>
}): NightScopeEntity | undefined {
  const { nightId, nights } = params
  if (!nights) return undefined

  const direct = nights[nightId]
  if (direct) return { ...direct, id: direct.id ?? nightId }

  for (const night of Object.values(nights)) {
    if (night?.id === nightId) return { ...night, id: nightId }
  }

  return undefined
}

function isNightAllowedInScope(params: {
  nightId: string
  night?: NightScopeEntity
  usageScope: ScopeType
  projectId?: string
  siteId?: string
  deploymentId?: string
  nightIdFilter?: string
}): boolean {
  const { nightId, night, usageScope, projectId, siteId, deploymentId, nightIdFilter } = params

  if (usageScope === 'project') {
    if (!projectId) return false
    if (night?.projectId) return night.projectId === projectId
    return nightId.startsWith(`${projectId}/`)
  }

  if (usageScope === 'site') {
    if (!projectId || !siteId) return false
    if (night?.projectId && night?.siteId) {
      return night.projectId === projectId && night.siteId === siteId
    }
    const parts = nightId.split('/').filter(Boolean)
    const deployment = parts[1] ?? ''
    const derivedSite = deriveSiteFromDeploymentFolder(deployment)
    return parts[0] === projectId && derivedSite === siteId
  }

  if (usageScope === 'deployment') {
    if (!projectId || !deploymentId) return false
    if (night?.projectId && night?.deploymentId) {
      return night.projectId === projectId && night.deploymentId === deploymentId
    }
    return nightId.startsWith(`${projectId}/${deploymentId}/`)
  }

  if (usageScope === 'night') {
    if (!projectId || !deploymentId || !nightIdFilter) return false
    if (night?.id) {
      const exact = `${projectId}/${deploymentId}/${nightIdFilter}`
      return night.id === exact || night.id === nightIdFilter
    }
    const exact = `${projectId}/${deploymentId}/${nightIdFilter}`
    return nightId === exact || nightId === nightIdFilter
  }

  return false
}

export function parseNightIdParts(nightId: string) {
  const parts = (nightId || '').split('/')
  const projectId = parts?.[0]
  const deploymentId = parts?.[1]
  const nightIdPart = parts?.[2]
  const siteId = deploymentId ? deriveSiteFromDeploymentFolder(deploymentId) : undefined
  return { projectId, siteId, deploymentId, nightId: nightIdPart }
}

export function buildNightUrl(params: { projectId?: string; siteId?: string; deploymentId?: string; nightId?: string }) {
  const { projectId, deploymentId, nightId } = params
  const hasAll = !!(projectId && deploymentId && nightId)
  if (!hasAll) return undefined
  return `/projects/${encodeURIComponent(projectId)}/deployments/${encodeURIComponent(deploymentId)}/nights/${encodeURIComponent(nightId)}`
}
