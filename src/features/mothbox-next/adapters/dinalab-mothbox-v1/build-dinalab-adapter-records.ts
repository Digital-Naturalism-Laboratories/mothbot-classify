import type { PatchRecord, PatchSourceRecord, ClassificationRecord, DeploymentRecord } from '../../records'
import { defaultNightlySession, findSessionForTime, parseSessionsFile, SESSIONS_FILE_NAME, type SessionRecord } from '../../sessions'
import { parseTimestampFromText } from '~/models/detection-time'
import { cornersRelFromPx, parseLabelledBox } from '~/models/box-formats'
import { classificationFromBotShape, classificationFromIdentifiedShape, NO_MACHINE_ID_CLASSIFIER } from '../../bot-shape-to-classification'
import { flattenClassificationFiles, resolveCurrentClassifications } from '../../resolve-classifications'
import { extractPatchFilename } from '../../patch-path'
import { readLegacyDetectionShapes, type LegacyDetectionShape } from '../../legacy-detection-file'
import { classifierIdFromIdentifierHuman, groupHumanRowsByClassifierFile } from '../../human-classifier-files'
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
import { measurementFromShape, type PatchMeasurementRecord } from '../../patch-measurements'
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
  /** Per-patch measurements from Process (blurriness), for patch-measurements.ndjson. */
  measurements: PatchMeasurementRecord[]
  botRows: ClassificationRecord[]
  humanRows: ClassificationRecord[]
  resolvedClassifications: ClassificationRecord[]
  deployments: ReturnType<typeof buildDeploymentAndCameraDayRecords>['deployments']
  cameraDays: ReturnType<typeof buildDeploymentAndCameraDayRecords>['cameraDays']
  /** Every session a patch was given, for `02_records/sessions.ndjson`. */
  sessions: SessionRecord[]
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
  const measurements: PatchMeasurementRecord[] = []
  const botRows: ClassificationRecord[] = []
  const humanRows: ClassificationRecord[] = []
  const usedPatchIds = new Set<string>()

  onProgress?.({
    phase: 'scan',
    message: progressMessage,
    description: 'Scanning legacy folder for bot detection files…',
  })

  const botJsonPaths = await io.source.findFiles((name) => name.endsWith('_botdetection.json'))
  const humanJsonPaths = await io.source.findFiles((name) => name.endsWith('_humandetection.json'))
  const allDetectionPaths = [...botJsonPaths, ...humanJsonPaths]

  onProgress?.({
    phase: 'scan',
    message: progressMessage,
    description: `Found ${botJsonPaths.length.toLocaleString()} bot + ${humanJsonPaths.length.toLocaleString()} human detection file${allDetectionPaths.length === 1 ? '' : 's'}`,
  })

  const sessionsByDeploymentDir = new Map<string, SessionRecord[]>()
  const sessionsUsed = new Map<string, SessionRecord>()
  const deploymentMetadata = new Map<string, Partial<DeploymentRecord>>()

  for (let botFileIndex = 0; botFileIndex < allDetectionPaths.length; botFileIndex++) {
    const botRelativePath = allDetectionPaths[botFileIndex]
    const patchIdByPatchFileName = new Map<string, string>()
    const shouldReportPatchProgress =
      allDetectionPaths.length <= 20 || botFileIndex === 0 || botFileIndex === allDetectionPaths.length - 1 || botFileIndex % 5 === 0

    if (shouldReportPatchProgress) {
      onProgress?.({
        phase: 'patches',
        message: progressMessage,
        description: `Processing detections ${formatProgressFraction({ current: botFileIndex + 1, total: allDetectionPaths.length })} · ${patches.length.toLocaleString()} patches`,
      })
    }

    const jsonText = await io.source.readText(botRelativePath)
    // Read the top-level `version` field as the detector identity (e.g. "Mothbot_yolo11m_..." or "HumanDetection"),
    // and the image size the shapes' pixel corners refer to.
    let detectorId: string | undefined
    let imageWidth: number | undefined
    let imageHeight: number | undefined
    let fileDeploymentMetadata: Partial<DeploymentRecord> | undefined
    try {
      const parsed = JSON.parse(jsonText) as { version?: unknown; imageWidth?: unknown; imageHeight?: unknown }
      detectorId = typeof parsed.version === 'string' && parsed.version.trim() ? parsed.version.trim() : undefined
      imageWidth = numberValue(parsed.imageWidth)
      imageHeight = numberValue(parsed.imageHeight)
      fileDeploymentMetadata = deploymentMetadataFromDetectionJson(parsed as Record<string, unknown>)
    } catch { /* readLegacyDetectionShapes will surface the error */ }
    const fileSessions = await readDeploymentSessions({ io, botRelativePath, cache: sessionsByDeploymentDir })

    const shapes = readLegacyDetectionShapes(jsonText)

    // Pre-scan: find the identifier_bot used across this file so shapes that
    // are individually missing the field still get the correct classifier_id.
    const fileIdentifierBot = findFileIdentifierBot(shapes)

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
      if (fileDeploymentMetadata && !deploymentMetadata.has(hierarchy.deploymentId)) {
        deploymentMetadata.set(hierarchy.deploymentId, fileDeploymentMetadata)
      }
      const placed = placeInSession({
        sessions: fileSessions,
        capturedAt: parseTimestampFromText(patchFileName),
        deploymentID: hierarchy.deploymentId,
        nightDate,
        cameraDayId,
        sessionsUsed,
      })

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
      // Process labels its own boxes; for older files and hand labels, work it out.
      const cropBox = parseLabelledBox(shape.box) ?? cornersRelFromPx({ points: cropPoints, imageWidth, imageHeight })
      const cropDirection = numberValue(shape.direction)
      const cropShapeType = stringValue(shape.shape_type)

      patches.push({
        patch_id: patchId,
        // One occurrence per detection until tracking merges them (ontology: Occurrence).
        occurrence_id: patchId,
        dataset_id: datasetId,
        asset_path: assetPath,
        media_type: imageMediaTypeFromPath(patchFileName),
        deployment_id: hierarchy.deploymentId,
        camera_day_id: cameraDayId,
        ...(clusterId !== undefined ? { cluster_id: clusterId } : {}),
        ...(clusteredAt ? { clustered_at: clusteredAt } : {}),
        ...(detectorId ? { detector_id: detectorId } : {}),
        ...(placed.sessionId ? { session_id: placed.sessionId } : {}),
        ...(placed.captureWindowId ? { capture_window_id: placed.captureWindowId } : {}),
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

      const measurement = measurementFromShape({ patchId, shape })
      if (measurement) measurements.push(measurement)

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
        ...(cropBox ? { crop_box: cropBox } : {}),
      })

      const identifierBot = typeof shape.identifier_bot === 'string' ? shape.identifier_bot.trim() : ''
      const classifierId = identifierBot || fileIdentifierBot || NO_MACHINE_ID_CLASSIFIER
      botRows.push(
        classificationFromBotShape({
          shape,
          patchId,
          classifierId,
        }),
      )
    }

    // Only bot detection files have a paired _identified.json (human identifications)
    const identifiedRelative = botRelativePath.endsWith('_botdetection.json')
      ? botRelativePath.replace('_botdetection.json', '_identified.json')
      : null
    if (identifiedRelative && await io.source.exists(identifiedRelative)) {
      const identifiedShapes = readLegacyDetectionShapes(await io.source.readText(identifiedRelative))
      for (const shape of identifiedShapes) {
        const patchFileName = extractPatchFilename({ patchPath: String(shape.patch_path ?? '') })
        if (!patchFileName) continue
        const patchId = patchIdByPatchFileName.get(patchFileName)
        if (!patchId) continue
        const identifiedAt = Number((shape as { timestamp_ID_human?: unknown }).timestamp_ID_human)
        const row = classificationFromIdentifiedShape({
          shape,
          patchId,
          // Credit the person who made the ID; fall back to whoever runs setup.
          classifierId: classifierIdFromIdentifierHuman(shape.identifier_human) ?? humanClassifierId,
          // Keep when the ID was actually made, not when the dataset was set up.
          classifiedAt: Number.isFinite(identifiedAt) && identifiedAt > 0 ? identifiedAt : undefined,
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

  const built = buildDeploymentAndCameraDayRecords({ datasetId, patches })
  const cameraDays = built.cameraDays
  // Device, site and location details from the detection files (ontology: Deployment).
  const deployments = built.deployments.map((deployment) => ({
    ...deployment,
    ...(deploymentMetadata.get(deployment.deployment_id) ?? {}),
  }))
  const resolved = resolveCurrentClassifications({
    rows: flattenClassificationFiles({
      files: [
        { path: '03_classifications/_bot.ndjson', rows: botRows },
        ...groupHumanRowsByClassifierFile({ rows: humanRows, fallbackClassifierId: humanClassifierId }),
      ],
    }),
  })

  return {
    patches,
    patchSources,
    measurements,
    botRows,
    humanRows,
    resolvedClassifications: resolved,
    deployments,
    cameraDays,
    sessions: [...sessionsUsed.values()],
  }
}

/** Reads `sessions.json` from the deployment folder above a night's detection file, once per folder. */
async function readDeploymentSessions(params: {
  io: DinalabAdapterIO
  botRelativePath: string
  cache: Map<string, SessionRecord[]>
}): Promise<SessionRecord[]> {
  const deploymentDir = dirnameRelative(dirnameRelative(params.botRelativePath))
  const cached = params.cache.get(deploymentDir)
  if (cached) return cached
  const path = deploymentDir ? joinRelative(deploymentDir, SESSIONS_FILE_NAME) : SESSIONS_FILE_NAME
  let sessions: SessionRecord[] = []
  try {
    if (await params.io.source.exists(path)) sessions = parseSessionsFile(await params.io.source.readText(path))
  } catch {
    sessions = []
  }
  params.cache.set(deploymentDir, sessions)
  return sessions
}

/**
 * The session and capture window for one patch: from the deployment's sessions file by
 * capture time, else the default nightly session named like the night.
 */
function placeInSession(params: {
  sessions: SessionRecord[]
  capturedAt: number | null
  deploymentID: string
  nightDate: string
  cameraDayId: string
  sessionsUsed: Map<string, SessionRecord>
}): { sessionId?: string; captureWindowId?: string } {
  const { sessions, capturedAt, deploymentID, nightDate, cameraDayId, sessionsUsed } = params
  const match = capturedAt != null ? findSessionForTime(sessions, capturedAt) : null
  if (match) {
    if (!sessionsUsed.has(match.session.sessionID)) {
      sessionsUsed.set(match.session.sessionID, { ...match.session, deploymentID })
    }
    return { sessionId: match.session.sessionID, captureWindowId: match.window?.captureWindowID }
  }
  const fallback = defaultNightlySession({ deploymentID, nightDate, sessionID: cameraDayId })
  if (!fallback) return {}
  if (!sessionsUsed.has(fallback.sessionID)) sessionsUsed.set(fallback.sessionID, fallback)
  return { sessionId: fallback.sessionID }
}

/** Device, site and location details a detection file carries (from Process's field-sheet step). */
function deploymentMetadataFromDetectionJson(parsed: Record<string, unknown>): Partial<DeploymentRecord> | undefined {
  const text = (...keys: string[]) => {
    for (const key of keys) {
      const value = parsed[key]
      if (typeof value === 'string' && value.trim()) return value.trim()
      if (typeof value === 'number' && Number.isFinite(value)) return String(value)
    }
    return undefined
  }
  const coordinate = (key: string) => {
    const value = Number(parsed[key])
    return Number.isFinite(value) && value !== 0 ? value : undefined
  }
  const height = Number(parsed.ground_height)
  const out: Partial<DeploymentRecord> = {
    device_type: text('deviceType'),
    device_type_id: text('deviceTypeID'),
    firmware_version: text('firmwareVersion', 'firmware'),
    site_name: text('siteName', 'site'),
    site_description: text('siteDescription'),
    land_use_type: text('landUseType'),
    facing_direction: text('facingDirection'),
    latitude: coordinate('latitude'),
    longitude: coordinate('longitude'),
    ...(Number.isFinite(height) && height >= 0 && parsed.ground_height !== null ? { height_above_ground_m: height } : {}),
    ...(Array.isArray(parsed.attractors) && parsed.attractors.length ? { attractors: parsed.attractors as DeploymentRecord['attractors'] } : {}),
    ...(parsed.target && typeof parsed.target === 'object' ? { target: parsed.target as Record<string, unknown> } : {}),
    ...(parsed.sensor && typeof parsed.sensor === 'object' ? { sensor: parsed.sensor as Record<string, unknown> } : {}),
  }
  const device = text('deviceID', 'device')
  if (device) out.device_name = device
  const defined = Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined)) as Partial<DeploymentRecord>
  return Object.keys(defined).length ? defined : undefined
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

// Finds the most common non-empty identifier_bot value across all shapes in a file.
// Used as a fallback so shapes that individually lack the field still get the right classifier_id.
function findFileIdentifierBot(shapes: LegacyDetectionShape[]): string | null {
  const counts = new Map<string, number>()
  for (const shape of shapes) {
    const bot = typeof shape.identifier_bot === 'string' ? shape.identifier_bot.trim() : ''
    if (bot) counts.set(bot, (counts.get(bot) ?? 0) + 1)
  }
  if (counts.size === 0) return null
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0]
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
