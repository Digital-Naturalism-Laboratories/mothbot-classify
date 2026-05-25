import type { CameraDayRecord, DeploymentRecord, PatchRecord, PatchSourceRecord } from '../../records'
import { DEFAULT_SITE_SEGMENT, isIsoDateOnly } from '../../hierarchy-display-labels'
import {
  normalizeIngestRelativePath,
  PACKAGE_ARCHIVE_DIR,
  stripPackageArchivePrefix,
} from '~/features/data-flow/1.ingest/reserved-paths'
import { patchIdFromImageFileName } from './adapter-patch-assets'

export type ParsedDinalabDeploymentFolder = {
  deploymentId: string
  datasetName?: string
  siteName?: string
  deviceId?: string
  deploymentDate?: string
}

export function parseDinalabDeploymentFolderName(folderName: string): ParsedDinalabDeploymentFolder {
  const trimmed = folderName.trim()
  const dateMatch = trimmed.match(/_(\d{4}-\d{2}-\d{2})$/)
  if (!dateMatch) {
    if (isIsoDateOnly(trimmed)) {
      return { deploymentId: trimmed, deploymentDate: trimmed }
    }
    return { deploymentId: trimmed, siteName: trimmed }
  }

  const deploymentDate = dateMatch[1]
  const withoutDate = trimmed.slice(0, -dateMatch[0].length)
  const parts = withoutDate.split('_').filter(Boolean)
  if (parts.length < 2) {
    return { deploymentId: trimmed, deploymentDate }
  }

  const datasetName = parts[0]

  // Dataset_Site_YYYY-MM-DD (no device segment)
  if (parts.length === 2) {
    return {
      deploymentId: trimmed,
      datasetName,
      siteName: parts[1],
      deploymentDate,
    }
  }

  // Dataset_Site_…_Device_YYYY-MM-DD — last segment before the date is always the device
  const deviceId = parts[parts.length - 1]
  const siteName = parts.slice(1, -1).join('_')

  return {
    deploymentId: trimmed,
    datasetName,
    siteName,
    deviceId,
    deploymentDate,
  }
}

export function siteIdForDeployment(params: { datasetId: string; siteName: string }) {
  const { datasetId, siteName } = params
  return `${datasetId}/site/${siteName}`
}

export function buildCameraDayId(params: { deploymentId: string; nightDate: string }) {
  const { deploymentId, nightDate } = params
  return `${deploymentId}__${nightDate}`
}

export function inferNightDateFromPatchId(patchId: string): string | undefined {
  const match = patchId.match(/_(\d{4})_(\d{2})_(\d{2})__/)
  if (!match) return undefined
  return `${match[1]}-${match[2]}-${match[3]}`
}

export function inferNightDateFromBotJsonPath(botRelativePath: string): string | undefined {
  const segments = botRelativePath.replaceAll('\\', '/').split('/').filter(Boolean)
  const nightFolder = segments.length >= 2 ? segments[segments.length - 2] : undefined
  if (!nightFolder) return undefined

  const folderDate = nightFolder.match(/(\d{4}-\d{2}-\d{2})$/)?.[1]
  if (folderDate) return folderDate

  return inferNightDateFromPatchId(nightFolder)
}

export function resolveDeploymentContextFromPatchPath(params: {
  patchRelativePath: string
  datasetId: string
  legacySourceRootName?: string
}): {
  deploymentId: string
  siteId: string
  siteName: string
  nightDate: string
  cameraDayId: string
} {
  const { patchRelativePath, datasetId, legacySourceRootName } = params
  const normalized = patchRelativePath.replaceAll('\\', '/')
  const parts = normalized.split('/').filter(Boolean)
  const fileName = parts[parts.length - 1] ?? ''
  const dirParts = parts.slice(0, -1)

  const patchesIndex = dirParts.findIndex((segment) => segment.toLowerCase() === 'patches')
  let pathSegmentsBeforeNight: string[]
  let nightSegment: string | undefined

  if (patchesIndex >= 0) {
    pathSegmentsBeforeNight = dirParts.slice(0, patchesIndex)
    if (patchesIndex > 0) nightSegment = dirParts[patchesIndex - 1]
  } else if (dirParts.length > 0 && isIsoDateOnly(dirParts[dirParts.length - 1])) {
    nightSegment = dirParts[dirParts.length - 1]
    pathSegmentsBeforeNight = dirParts.slice(0, -1)
  } else {
    pathSegmentsBeforeNight = dirParts
  }

  const deploymentFolder = resolveDeploymentFolderFromBotPath({
    botDirSegments: pathSegmentsBeforeNight,
    legacySourceRootName,
    datasetId,
  })
  const parsed = parseDinalabDeploymentFolderName(deploymentFolder)
  const deploymentId = parsed.deploymentId
  const siteName = parsed.siteName ?? (isIsoDateOnly(deploymentFolder) ? DEFAULT_SITE_SEGMENT : deploymentFolder)
  const siteId = siteIdForDeployment({ datasetId, siteName })

  const patchIdStem = patchIdFromImageFileName(fileName)
  const nightDate =
    (nightSegment && isIsoDateOnly(nightSegment) ? nightSegment : undefined) ??
    inferNightDateFromPatchId(patchIdStem) ??
    parsed.deploymentDate ??
    'unknown-night'

  const cameraDayId = buildCameraDayId({ deploymentId, nightDate })

  return { deploymentId, siteId, siteName, nightDate, cameraDayId }
}

export function resolveDeploymentContext(params: {
  botRelativePath: string
  datasetId: string
  /** Folder name when the user picked a single deployment directory (bot JSON at its root). */
  legacySourceRootName?: string
}): {
  deploymentId: string
  siteId: string
  siteName: string
  nightDate: string
  cameraDayId: string
} {
  const { botRelativePath, datasetId, legacySourceRootName } = params
  const botDir = dirnameRelative(botRelativePath)
  const segments = botDir.replaceAll('\\', '/').split('/').filter(Boolean)
  const legacyRoot = legacySourceRootName?.trim()

  const deploymentFolder = resolveDeploymentFolderFromBotPath({
    botDirSegments: segments,
    legacySourceRootName: legacyRoot,
    datasetId,
  })
  const parsed = parseDinalabDeploymentFolderName(deploymentFolder)
  const deploymentId = parsed.deploymentId
  const siteName = parsed.siteName ?? (isIsoDateOnly(deploymentFolder) ? DEFAULT_SITE_SEGMENT : deploymentFolder)
  const siteId = siteIdForDeployment({ datasetId, siteName })

  const nightDate = resolveNightDateFromBotPath({
    botRelativePath,
    botDirSegments: segments,
    legacySourceRootName: legacyRoot,
    parsedDeploymentDate: parsed.deploymentDate,
  })

  const cameraDayId = buildCameraDayId({ deploymentId, nightDate })

  return { deploymentId, siteId, siteName, nightDate, cameraDayId }
}

export function resolveLegacySourceRootForPackage(params: {
  explicitLegacySourceRootName?: string
  patchSources?: Array<{ original_bot_detection_path?: string }>
  indexedPaths?: string[]
}): string | undefined {
  const explicit = params.explicitLegacySourceRootName?.trim()
  if (explicit) return explicit

  const fromPatchSources = inferLegacySourceRootNameFromPatchSources(params.patchSources ?? [])
  if (fromPatchSources) return fromPatchSources

  return inferLegacySourceRootFromIndexedPaths(params.indexedPaths ?? [])
}

export function enrichPatchesFromPatchSources(params: {
  patches: PatchRecord[]
  patchSources: PatchSourceRecord[]
  datasetId: string
  legacySourceRootName?: string
  indexedPaths?: string[]
}): PatchRecord[] {
  const { patches, patchSources, datasetId } = params
  const legacySourceRootName = resolveLegacySourceRootForPackage({
    explicitLegacySourceRootName: params.legacySourceRootName,
    patchSources,
    indexedPaths: params.indexedPaths,
  })

  if (!patchSources.length) return patches
  if (packageNeedsWrappedDeploymentHierarchyRepair(patches) && !legacySourceRootName) {
    console.warn('🚨 enrichPatches: wrapped deployment layout detected but legacy source root is unknown', {
      deploymentIds: [...new Set(patches.map((patch) => patch.deployment_id))],
    })
    return patches
  }

  const sourceByPatchId = new Map(patchSources.filter((row) => row.patch_id).map((row) => [row.patch_id, row]))

  return patches.map((patch) => {
    const source = sourceByPatchId.get(patch.patch_id)
    const botPath = source?.original_bot_detection_path?.trim()
    if (!botPath) return patch

    const hierarchy = resolveDeploymentContext({
      botRelativePath: botPathRelativeToLegacyRoot({ botPath, legacySourceRootName }),
      datasetId,
      legacySourceRootName,
    })

    return {
      ...patch,
      deployment_id: hierarchy.deploymentId,
      camera_day_id: hierarchy.cameraDayId,
    }
  })
}

export function inferLegacySourceRootFromIndexedPaths(paths: string[]): string | undefined {
  const normalized = paths.map((path) => normalizeIngestRelativePath(path)).filter(Boolean)
  const topLevelDirs = new Set<string>()

  for (const path of normalized) {
    const parts = path.split('/').filter(Boolean)
    const firstSegment = parts[0]
    if (!firstSegment) continue

    const rootCandidate =
      firstSegment.toLowerCase() === PACKAGE_ARCHIVE_DIR.toLowerCase() ? parts[1] : firstSegment
    if (rootCandidate && !isIsoDateOnly(rootCandidate)) topLevelDirs.add(rootCandidate)
  }

  const candidates = [...topLevelDirs].filter((segment) => !isIsoDateOnly(segment))
  const withDateNightFolders = candidates.filter((root) =>
    normalized.some((path) => {
      const parts = path.split('/').filter(Boolean)
      const deployIndex =
        parts[0]?.toLowerCase() === PACKAGE_ARCHIVE_DIR.toLowerCase() ? 1 : 0
      const nightIndex = deployIndex + 1
      return (
        parts[deployIndex] === root &&
        parts.length > nightIndex &&
        isIsoDateOnly(parts[nightIndex] ?? '')
      )
    }),
  )

  if (withDateNightFolders.length !== 1) return undefined
  return withDateNightFolders[0]
}

export function packageNeedsWrappedDeploymentHierarchyRepair(patches: PatchRecord[]): boolean {
  const deploymentIds = [...new Set(patches.map((patch) => patch.deployment_id).filter(Boolean))]
  if (deploymentIds.length < 2) return false
  return deploymentIds.every((deploymentId) => isIsoDateOnly(deploymentId ?? ''))
}

export function inferLegacySourceRootNameFromPatchSources(
  patchSources: Array<{ original_bot_detection_path?: string }>,
): string | undefined {
  const deploymentRoots = new Set<string>()

  for (const source of patchSources) {
    const path = source.original_bot_detection_path?.replaceAll('\\', '/').replace(/^\/+/, '')
    if (!path) continue

    const segments = path.split('/').filter(Boolean)
    const firstSegment = segments[0]
    if (!firstSegment || isIsoDateOnly(firstSegment)) continue

    const deploymentSegment =
      firstSegment.toLowerCase() === PACKAGE_ARCHIVE_DIR.toLowerCase() ? segments[1] : firstSegment
    if (!deploymentSegment || isIsoDateOnly(deploymentSegment)) continue
    deploymentRoots.add(deploymentSegment)
  }

  if (deploymentRoots.size !== 1) return undefined
  return [...deploymentRoots][0]
}

function resolveDeploymentFolderFromBotPath(params: {
  botDirSegments: string[]
  legacySourceRootName?: string
  datasetId: string
}): string {
  const { botDirSegments, legacySourceRootName, datasetId } = params

  if (botDirSegments.length === 0) {
    return legacySourceRootName || datasetId
  }

  const firstSegment = botDirSegments[0]
  if (legacySourceRootName && isIsoDateOnly(firstSegment)) {
    return legacySourceRootName
  }

  return firstSegment || legacySourceRootName || datasetId
}

function resolveNightDateFromBotPath(params: {
  botRelativePath: string
  botDirSegments: string[]
  legacySourceRootName?: string
  parsedDeploymentDate?: string
}): string {
  const { botRelativePath, botDirSegments, legacySourceRootName, parsedDeploymentDate } = params

  if (legacySourceRootName && botDirSegments.length >= 1 && isIsoDateOnly(botDirSegments[0])) {
    return botDirSegments[0]
  }

  const fromPath = inferNightDateFromBotJsonPath(botRelativePath)
  if (fromPath) return fromPath

  return parsedDeploymentDate ?? 'unknown-night'
}

function botPathRelativeToLegacyRoot(params: { botPath: string; legacySourceRootName?: string }) {
  const { botPath, legacySourceRootName } = params
  const normalized = stripPackageArchivePrefix(botPath)

  const legacyRoot = legacySourceRootName?.trim()
  if (!legacyRoot) return normalized

  const prefix = `${legacyRoot}/`
  if (normalized.startsWith(prefix)) return normalized.slice(prefix.length)
  return normalized
}

export function buildDeploymentAndCameraDayRecords(params: {
  datasetId: string
  patches: PatchRecord[]
}): { deployments: DeploymentRecord[]; cameraDays: CameraDayRecord[] } {
  const { datasetId, patches } = params
  const deploymentsById = new Map<string, DeploymentRecord>()
  const cameraDaysById = new Map<string, CameraDayRecord>()

  for (const patch of patches) {
    const deploymentId = patch.deployment_id
    const cameraDayId = patch.camera_day_id
    if (!deploymentId || !cameraDayId) continue

    if (!deploymentsById.has(deploymentId)) {
      const parsed = parseDinalabDeploymentFolderName(deploymentId)
      const siteName = parsed.siteName ?? (isIsoDateOnly(deploymentId) ? DEFAULT_SITE_SEGMENT : deploymentId)
      deploymentsById.set(deploymentId, {
        deployment_id: deploymentId,
        site_id: siteIdForDeployment({ datasetId, siteName }),
        device_id: parsed.deviceId,
        site_name_from_folder: parsed.siteName,
        device_id_from_folder: parsed.deviceId,
        deployment_start_from_folder: parsed.deploymentDate,
        dataset_name_from_folder: parsed.datasetName,
      })
    }

    if (!cameraDaysById.has(cameraDayId)) {
      const nightDate = cameraDayId.split('__').pop() ?? undefined
      cameraDaysById.set(cameraDayId, {
        camera_day_id: cameraDayId,
        deployment_id: deploymentId,
        device_id: deploymentsById.get(deploymentId)?.device_id,
        night_date: nightDate,
      })
    }
  }

  return {
    deployments: [...deploymentsById.values()].sort((a, b) => a.deployment_id.localeCompare(b.deployment_id)),
    cameraDays: [...cameraDaysById.values()].sort((a, b) => a.camera_day_id.localeCompare(b.camera_day_id)),
  }
}

function dirnameRelative(filePath: string): string {
  const normalized = filePath.replaceAll('\\', '/')
  const parts = normalized.split('/').filter(Boolean)
  if (parts.length <= 1) return ''
  return parts.slice(0, -1).join('/')
}
