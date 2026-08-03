export function isLikelyNightFolderName(name: string) {
  const n = (name ?? '').toLowerCase()
  if (!n) return false
  const isDate = /^\d{4}-\d{2}-\d{2}$/.test(n)
  if (isDate) return true
  if (n.startsWith('night')) return true
  return false
}

export type ParsedNightId = {
  project: string
  site: string
  deployment: string
  night: string
  leafGroupId: string
}

export function deriveSiteFromDeploymentFolder(deploymentFolderName: string) {
  const name = deploymentFolderName ?? ''
  if (!name) return ''
  const parts = name.split('_').filter(Boolean)
  if (parts.length >= 2) return parts[1]
  return name
}

export function normalizeLegacyNightId(leafGroupId: string) {
  const normalized = (leafGroupId ?? '').replaceAll('\\', '/').replace(/^\/+/, '').trim()
  if (!normalized) return ''

  const parts = normalized.split('/').filter(Boolean)
  if (parts.length !== 4) return normalized

  const [project, legacySite, deployment, night] = parts
  const derivedSite = deriveSiteFromDeploymentFolder(deployment)
  if (!project || !deployment || !night) return normalized
  if (!legacySite || legacySite !== derivedSite) return normalized

  return `${project}/${deployment}/${night}`
}

export function buildLegacyNightIdFromRoute(params: {
  projectId: string
  deploymentId: string
  leafGroupId: string
}): string {
  const { projectId, deploymentId, leafGroupId } = params
  return `${projectId}/${deploymentId}/${leafGroupId}`
}

/** Last path segment for slash-separated entity ids; unchanged for flat ids. */
export function routePathSegmentFromEntityId(id: string) {
  const parts = (id ?? '').split('/').filter(Boolean)
  if (parts.length > 1) return parts[parts.length - 1] ?? id
  return id
}

/** Night segment for router params: legacy uses last path segment; mothbox-next uses night_date (name). */
export function routeNightSegmentFromEntity(night: { id: string; name: string }) {
  const id = night.id ?? ''
  if (id.includes('/')) return routePathSegmentFromEntityId(id)
  if (id.includes('__')) return (night.name || id.split('__').pop() || id).trim()
  return routePathSegmentFromEntityId(id)
}

export function buildNightRouteParams(params: {
  projectId: string
  deploymentId: string
  night: { id: string; name: string }
}) {
  const { projectId, deploymentId, night } = params
  return {
    projectId,
    deploymentId: routePathSegmentFromEntityId(deploymentId),
    nightId: routeNightSegmentFromEntity(night),
  }
}

/**
 * Maps URL route params to the night entity id in the store.
 * Legacy nights use project/deployment/night; mothbox-next packages use camera_day_id.
 */
export function resolveLeafGroupEntityIdFromRoute(params: {
  nights: Record<string, { id: string } | undefined>
  projectId: string
  deploymentId: string
  leafGroupId: string
}): string {
  const { nights, projectId, deploymentId, leafGroupId } = params
  const legacyId = buildLegacyNightIdFromRoute({ projectId, deploymentId, leafGroupId })

  if (nights[legacyId]) return legacyId
  if (nights[leafGroupId]) return leafGroupId

  const cameraDayId = `${deploymentId}__${leafGroupId}`
  if (nights[cameraDayId]) return cameraDayId

  if (leafGroupId.includes('__')) {
    const nightDate = leafGroupId.split('__').pop() ?? ''
    if (nightDate) {
      const fromDate = `${deploymentId}__${nightDate}`
      if (nights[fromDate]) return fromDate
    }
  }

  return legacyId
}

export function parseNightId(params: { leafGroupId: string }): ParsedNightId | null {
  const { leafGroupId } = params
  const normalized = normalizeLegacyNightId(leafGroupId)
  if (!normalized) return null

  const parts = normalized.split('/').filter(Boolean)
  if (parts.length < 3) return null

  const [project, deployment, night] = parts
  if (!project || !deployment || !night) return null

  const site = deriveSiteFromDeploymentFolder(deployment)
  return {
    project,
    site,
    deployment,
    night,
    leafGroupId: `${project}/${deployment}/${night}`,
  }
}

import { isPackageArchiveRelativePath } from './reserved-paths'

export function parsePathParts(params: { path: string }) {
  const { path } = params
  const normalized = (path ?? '').replaceAll('\\', '/').replace(/^\/+/, '')
  if (isPackageArchiveRelativePath(normalized)) return null

  
  // Strip the `_processed` mirror prefix so JSON files stored under
  // _processed/<project>/<deployment>/<night>/... are parsed with the
  // same positional logic as co-located (legacy) files.
  const rawSegments = normalized.split('/').filter(Boolean)
  const processedIndex = rawSegments.findIndex((s) => s.toLowerCase() === '_processed')
  const segments =
    processedIndex >= 0
      ? [...rawSegments.slice(0, processedIndex), ...rawSegments.slice(processedIndex + 1)]
      : rawSegments  
  
  if (segments.length < 4) return null
  const [project, deployment, night, ...rest] = segments
  const site = deriveSiteFromDeploymentFolder(deployment)

  if (!isLikelyNightFolderName(night)) return null
  const isPatchesFolder = rest[0] === 'patches'

  const fileName = isPatchesFolder ? rest[1] : rest[0]
  if (!fileName) return null

  const lower = fileName.toLowerCase()
  const isPatch = isPatchesFolder && lower.endsWith('.jpg')
  const isPhotoJpg = !isPatchesFolder && lower.endsWith('.jpg')
  const isBotJson = lower.endsWith('_botdetection.json')
  // Archived bot JSONs: preserved from a previous model run, e.g. img_botdetection_Mothbot_yolo11m_v1.json
  const isArchivedBotJson = !isBotJson && lower.includes('_botdetection_') && lower.endsWith('.json')
  const isUserJson = lower.endsWith('_identified.json')
  const baseName = isBotJson
    ? fileName.slice(0, -'_botdetection.json'.length)
    : lower.endsWith('_identified.json')
    ? fileName.slice(0, -'_identified.json'.length)
    : fileName.endsWith('.jpg')
    ? fileName.slice(0, -'.jpg'.length)
    : fileName

  return { project, site, deployment, night, isPatch, isPhotoJpg, isBotJson, isArchivedBotJson, isUserJson, fileName, baseName }
}

export function extractNightDiskPathFromIndexedPath(path: string) {
  const normalized = (path ?? '').replaceAll('\\', '/').replace(/^\/+/, '')
  const segments = normalized.split('/').filter(Boolean)
  if (segments.length < 2) return ''
  const withoutFile = segments.slice(0, -1)
  const joined = withoutFile.join('/')
  return joined
}
