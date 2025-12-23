export function getProjectExportPath(params: { nightId: string }): string {
  const { nightId } = params
  const parts = nightId.split('/').filter(Boolean)
  const project = parts[0] || ''
  if (!project) return 'exports'
  return `${project}/exports`
}

export function sanitizeForFileName(input: string): string {
  const trimmed = (input ?? '').trim()
  if (!trimmed) return 'unnamed'
  // Replace spaces with underscore and strip characters that are problematic in file names
  const replaced = trimmed.replace(/\s+/g, '_')
  const cleaned = replaced.replace(/[^a-zA-Z0-9._-]/g, '_')
  return cleaned
}

export function buildExportFileNameParts(params: { nightId: string }) {
  const { nightId } = params
  const parts = (nightId || '').split('/').filter(Boolean)
  // Expected: [project, site, deployment, night]
  const project = parts[0] || 'dataset'
  const site = parts.length >= 4 ? parts[1] : ''
  const deployment = parts.length >= 4 ? parts[2] : parts[1] || 'deployment'
  const night = parts[parts.length - 1] || 'night'

  return {
    project,
    site,
    deployment,
    night,
    datasetName: sanitizeForFileName(project),
    siteName: site ? sanitizeForFileName(site) : '',
    deploymentName: sanitizeForFileName(deployment),
    nightName: sanitizeForFileName(night),
  }
}

export function formatTodayYyyyMm_Dd(): string {
  const d = new Date()
  const yyyy = String(d.getFullYear())
  const MM = String(d.getMonth() + 1).padStart(2, '0')
  const DD = String(d.getDate()).padStart(2, '0')
  // Spec: YYYY-MM_DD
  const res = `${yyyy}-${MM}_${DD}`
  return res
}
