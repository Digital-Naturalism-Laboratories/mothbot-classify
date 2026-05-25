import type { PatchRecord, PatchSourceRecord, ClassificationRecord } from '../../records'
import { classificationFromBotShape, classificationFromIdentifiedShape } from '../../bot-shape-to-classification'
import { flattenClassificationFiles, resolveCurrentClassifications } from '../../resolve-classifications'
import { extractPatchFilename } from '../../patch-path'
import { readLegacyDetectionShapes } from '../../legacy-detection-file'
import type { DinalabAdapterIO, DinalabAdapterProgressCallback } from './adapter-io'
import { formatProgressFraction } from './adapter-progress'
import {
  buildDeploymentAndCameraDayRecords,
  inferNightDateFromPatchId,
  resolveDeploymentContext,
} from './derive-dinalab-hierarchy'
import {
  toPackageRelativeAssetPath,
  type PackageSourceLayout,
} from '~/features/data-flow/1.ingest/resolve-package-source-layout'
import { dirnameRelative, joinRelative } from './adapter-path-utils'
import {
  packageSourceLocationLabel,
  disambiguatePatchId,
  patchIdFromImageFileName,
  photoBaseFromPatchFileName,
  resolvePatchAssetInPackage,
} from './adapter-patch-assets'

export type BuiltDinalabAdapterRecords = {
  patches: PatchRecord[]
  patchSources: PatchSourceRecord[]
  botRows: ClassificationRecord[]
  humanRows: ClassificationRecord[]
  resolvedClassifications: ClassificationRecord[]
  deployments: ReturnType<typeof buildDeploymentAndCameraDayRecords>['deployments']
  cameraDays: ReturnType<typeof buildDeploymentAndCameraDayRecords>['cameraDays']
}

export async function buildDinalabMothboxV1Records(params: {
  datasetId: string
  io: DinalabAdapterIO
  humanClassifierId?: string
  retainPatchesInSource: boolean
  packageRelativeSourcePrefix: string
  packageSourceLayout: PackageSourceLayout
  legacySourceRootName?: string
  onProgress?: DinalabAdapterProgressCallback
}): Promise<BuiltDinalabAdapterRecords> {
  const {
    datasetId,
    io,
    legacySourceRootName,
    onProgress,
    retainPatchesInSource,
    packageRelativeSourcePrefix,
    packageSourceLayout,
  } = params
  const humanClassifierId = params.humanClassifierId?.trim() || 'bf'
  const progressMessage = 'Converting legacy dataset…'

  const patches: PatchRecord[] = []
  const patchSources: PatchSourceRecord[] = []
  const botRows: ClassificationRecord[] = []
  const humanRows: ClassificationRecord[] = []
  const usedPatchIds = new Set<string>()

  onProgress?.({
    phase: 'scan',
    message: progressMessage,
    description: 'Scanning legacy folder for bot detection files…',
  })

  const botJsonPaths = await io.source.findFiles((name) => name.endsWith('_botdetection.json'))

  onProgress?.({
    phase: 'scan',
    message: progressMessage,
    description: `Found ${botJsonPaths.length.toLocaleString()} bot detection file${botJsonPaths.length === 1 ? '' : 's'}`,
  })

  for (let botFileIndex = 0; botFileIndex < botJsonPaths.length; botFileIndex++) {
    const botRelativePath = botJsonPaths[botFileIndex]
    const shouldReportPatchProgress =
      botJsonPaths.length <= 20 || botFileIndex === 0 || botFileIndex === botJsonPaths.length - 1 || botFileIndex % 5 === 0

    if (shouldReportPatchProgress) {
      onProgress?.({
        phase: 'patches',
        message: progressMessage,
        description: `Processing bot detections ${formatProgressFraction({ current: botFileIndex + 1, total: botJsonPaths.length })} · ${patches.length.toLocaleString()} patches`,
      })
    }

    const shapes = readLegacyDetectionShapes(await io.source.readText(botRelativePath))

    for (const shape of shapes) {
      const patchFileName = extractPatchFilename({ patchPath: String(shape.patch_path ?? '') })
      if (!patchFileName) continue

      const basePatchId = patchIdFromImageFileName(patchFileName)
      const botDir = dirnameRelative(botRelativePath)
      const sourcePatchRelative = joinRelative(botDir, 'patches', patchFileName)
      if (!(await io.source.exists(sourcePatchRelative))) continue

      const hierarchy = resolveDeploymentContext({ botRelativePath, datasetId, legacySourceRootName })
      const nightDate = hierarchy.nightDate ?? inferNightDateFromPatchId(basePatchId) ?? 'unknown-night'
      const cameraDayId = buildCameraDayIdFromParts({ deploymentId: hierarchy.deploymentId, nightDate })
      const patchId = disambiguatePatchId({ basePatchId, cameraDayId, usedPatchIds })

      const assetPath = await resolvePatchAssetInPackage({
        io,
        sourcePatchRelative,
        patchFileName,
        retainPatchesInSource,
        packageRelativeSourcePrefix,
      })

      const photoBase = photoBaseFromPatchFileName(patchFileName)

      patches.push({
        patch_id: patchId,
        dataset_id: datasetId,
        asset_path: assetPath,
        media_type: 'image/jpeg',
        deployment_id: hierarchy.deploymentId,
        camera_day_id: cameraDayId,
      })

      const botAssetPath = toPackageRelativeAssetPath({
        sourcePrefix: packageRelativeSourcePrefix,
        pathRelativeToSource: botRelativePath,
      })
      const photoAssetPath = botRelativePath.replace(/_botdetection\.json$/i, '.jpg')

      patchSources.push({
        patch_id: patchId,
        source_type: 'crop_from_photo',
        source_photo_id: photoBase,
        source_photo_asset_path: toPackageRelativeAssetPath({
          sourcePrefix: packageRelativeSourcePrefix,
          pathRelativeToSource: photoAssetPath,
        }),
        original_bot_detection_path: botAssetPath,
        original_patch_path: toPackageRelativeAssetPath({
          sourcePrefix: packageRelativeSourcePrefix,
          pathRelativeToSource: sourcePatchRelative,
        }),
      })

      const classifierId = extractClassifierIdFromPatch(patchId)
      botRows.push(
        classificationFromBotShape({
          shape,
          patchId,
          classifierId,
        }),
      )
    }

    const identifiedRelative = botRelativePath.replace('_botdetection.json', '_identified.json')
    if (await io.source.exists(identifiedRelative)) {
      const identifiedShapes = readLegacyDetectionShapes(await io.source.readText(identifiedRelative))
      for (const shape of identifiedShapes) {
        const patchFileName = extractPatchFilename({ patchPath: String(shape.patch_path ?? '') })
        if (!patchFileName) continue
        const patchId = patchIdFromImageFileName(patchFileName)
        const row = classificationFromIdentifiedShape({
          shape,
          patchId,
          classifierId: humanClassifierId,
        })
        if (row) humanRows.push(row)
      }
    }
  }

  if (!patches.length) {
    throw new Error('No patches found. Pick a folder with *_botdetection.json and patches/*.jpg under each night.')
  }

  const locationLabel = packageSourceLocationLabel({ packageSourceLayout, packageRelativeSourcePrefix })

  onProgress?.({
    phase: 'patches',
    message: progressMessage,
    description: retainPatchesInSource
      ? `Indexed ${patches.length.toLocaleString()} patches under ${locationLabel} — preparing package records…`
      : `Copied ${patches.length.toLocaleString()} patches — preparing package records…`,
  })

  const { deployments, cameraDays } = buildDeploymentAndCameraDayRecords({ datasetId, patches })
  const humanClassifierPath = `03_classifications/${humanClassifierId}.ndjson`

  const resolved = resolveCurrentClassifications({
    rows: flattenClassificationFiles({
      files: [
        { path: '03_classifications/_bot.ndjson', rows: botRows },
        ...(humanRows.length ? [{ path: humanClassifierPath, rows: humanRows }] : []),
      ],
    }),
  })

  return {
    patches,
    patchSources,
    botRows,
    humanRows,
    resolvedClassifications: resolved,
    deployments,
    cameraDays,
  }
}

function extractClassifierIdFromPatch(patchId: string): string {
  const match = patchId.match(/_Mothbot_([^/]+)$/i) ?? patchId.match(/_([^_]+\.pt)$/i)
  return match?.[1] ?? 'mothbot'
}

function buildCameraDayIdFromParts(params: { deploymentId: string; nightDate: string }) {
  return `${params.deploymentId}__${params.nightDate}`
}
