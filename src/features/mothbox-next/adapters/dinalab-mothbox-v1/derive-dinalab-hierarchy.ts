import type { CameraDayRecord, DeploymentRecord, PatchRecord } from '../../records'

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
    return { deploymentId: trimmed, siteName: trimmed }
  }

  const deploymentDate = dateMatch[1]
  const withoutDate = trimmed.slice(0, -dateMatch[0].length)
  const parts = withoutDate.split('_').filter(Boolean)
  if (parts.length < 3) {
    return { deploymentId: trimmed, deploymentDate }
  }

  const datasetName = parts[0]
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

  const deploymentFolder = segments[0] ?? legacySourceRootName?.trim() ?? datasetId
  const parsed = parseDinalabDeploymentFolderName(deploymentFolder)
  const deploymentId = parsed.deploymentId
  const siteName = parsed.siteName ?? deploymentFolder
  const siteId = siteIdForDeployment({ datasetId, siteName })

  const nightDate =
    inferNightDateFromBotJsonPath(botRelativePath) ??
    parsed.deploymentDate ??
    'unknown-night'

  const cameraDayId = buildCameraDayId({ deploymentId, nightDate })

  return { deploymentId, siteId, siteName, nightDate, cameraDayId }
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
      deploymentsById.set(deploymentId, {
        deployment_id: deploymentId,
        site_id: siteIdForDeployment({ datasetId, siteName: parsed.siteName ?? deploymentId }),
        device_id: parsed.deviceId,
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
