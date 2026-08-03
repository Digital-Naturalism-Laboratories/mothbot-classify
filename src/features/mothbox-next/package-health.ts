import type { LoadedMothboxNextPackage } from './load-package-data'
import { patchAssetAbsolutePath } from './package-paths'

export type PackageHealthReport = {
  patchCount: number
  resolvedCount: number
  missingAssets: string[]
  orphanClassifications: string[]
  unresolvedPatches: string[]
}

export function auditMothboxNextPackageHealth(params: {
  loaded: LoadedMothboxNextPackage
  fileExists: (absolutePath: string) => Promise<boolean>
}): Promise<PackageHealthReport> {
  return auditPackageHealthAsync(params)
}

async function auditPackageHealthAsync(params: {
  loaded: LoadedMothboxNextPackage
  fileExists: (absolutePath: string) => Promise<boolean>
}): Promise<PackageHealthReport> {
  const { loaded, fileExists } = params
  const patchIds = new Set(loaded.patches.map((p) => p.patch_id))
  const resolvedIds = new Set(loaded.resolvedClassifications.map((r) => r.patch_id))

  const missingAssets: string[] = []
  for (const patch of loaded.patches) {
    const abs = patchAssetAbsolutePath({ packageRoot: loaded.packageRoot, assetPath: patch.asset_path })
    if (!(await fileExists(abs))) missingAssets.push(patch.asset_path)
  }

  const orphanClassifications: string[] = []
  for (const file of loaded.classificationFiles) {
    for (const row of file.rows) {
      if (row.patch_id && !patchIds.has(row.patch_id)) {
        orphanClassifications.push(`${file.path}:${row.patch_id}`)
      }
    }
  }

  const unresolvedPatches = loaded.patches
    .map((p) => p.patch_id)
    .filter((id) => !resolvedIds.has(id))

  return {
    patchCount: loaded.patches.length,
    resolvedCount: loaded.resolvedClassifications.length,
    missingAssets,
    orphanClassifications,
    unresolvedPatches,
  }
}
