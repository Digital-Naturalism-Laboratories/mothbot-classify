import type { PatchRecord, PatchSourceRecord, ClassificationRecord } from '../../records'
import { classificationFromBotShape, classificationFromIdentifiedShape } from '../../bot-shape-to-classification'
import { flattenClassificationFiles, resolveCurrentClassifications } from '../../resolve-classifications'
import { extractPatchFilename } from '../../patch-path'
import { readLegacyDetectionShapes } from '../../legacy-detection-file'
import type { DinalabAdapterIO, DinalabAdapterProgressCallback } from './adapter-io'
import { imageMediaTypeFromPath } from './adapter-media-type'
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
  processedMirrorRoot?: string
  /**
   * Optional read-only IO rooted at the original (primary) source folder,
   * used only to locate full-size source photos when `io.source` is a
   * `_processed` mirror that doesn't include them (patches/JSON live in the
   * mirror, but full-size photos stay in the primary folder since they're
   * often too large to share). Never used for writes or for patch/JSON
   * lookups — those always come from `io.source`.
   */
  originalSourceExists?: (relativePath: string) => Promise<boolean>
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
    processedMirrorRoot,
    originalSourceExists,
  } = params
  const humanClassifierId = params.humanClassifierId?.trim() || 'bf'
  const progressMessage = 'Setting up dataset…'

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
    const patchIdByPatchFileName = new Map<string, string>()
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
      const sourcePatchRelative = await resolveSourcePatchRelative({
        io,
        botDir,
        patchFileName,
        shapePatchPath: String(shape.patch_path ?? ''),
      })
      if (!sourcePatchRelative) continue

      const hierarchy = resolveDeploymentContext({
        botRelativePath: stripProcessedMirrorSegment(botRelativePath, processedMirrorRoot),
        datasetId,
        legacySourceRootName,
      })
      const nightDate = hierarchy.nightDate ?? inferNightDateFromPatchId(basePatchId) ?? 'unknown-night'
      const cameraDayId = buildCameraDayIdFromParts({ deploymentId: hierarchy.deploymentId, nightDate })
      const patchId = disambiguatePatchId({ basePatchId, cameraDayId, usedPatchIds })
      patchIdByPatchFileName.set(patchFileName, patchId)

      const assetPath = await resolvePatchAssetInPackage({
        io,
        sourcePatchRelative,
        patchFileName,
        retainPatchesInSource,
        packageRelativeSourcePrefix,
      })

      const photoBase = photoBaseFromPatchFileName(patchFileName)
      const clusterId = clusterIdFromShape(shape)
      const clusteredAt = stringValue(shape.timestamp_cluster)
      const cropPoints = cropPointsFromShape(shape)
      const cropDirection = numberValue(shape.direction)
      const cropShapeType = stringValue(shape.shape_type)

      patches.push({
        patch_id: patchId,
        dataset_id: datasetId,
        asset_path: assetPath,
        media_type: imageMediaTypeFromPath(patchFileName),
        deployment_id: hierarchy.deploymentId,
        camera_day_id: cameraDayId,
        ...(clusterId !== undefined ? { cluster_id: clusterId } : {}),
        ...(clusteredAt ? { clustered_at: clusteredAt } : {}),
      })

      const botAssetPath = toPackageRelativeAssetPath({
        sourcePrefix: packageRelativeSourcePrefix,
        pathRelativeToSource: botRelativePath,
      })
      const photoAssetPath = await resolveSourcePhotoRelative({
        io,
        botRelativePath,
        processedMirrorRoot,
        originalSourceExists,
      })

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
        ...(cropPoints ? { crop_points: cropPoints } : {}),
        ...(cropDirection !== undefined ? { crop_direction: cropDirection } : {}),
        ...(cropShapeType ? { crop_shape_type: cropShapeType } : {}),
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
        const patchId = patchIdByPatchFileName.get(patchFileName)
        if (!patchId) continue
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

async function resolveSourcePatchRelative(params: {
  io: DinalabAdapterIO
  botDir: string
  patchFileName: string
  shapePatchPath: string
}): Promise<string | null> {
  const { io, botDir, patchFileName } = params
  const shapePatchPath = params.shapePatchPath.replaceAll('\\', '/').replace(/^\/+/, '').trim()
  const candidates = uniqueStrings([
    shapePatchPath ? joinRelative(botDir, shapePatchPath) : '',
    shapePatchPath,
    joinRelative(botDir, 'patches', patchFileName),
    joinRelative(botDir, patchFileName),
  ])

  for (const candidate of candidates) {
    if (candidate && (await io.source.exists(candidate))) return candidate
  }

  return null
}

async function resolveSourcePhotoRelative(params: {
  io: DinalabAdapterIO
  botRelativePath: string
  processedMirrorRoot?: string
  originalSourceExists?: (relativePath: string) => Promise<boolean>
}) {
  const { io, botRelativePath, processedMirrorRoot, originalSourceExists } = params
  const photoBase = stripProcessedMirrorSegment(
    botRelativePath.replace(/_botdetection\.json$/i, ''),
    processedMirrorRoot,
  )
  const candidates = uniqueStrings([
    `${photoBase}.jpg`,
    `${photoBase}.jpeg`,
    `${photoBase}.png`,
    `${photoBase}.JPG`,
    `${photoBase}.JPEG`,
    `${photoBase}.PNG`,
  ])

  for (const candidate of candidates) {
    if (await io.source.exists(candidate)) return candidate
  }

  // Full-size source photos sometimes live outside the mirror (e.g.
  // _processed/<night> holds JSON + patches, but the original photo stays
  // in the sibling source folder since it's often too large to share).
  if (originalSourceExists) {
    for (const candidate of candidates) {
      if (await originalSourceExists(candidate)) return candidate
    }
  }

  return `${photoBase}.jpg`
}

export function stripProcessedMirrorSegment(relativePath: string, processedMirrorRoot = '') {
  const mirrorRoot = processedMirrorRoot.trim().toLowerCase()
  if (!mirrorRoot) return relativePath

  const parts = relativePath.replaceAll('\\', '/').split('/').filter(Boolean)
  const index = parts.findIndex((part) => part.toLowerCase() === mirrorRoot)
  if (index < 0) return relativePath
  return [...parts.slice(0, index), ...parts.slice(index + 1)].join('/')
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}

function extractClassifierIdFromPatch(patchId: string): string {
  const basePatchId = patchId.split('@')[0] ?? patchId
  const match = basePatchId.match(/_Mothbot_([^/]+)$/i) ?? basePatchId.match(/_([^_]+\.pt)$/i)
  return match?.[1] ?? 'mothbot'
}

function buildCameraDayIdFromParts(params: { deploymentId: string; nightDate: string }) {
  return `${params.deploymentId}__${params.nightDate}`
}

function clusterIdFromShape(shape: Record<string, unknown>) {
  const value = shape.clusterID
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function cropPointsFromShape(shape: Record<string, unknown>) {
  const points = shape.points
  if (!Array.isArray(points) || points.length < 2) return undefined

  const parsed: number[][] = []
  for (const point of points) {
    if (!Array.isArray(point) || point.length < 2) return undefined
    const x = numberValue(point[0])
    const y = numberValue(point[1])
    if (x === undefined || y === undefined) return undefined
    parsed.push([x, y])
  }

  return parsed
}

function numberValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}
