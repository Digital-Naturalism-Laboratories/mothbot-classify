import { deriveSiteFromDeploymentFolder } from '../1.ingest/ingest-paths'
import { mothboxNextPackageStore } from '~/features/mothbox-next/active-package'
import { joinPackagePath } from '~/features/mothbox-next/package-paths'

/**
 * Exports folder inside a Mothbox Next package, a sibling of `02_records/` and
 * `03_classifications/`. Numbered to sort alongside them.
 */
export const PACKAGE_EXPORTS_FOLDER = '04_exports'

/**
 * Path to the package-level exports folder, relative to the datasets root —
 * e.g. `Tucson/_processed/DesertHouse/04_exports`.
 *
 * Returns null when no Mothbox Next package is open (legacy datasets), so
 * callers can fall back to their per-project export path.
 */
export function getPackageExportFolderPath(): string | null {
  const packageRoot = mothboxNextPackageStore.get()?.packageRoot
  if (!packageRoot) return null
  return joinPackagePath(packageRoot, PACKAGE_EXPORTS_FOLDER)
}

export function getProjectExportPath(params: { leafGroupId: string }): string {
  const { leafGroupId } = params
  const parts = leafGroupId.split('/').filter(Boolean)
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

export function buildExportFileNameParts(params: { leafGroupId: string }) {
  const { leafGroupId } = params
  const parts = (leafGroupId || '').split('/').filter(Boolean)
  // Expected: [project, deployment, night]
  const project = parts[0] || 'dataset'
  const deployment = parts[1] || 'deployment'
  const site = deriveSiteFromDeploymentFolder(deployment)
  const night = parts[2] || parts[parts.length - 1] || 'night'

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
