import type { MothboxNextDatasetManifest } from './dataset-manifest'

export { PACKAGE_ARCHIVE_DIR, isPackageArchiveRelativePath } from '~/features/data-flow/1.ingest/reserved-paths'

export function normalizePackageRelativePath(path: string): string {
  return path.replaceAll('\\', '/').replace(/^\/+/, '')
}

export function toPackageRelativePath(params: { packageRoot: string; filePath: string }): string {
  const { packageRoot, filePath } = params
  const normalized = filePath.replaceAll('\\', '/')
  const root = packageRoot.replace(/\/+$/, '')
  if (!root) return normalized.replace(/^\/+/, '')
  if (normalized.startsWith(`${root}/`)) return normalized.slice(root.length + 1)
  return normalized.replace(/^\/+/, '')
}

export function joinPackagePath(packageRoot: string, relativePath: string): string {
  const root = packageRoot.replace(/\/+$/, '')
  const rel = relativePath.replace(/^\/+/, '')
  if (!root) return rel
  return `${root}/${rel}`
}

export function patchAssetAbsolutePath(params: { packageRoot: string; assetPath: string }): string {
  return joinPackagePath(params.packageRoot, params.assetPath)
}

export function resolveManifestPaths(params: { packageRoot: string; manifest: MothboxNextDatasetManifest }) {
  const { packageRoot, manifest } = params
  const rel = (p: string) => joinPackagePath(packageRoot, p)

  return {
    patchesNdjson: rel(manifest.records.patches),
    patchSourcesNdjson: manifest.records.patch_sources ? rel(manifest.records.patch_sources) : undefined,
    currentClassificationsNdjson: manifest.records.current_classifications
      ? rel(manifest.records.current_classifications)
      : undefined,
    deploymentsNdjson: manifest.records.deployments ? rel(manifest.records.deployments) : undefined,
    cameraDaysNdjson: manifest.records.camera_days ? rel(manifest.records.camera_days) : undefined,
    morphoLinksNdjson: rel(manifest.records.morpho_links ?? '02_records/morpho-links.ndjson'),
    classificationsDir: rel(manifest.folders.classifications),
    patchesDir: rel(manifest.folders.patches),
    sourceDir: manifest.source?.included && manifest.source.path ? rel(manifest.source.path) : undefined,
  }
}

export function classifierFileName(classifierId: string): string {
  const safe = classifierId.trim() || 'user'
  return `${safe}.ndjson`
}

export function joinRelativePaths(...segments: string[]): string {
  return segments
    .map((s) => s.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/')
}
