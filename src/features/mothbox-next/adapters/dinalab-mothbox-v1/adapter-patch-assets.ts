import type { DinalabAdapterIO } from './adapter-io'
import {
  toPackageRelativeAssetPath,
  type PackageSourceLayout,
} from '~/features/data-flow/1.ingest/resolve-package-source-layout'
import { PACKAGE_ARCHIVE_DIR } from '~/features/data-flow/1.ingest/reserved-paths'

export function patchIdFromImageFileName(fileName: string) {
  const withoutImageExt = fileName.replace(/\.(jpg|jpeg|png)$/i, '')
  if (/\.pt$/i.test(withoutImageExt)) return withoutImageExt
  return `${withoutImageExt}.pt`
}

export function disambiguatePatchId(params: {
  basePatchId: string
  cameraDayId: string
  usedPatchIds: Set<string>
}) {
  const { basePatchId, cameraDayId, usedPatchIds } = params

  if (!usedPatchIds.has(basePatchId)) {
    usedPatchIds.add(basePatchId)
    return basePatchId
  }

  const scopedPatchId = `${basePatchId}@${cameraDayId}`
  usedPatchIds.add(scopedPatchId)
  return scopedPatchId
}

export function photoBaseFromPatchFileName(fileName: string) {
  return fileName.replace(/_\d+_Mothbot.*$/i, '').replace(/\.(jpg|jpeg|png)$/i, '')
}

export function packageSourceLocationLabel(params: {
  packageSourceLayout: PackageSourceLayout
  packageRelativeSourcePrefix: string
}) {
  const { packageSourceLayout, packageRelativeSourcePrefix } = params

  if (packageSourceLayout === 'archive') return `${PACKAGE_ARCHIVE_DIR}/`
  if (packageRelativeSourcePrefix) return `${packageRelativeSourcePrefix}/`
  return 'dataset folder'
}

export async function resolvePatchAssetInPackage(params: {
  io: DinalabAdapterIO
  sourcePatchRelative: string
  patchFileName: string
  retainPatchesInSource: boolean
  packageRelativeSourcePrefix: string
}): Promise<string> {
  const { io, sourcePatchRelative, patchFileName, retainPatchesInSource, packageRelativeSourcePrefix } = params

  const assetPath = retainPatchesInSource
    ? toPackageRelativeAssetPath({
        sourcePrefix: packageRelativeSourcePrefix,
        pathRelativeToSource: sourcePatchRelative,
      })
    : `01_patches/${patchFileName}`

  if (!retainPatchesInSource) {
    await io.package.copyFromSource({
      sourceRelativePath: sourcePatchRelative,
      packageRelativePath: assetPath,
    })
  }

  return assetPath
}
