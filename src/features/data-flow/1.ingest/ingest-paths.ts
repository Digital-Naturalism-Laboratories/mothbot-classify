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
  nightId: string
}

export function deriveSiteFromDeploymentFolder(deploymentFolderName: string) {
  const name = deploymentFolderName ?? ''
  if (!name) return ''
  const parts = name.split('_').filter(Boolean)
  if (parts.length >= 2) return parts[1]
  return name
}

export function normalizeLegacyNightId(nightId: string) {
  const normalized = (nightId ?? '').replaceAll('\\', '/').replace(/^\/+/, '').trim()
  if (!normalized) return ''

  const parts = normalized.split('/').filter(Boolean)
  if (parts.length !== 4) return normalized

  const [project, legacySite, deployment, night] = parts
  const derivedSite = deriveSiteFromDeploymentFolder(deployment)
  if (!project || !deployment || !night) return normalized
  if (!legacySite || legacySite !== derivedSite) return normalized

  return `${project}/${deployment}/${night}`
}

export function parseNightId(params: { nightId: string }): ParsedNightId | null {
  const { nightId } = params
  const normalized = normalizeLegacyNightId(nightId)
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
    nightId: `${project}/${deployment}/${night}`,
  }
}

export function parsePathParts(params: { path: string }) {
  const { path } = params
  const normalized = (path ?? '').replaceAll('\\', '/').replace(/^\/+/, '')
  const segments = normalized.split('/').filter(Boolean)
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
  const isUserJson = lower.endsWith('_identified.json')
  const baseName = isBotJson
    ? fileName.slice(0, -'_botdetection.json'.length)
    : lower.endsWith('_identified.json')
    ? fileName.slice(0, -'_identified.json'.length)
    : fileName.endsWith('.jpg')
    ? fileName.slice(0, -'.jpg'.length)
    : fileName

  return { project, site, deployment, night, isPatch, isPhotoJpg, isBotJson, isUserJson, fileName, baseName }
}

export function extractNightDiskPathFromIndexedPath(path: string) {
  const normalized = (path ?? '').replaceAll('\\', '/').replace(/^\/+/, '')
  const segments = normalized.split('/').filter(Boolean)
  if (segments.length < 2) return ''
  const withoutFile = segments.slice(0, -1)
  const joined = withoutFile.join('/')
  return joined
}
