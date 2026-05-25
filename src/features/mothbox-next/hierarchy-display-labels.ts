import { parseDinalabDeploymentFolderName } from './adapters/dinalab-mothbox-v1/derive-dinalab-hierarchy'
import type { DeploymentRecord } from './records'

const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

export const DEFAULT_SITE_SEGMENT = '_default'

export function isIsoDateOnly(value: string) {
  return ISO_DATE_ONLY.test((value ?? '').trim())
}

export function formatHierarchySegmentLabel(segment: string) {
  const trimmed = (segment ?? '').trim()
  if (!trimmed) return ''
  return trimmed.replaceAll('_', ' ')
}

export function deploymentRecordDisplayName(record: DeploymentRecord) {
  const device = record.device_id_from_folder ?? record.device_id
  const start = record.deployment_start_from_folder

  if (device && start) {
    return `${formatHierarchySegmentLabel(device)} · ${start}`
  }

  const parsed = parseDinalabDeploymentFolderName(record.deployment_id)
  if (parsed.deviceId && parsed.deploymentDate) {
    return `${formatHierarchySegmentLabel(parsed.deviceId)} · ${parsed.deploymentDate}`
  }

  if (!parsed.deviceId && parsed.siteName && parsed.deploymentDate) {
    return `Deployment · ${parsed.deploymentDate}`
  }

  if (parsed.deploymentDate && isIsoDateOnly(record.deployment_id)) {
    return `Deployment · ${parsed.deploymentDate}`
  }

  const formatted = formatHierarchySegmentLabel(record.deployment_id)
  return formatted || record.deployment_id
}

export function siteDisplayNameForDeployment(params: { siteId: string; deployment: DeploymentRecord }) {
  const { siteId, deployment } = params
  const fromRecord = deployment.site_name_from_folder
  if (fromRecord && !isIsoDateOnly(fromRecord)) {
    return formatHierarchySegmentLabel(fromRecord)
  }

  const fromSiteId = siteDisplayNameFromSiteId(siteId)
  if (fromSiteId) return fromSiteId

  return ''
}

export function siteDisplayNameFromSiteId(siteId: string) {
  const segment = siteId.split('/').pop() ?? siteId
  if (!segment || segment === 'site' || segment === DEFAULT_SITE_SEGMENT) return ''
  if (isIsoDateOnly(segment)) return ''
  return formatHierarchySegmentLabel(segment)
}

export function isSyntheticDefaultSite(site: { id: string; name: string }) {
  const tail = site.id.split('/').pop() ?? ''
  if (tail === 'site' || tail === DEFAULT_SITE_SEGMENT) return true
  const name = (site.name ?? '').trim()
  if (!name || name === 'site' || name === 'Site') return true
  return false
}

export function shouldSkipSiteLevelInProjectsTree(sites: SiteEntityLike[]) {
  if (sites.length !== 1) return false
  return isSyntheticDefaultSite(sites[0])
}

type SiteEntityLike = { id: string; name: string }
