import type { IndexedFile } from '~/features/data-flow/1.ingest/files.state'
import type { ScopeType } from './scope-filters'

export function extractRouteIds(pathname: string) {
  const parts = (pathname || '').replace(/^\/+/, '').split('/').filter(Boolean)
  const isProjects = parts[0] === 'projects'
  const projectId = isProjects ? parts[1] : undefined
  const siteId = isProjects && parts[2] === 'sites' ? parts[3] : undefined
  const deploymentId = isProjects && parts[4] === 'deployments' ? parts[5] : undefined
  const nightId = isProjects && parts[6] === 'nights' ? parts[7] : undefined
  return { projectId, siteId, deploymentId, nightId }
}

export async function ensureFileFromIndexed(indexed: IndexedFile): Promise<File | undefined> {
  const existing = (indexed as any)?.file as File | undefined
  if (existing) return existing
  const handle = (indexed as any)?.handle as { getFile?: () => Promise<File> } | undefined
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
      if (projectId && siteId && nid.startsWith(`${projectId}/${siteId}/`)) ids.add(nid)
      continue
    }
    if (usageScope === 'deployment') {
      if (projectId && siteId && deploymentId && nid.startsWith(`${projectId}/${siteId}/${deploymentId}/`)) ids.add(nid)
      continue
    }
    if (usageScope === 'night') {
      if (projectId && siteId && deploymentId && nightId) {
        const exact = `${projectId}/${siteId}/${deploymentId}/${nightId}`
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
  const siteId = parts?.[1]
  const deploymentId = parts?.[2]
  const nightIdPart = parts?.[3]
  return { projectId, siteId, deploymentId, nightId: nightIdPart }
}

export function buildNightUrl(params: { projectId?: string; siteId?: string; deploymentId?: string; nightId?: string }) {
  const { projectId, siteId, deploymentId, nightId } = params
  const hasAll = !!(projectId && siteId && deploymentId && nightId)
  if (!hasAll) return undefined
  return `/projects/${encodeURIComponent(projectId)}/sites/${encodeURIComponent(siteId)}/deployments/${encodeURIComponent(
    deploymentId,
  )}/nights/${encodeURIComponent(nightId)}`
}
