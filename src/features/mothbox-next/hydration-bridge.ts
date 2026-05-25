import type { PatchEntity } from '~/stores/entities/5.patches'
import type { PhotoEntity } from '~/stores/entities/photos'
import type { ProjectEntity } from '~/stores/entities/1.projects'
import type { SiteEntity } from '~/stores/entities/2.sites'
import type { DeploymentEntity } from '~/stores/entities/3.deployments'
import type { LeafGroupEntity } from '~/stores/entities/leaf-groups'
import type { DetectionEntity } from '~/models/detection.types'
import type { IndexedFile } from '~/stores/entities/photos'
import type { CameraDayRecord, DeploymentRecord, PatchRecord, PatchSourceRecord } from './records'
import type { ClassificationRecord } from './records'
import { detectionFromClassification } from './classification-to-detection'
import {
  buildDeploymentAndCameraDayRecords,
  enrichPatchesFromPatchSources,
  packageNeedsWrappedDeploymentHierarchyRepair,
  parseDinalabDeploymentFolderName,
  siteIdForDeployment,
} from './adapters/dinalab-mothbox-v1/derive-dinalab-hierarchy'
import { defaultLeafCameraDayId } from './hierarchy-manifest'
import { isPatchImagesOnlyPackage, FLAT_PATCH_IMAGES_LEAF_LABEL } from './normalize-flat-patch-images-records'
import {
  DEFAULT_SITE_SEGMENT,
  deploymentRecordDisplayName,
  isIsoDateOnly,
  siteDisplayNameForDeployment,
} from './hierarchy-display-labels'
import { resolveIndexedEntry } from './package-indexed-access'
import { resolveSourcePhotoAssetPathForPatchSource } from './migrate-package-source-to-archive'

export type HydratedPackageEntities = {
  projects: Record<string, ProjectEntity>
  sites: Record<string, SiteEntity>
  deployments: Record<string, DeploymentEntity>
  nights: Record<string, LeafGroupEntity>
  photos: Record<string, PhotoEntity>
  patches: Record<string, PatchEntity>
  detections: Record<string, DetectionEntity>
}

function syntheticPhotoId(params: { patch: PatchRecord; patchSourcesById: Record<string, PatchSourceRecord> }): string {
  const { patch, patchSourcesById } = params
  const sourcePhotoId = patchSourcesById[patch.patch_id]?.source_photo_id
  if (sourcePhotoId) return `${sourcePhotoId}.jpg`
  const base = patch.patch_id.replace(/\.(pt|jpg|jpeg|png)$/i, '')
  return `${base}.jpg`
}

function buildHierarchyFromRecords(params: {
  datasetId: string
  deployments: DeploymentRecord[]
  cameraDays: CameraDayRecord[]
}) {
  const { datasetId, deployments, cameraDays } = params

  const projects: Record<string, ProjectEntity> = {
    [datasetId]: { id: datasetId, name: datasetId },
  }

  const sites: Record<string, SiteEntity> = {}
  const deps: Record<string, DeploymentEntity> = {}
  const nights: Record<string, LeafGroupEntity> = {}

  for (const d of deployments) {
    const siteId = resolveDeploymentSiteId({ datasetId, deployment: d })
    const siteLabel = siteDisplayNameForDeployment({ siteId, deployment: d }) || datasetId
    sites[siteId] = sites[siteId] ?? { id: siteId, name: siteLabel, projectId: datasetId }
    deps[d.deployment_id] = {
      id: d.deployment_id,
      name: deploymentRecordDisplayName(d),
      projectId: datasetId,
      siteId,
    }
  }

  for (const cd of cameraDays) {
    const deploymentId = cd.deployment_id ?? `${datasetId}/deployment`
    const siteId = deps[deploymentId]?.siteId ?? `${datasetId}/site`
    if (!deps[deploymentId]) {
      const fallbackDeployment: DeploymentRecord = { deployment_id: deploymentId, site_id: siteId }
      const siteLabel = siteDisplayNameForDeployment({ siteId, deployment: fallbackDeployment }) || datasetId
      sites[siteId] = sites[siteId] ?? { id: siteId, name: siteLabel, projectId: datasetId }
      deps[deploymentId] = {
        id: deploymentId,
        name: deploymentRecordDisplayName(fallbackDeployment),
        projectId: datasetId,
        siteId,
      }
    }
    nights[cd.camera_day_id] = {
      id: cd.camera_day_id,
      name: cd.night_date ?? cd.camera_day_id,
      datasetId,
      siteId,
      deploymentId,
    }
  }

  const firstNightId = Object.keys(nights)[0]
  const defaultNightId = firstNightId ?? `${datasetId}/night/default`
  const defaultDeploymentId =
    (firstNightId ? nights[firstNightId]?.deploymentId : undefined) ??
    deps[Object.keys(deps)[0] ?? '']?.id ??
    `${datasetId}/deployment/default`
  const defaultSiteId =
    deps[defaultDeploymentId]?.siteId ?? sites[Object.keys(sites)[0] ?? '']?.id ?? `${datasetId}/site/default`

  if (!firstNightId) {
    sites[defaultSiteId] = sites[defaultSiteId] ?? { id: defaultSiteId, name: defaultSiteId, projectId: datasetId }
    deps[defaultDeploymentId] = deps[defaultDeploymentId] ?? {
      id: defaultDeploymentId,
      name: defaultDeploymentId,
      projectId: datasetId,
      siteId: defaultSiteId,
    }
    nights[defaultNightId] = {
      id: defaultNightId,
      name: defaultNightId,
      datasetId,
      siteId: defaultSiteId,
      deploymentId: defaultDeploymentId,
    }
  }

  return { projects, sites, deployments: deps, nights, defaultNightId, defaultDeploymentId, defaultSiteId }
}

function shouldRebuildHierarchyRecordsFromPatches(params: {
  patches: PatchRecord[]
  deployments: DeploymentRecord[]
}) {
  const { patches, deployments } = params
  if (deployments.length === 0) return true
  if (packageNeedsWrappedDeploymentHierarchyRepair(patches)) return true
  if (deployments.every((deployment) => isIsoDateOnly(deployment.deployment_id))) return true
  return false
}

function resolveDeploymentSiteId(params: { datasetId: string; deployment: DeploymentRecord }) {
  const { datasetId, deployment } = params
  if (deployment.site_id) return deployment.site_id

  const parsed = parseDinalabDeploymentFolderName(deployment.deployment_id)
  const siteName =
    deployment.site_name_from_folder ??
    parsed.siteName ??
    (isIsoDateOnly(deployment.deployment_id) ? DEFAULT_SITE_SEGMENT : deployment.deployment_id)

  return siteIdForDeployment({ datasetId, siteName })
}

function buildFlatLeafHierarchyFromRecords(params: { datasetId: string; cameraDays: CameraDayRecord[] }) {
  const { datasetId, cameraDays } = params
  const leaf = cameraDays[0]
  const leafId = leaf?.camera_day_id ?? defaultLeafCameraDayId(datasetId)
  const leafName = leaf?.night_date ?? FLAT_PATCH_IMAGES_LEAF_LABEL

  const projects: Record<string, ProjectEntity> = {
    [datasetId]: { id: datasetId, name: datasetId },
  }

  const nights: Record<string, LeafGroupEntity> = {
    [leafId]: {
      id: leafId,
      name: leafName,
      datasetId,
      siteId: `${datasetId}/site/default`,
      deploymentId: `${datasetId}/deployment/default`,
    },
  }

  return {
    projects,
    sites: {},
    deployments: {},
    nights,
    defaultNightId: leafId,
    defaultDeploymentId: `${datasetId}/deployment/default`,
    defaultSiteId: `${datasetId}/site/default`,
  }
}

export function hydratePackageEntities(params: {
  datasetId: string
  manifest: import('./dataset-manifest').MothboxNextDatasetManifest
  patches: PatchRecord[]
  patchSources?: PatchSourceRecord[]
  deployments: DeploymentRecord[]
  cameraDays: CameraDayRecord[]
  resolvedClassifications: ClassificationRecord[]
  indexedByAssetPath: Record<string, IndexedFile>
  sourceResolutionByPath?: Record<string, IndexedFile>
  packageRoot?: string
  legacySourceRootName?: string
  indexedPaths?: string[]
}): HydratedPackageEntities {
  const {
    datasetId,
    manifest,
    patchSources = [],
    resolvedClassifications,
    indexedByAssetPath,
    sourceResolutionByPath = {},
    packageRoot = '',
    legacySourceRootName,
    indexedPaths,
  } = params

  let patches = patchSources.length
    ? enrichPatchesFromPatchSources({
        patches: params.patches,
        patchSources,
        datasetId,
        legacySourceRootName,
        indexedPaths,
      })
    : params.patches

  const flatPatchImages = isPatchImagesOnlyPackage({
    manifest,
    patchSources,
    patches,
    deployments: params.deployments,
  })
  if (flatPatchImages) {
    const leafId = defaultLeafCameraDayId(datasetId)
    patches = patches.map((patch) => ({
      ...patch,
      camera_day_id: leafId,
      deployment_id: undefined,
    }))
  }

  const patchSourcesById: Record<string, PatchSourceRecord> = {}
  for (const source of patchSources) {
    if (source.patch_id) patchSourcesById[source.patch_id] = source
  }

  const hierarchyRecords = flatPatchImages
    ? {
        deployments: [] as DeploymentRecord[],
        cameraDays: [{ camera_day_id: defaultLeafCameraDayId(datasetId), night_date: FLAT_PATCH_IMAGES_LEAF_LABEL }],
      }
    : shouldRebuildHierarchyRecordsFromPatches({
        patches,
        deployments: params.deployments,
      })
      ? buildDeploymentAndCameraDayRecords({ datasetId, patches })
      : { deployments: params.deployments, cameraDays: params.cameraDays }

  const hierarchy = flatPatchImages
    ? buildFlatLeafHierarchyFromRecords({ datasetId, cameraDays: hierarchyRecords.cameraDays })
    : buildHierarchyFromRecords({
        datasetId,
        deployments: hierarchyRecords.deployments,
        cameraDays: hierarchyRecords.cameraDays,
      })
  const photos: Record<string, PhotoEntity> = {}
  const patchesOut: Record<string, PatchEntity> = {}
  const detections: Record<string, DetectionEntity> = {}

  const classificationByPatch = new Map(resolvedClassifications.map((r) => [r.patch_id, r]))

  for (const patch of patches) {
    const leafGroupId = patch.camera_day_id && hierarchy.nights[patch.camera_day_id]
      ? patch.camera_day_id
      : hierarchy.defaultNightId
    const photoId = syntheticPhotoId({ patch, patchSourcesById })
    const imageFile = indexedByAssetPath[patch.asset_path]

    if (!photos[photoId]) {
      const sourceRow = patchSourcesById[patch.patch_id]
      const photoAssetPath = sourceRow ? resolveSourcePhotoAssetPathForPatchSource(sourceRow) : undefined
      const photoImageFile = photoAssetPath
        ? resolveIndexedEntry({
            byPath: sourceResolutionByPath,
            packageRoot,
            filePath: photoAssetPath,
            archiveFallback: true,
          })
        : undefined

      photos[photoId] = { id: photoId, name: photoId, leafGroupId, imageFile: photoImageFile }
    }

    patchesOut[patch.patch_id] = {
      id: patch.patch_id,
      name: patch.patch_id,
      leafGroupId,
      photoId,
      imageFile,
    }

    const classification = classificationByPatch.get(patch.patch_id)
    if (classification) {
      detections[patch.patch_id] = detectionFromClassification({
        row: classification,
        leafGroupId,
        photoId,
      })
    } else {
      detections[patch.patch_id] = {
        id: patch.patch_id,
        patchId: patch.patch_id,
        photoId,
        leafGroupId,
        detectedBy: 'auto',
      }
    }
  }

  return {
    projects: hierarchy.projects,
    sites: hierarchy.sites,
    deployments: hierarchy.deployments,
    nights: hierarchy.nights,
    photos,
    patches: patchesOut,
    detections,
  }
}
