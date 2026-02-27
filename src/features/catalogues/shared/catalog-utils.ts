import type { IndexedFile } from '~/features/data-flow/1.ingest/files.state'
import type { ScopeType } from './scope-filters'
import { deriveSiteFromDeploymentFolder } from '~/features/data-flow/1.ingest/ingest-paths'

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

export function computeAllowedNightIds(params: {
  usageScope: ScopeType
  summaries: Record<string, any>
  projectId?: string
  siteId?: string
  deploymentId?: string
  nightId?: string
}): Set<string> | undefined {
  const { usageScope, summaries, projectId, siteId, deploymentId, nightId } = params
  if (usageScope === 'all') return undefined
  const ids = new Set<string>()
  for (const nid of Object.keys(summaries || {})) {
    if (usageScope === 'project') {
      if (projectId && nid.startsWith(projectId + '/')) ids.add(nid)
      continue
    }
    if (usageScope === 'site') {
      if (projectId && siteId) {
        const parts = nid.split('/').filter(Boolean)
        const deployment = parts[1] ?? ''
        const derivedSite = deriveSiteFromDeploymentFolder(deployment)
        if (parts[0] === projectId && derivedSite === siteId) ids.add(nid)
      }
      continue
    }
    if (usageScope === 'deployment') {
      if (projectId && deploymentId && nid.startsWith(`${projectId}/${deploymentId}/`)) ids.add(nid)
      continue
    }
    if (usageScope === 'night') {
      if (projectId && deploymentId && nightId) {
        const exact = `${projectId}/${deploymentId}/${nightId}`
        if (nid === exact) ids.add(nid)
      }
      continue
    }
  }
  return ids
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
