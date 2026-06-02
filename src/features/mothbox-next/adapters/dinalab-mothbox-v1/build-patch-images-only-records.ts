import type { PatchRecord, PatchSourceRecord, ClassificationRecord } from '../../records'
import { flattenClassificationFiles, resolveCurrentClassifications } from '../../resolve-classifications'
import type { DinalabAdapterIO, DinalabAdapterProgressCallback } from './adapter-io'
import { imageMediaTypeFromPath } from './adapter-media-type'
import { formatProgressFraction } from './adapter-progress'
import { defaultLeafCameraDayId } from '~/features/mothbox-next/hierarchy-manifest'
import { FLAT_PATCH_IMAGES_LEAF_LABEL } from '~/features/mothbox-next/normalize-flat-patch-images-records'
import {
  toPackageRelativeAssetPath,
  type PackageSourceLayout,
} from '~/features/data-flow/1.ingest/resolve-package-source-layout'
import { isPatchImageFileName } from '~/features/data-flow/1.ingest/classify-dataset-folder'
import type { BuiltDinalabAdapterRecords } from './build-dinalab-adapter-records'
import { basenameRelative } from './adapter-path-utils'
import {
  packageSourceLocationLabel,
  patchIdFromImageFileName,
  resolvePatchAssetInPackage,
} from './adapter-patch-assets'

export async function buildPatchImagesOnlyRecords(params: {
  datasetId: string
  io: DinalabAdapterIO
  retainPatchesInSource: boolean
  packageRelativeSourcePrefix: string
  packageSourceLayout: PackageSourceLayout
  legacySourceRootName?: string
  onProgress?: DinalabAdapterProgressCallback
}): Promise<BuiltDinalabAdapterRecords> {
  const {
    datasetId,
    io,
    onProgress,
    retainPatchesInSource,
    packageRelativeSourcePrefix,
    packageSourceLayout,
  } = params
  const progressMessage = 'Converting patch images…'

  onProgress?.({
    phase: 'scan',
    message: progressMessage,
    description: 'Scanning folder for patch images…',
  })

  const imagePaths = await io.source.findFiles((name) => isPatchImageFileName(name))

  onProgress?.({
    phase: 'scan',
    message: progressMessage,
    description: `Found ${imagePaths.length.toLocaleString()} image${imagePaths.length === 1 ? '' : 's'}`,
  })

  const patches: PatchRecord[] = []
  const patchSources: PatchSourceRecord[] = []
  const cameraDayId = defaultLeafCameraDayId(datasetId)
  const usedPatchIds = new Set<string>()

  for (let imageIndex = 0; imageIndex < imagePaths.length; imageIndex++) {
    const patchRelativePath = imagePaths[imageIndex]
    const shouldReportProgress =
      imagePaths.length <= 40 || imageIndex === 0 || imageIndex === imagePaths.length - 1 || imageIndex % 10 === 0

    if (shouldReportProgress) {
      onProgress?.({
        phase: 'patches',
        message: progressMessage,
        description: `Indexing patch images ${formatProgressFraction({ current: imageIndex + 1, total: imagePaths.length })}`,
      })
    }

    const patchFileName = basenameRelative(patchRelativePath)
    const patchId = uniquePatchImageOnlyId({
      basePatchId: patchIdFromImageFileName(patchFileName),
      patchRelativePath,
      usedPatchIds,
    })

    const assetPath = await resolvePatchAssetInPackage({
      io,
      sourcePatchRelative: patchRelativePath,
      patchFileName,
      retainPatchesInSource,
      packageRelativeSourcePrefix,
    })

    patches.push({
      patch_id: patchId,
      dataset_id: datasetId,
      asset_path: assetPath,
      media_type: imageMediaTypeFromPath(patchFileName),
      camera_day_id: cameraDayId,
    })

    patchSources.push({
      patch_id: patchId,
      source_type: 'patch_image_only',
      source_photo_id: patchId,
      original_patch_path: toPackageRelativeAssetPath({
        sourcePrefix: packageRelativeSourcePrefix,
        pathRelativeToSource: patchRelativePath,
      }),
    })
  }

  if (!patches.length) {
    throw new Error('No patch images found. Add .jpg, .jpeg, or .png files to the folder.')
  }

  const locationLabel = packageSourceLocationLabel({ packageSourceLayout, packageRelativeSourcePrefix })

  onProgress?.({
    phase: 'patches',
    message: progressMessage,
    description: retainPatchesInSource
      ? `Indexed ${patches.length.toLocaleString()} patches under ${locationLabel} — preparing package records…`
      : `Copied ${patches.length.toLocaleString()} patches — preparing package records…`,
  })

  const deployments: BuiltDinalabAdapterRecords['deployments'] = []
  const cameraDays = [{ camera_day_id: cameraDayId, night_date: FLAT_PATCH_IMAGES_LEAF_LABEL }]
  const botRows: ClassificationRecord[] = []
  const humanRows: ClassificationRecord[] = []

  const resolvedClassifications = resolveCurrentClassifications({
    rows: flattenClassificationFiles({
      files: [{ path: '03_classifications/_bot.ndjson', rows: botRows }],
    }),
  })

  return {
    patches,
    patchSources,
    botRows,
    humanRows,
    resolvedClassifications,
    deployments,
    cameraDays,
  }
}

function uniquePatchImageOnlyId(params: {
  basePatchId: string
  patchRelativePath: string
  usedPatchIds: Set<string>
}) {
  const { basePatchId, patchRelativePath, usedPatchIds } = params
  if (!usedPatchIds.has(basePatchId)) {
    usedPatchIds.add(basePatchId)
    return basePatchId
  }

  const scopedBase = `${basePatchId}@${patchRelativePath
    .replaceAll('\\', '/')
    .replace(/\.(jpg|jpeg|png)$/i, '')
    .split('/')
    .filter(Boolean)
    .join('__')}`
  let candidate = scopedBase
  let index = 2

  while (usedPatchIds.has(candidate)) {
    candidate = `${scopedBase}__${index}`
    index += 1
  }

  usedPatchIds.add(candidate)
  return candidate
}
