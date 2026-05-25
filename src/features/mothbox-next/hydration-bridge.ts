import type { PatchEntity } from '~/stores/entities/5.patches'
import type { PhotoEntity } from '~/stores/entities/photos'
import type { ProjectEntity } from '~/stores/entities/1.projects'
import type { SiteEntity } from '~/stores/entities/2.sites'
import type { DeploymentEntity } from '~/stores/entities/3.deployments'
import type { NightEntity } from '~/stores/entities/4.nights'
import type { DetectionEntity } from '~/models/detection.types'
import type { IndexedFile } from '~/stores/entities/photos'
import type { CameraDayRecord, DeploymentRecord, PatchRecord, PatchSourceRecord } from './records'
import type { ClassificationRecord } from './records'
import { detectionFromClassification } from './classification-to-detection'
import { buildDeploymentAndCameraDayRecords } from './adapters/dinalab-mothbox-v1/derive-dinalab-hierarchy'

export type HydratedPackageEntities = {
  projects: Record<string, ProjectEntity>
  sites: Record<string, SiteEntity>
  deployments: Record<string, DeploymentEntity>
  nights: Record<string, NightEntity>
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
  const nights: Record<string, NightEntity> = {}

  for (const d of deployments) {
    const siteId = d.site_id ?? `${datasetId}/site`
    const siteLabel = siteId.split('/').pop() ?? siteId
    sites[siteId] = sites[siteId] ?? { id: siteId, name: siteLabel, projectId: datasetId }
    deps[d.deployment_id] = {
      id: d.deployment_id,
      name: d.deployment_id,
      projectId: datasetId,
      siteId,
    }
  }

  for (const cd of cameraDays) {
    const deploymentId = cd.deployment_id ?? `${datasetId}/deployment`
    const siteId = deps[deploymentId]?.siteId ?? `${datasetId}/site`
    if (!deps[deploymentId]) {
      sites[siteId] = sites[siteId] ?? { id: siteId, name: siteId, projectId: datasetId }
      deps[deploymentId] = { id: deploymentId, name: deploymentId, projectId: datasetId, siteId }
    }
    nights[cd.camera_day_id] = {
      id: cd.camera_day_id,
      name: cd.night_date ?? cd.camera_day_id,
      projectId: datasetId,
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
      projectId: datasetId,
      siteId: defaultSiteId,
      deploymentId: defaultDeploymentId,
    }
  }

  return { projects, sites, deployments: deps, nights, defaultNightId, defaultDeploymentId, defaultSiteId }
}

export function hydratePackageEntities(params: {
  datasetId: string
  patches: PatchRecord[]
  patchSources?: PatchSourceRecord[]
  deployments: DeploymentRecord[]
  cameraDays: CameraDayRecord[]
  resolvedClassifications: ClassificationRecord[]
  indexedByAssetPath: Record<string, IndexedFile>
}): HydratedPackageEntities {
  const { datasetId, patches, patchSources = [], deployments, cameraDays, resolvedClassifications, indexedByAssetPath } = params

  const patchSourcesById: Record<string, PatchSourceRecord> = {}
  for (const source of patchSources) {
    if (source.patch_id) patchSourcesById[source.patch_id] = source
  }

  const hierarchyRecords =
    deployments.length || cameraDays.length
      ? { deployments, cameraDays }
      : buildDeploymentAndCameraDayRecords({ datasetId, patches })

  const hierarchy = buildHierarchyFromRecords({
    datasetId,
    deployments: hierarchyRecords.deployments,
    cameraDays: hierarchyRecords.cameraDays,
  })
  const photos: Record<string, PhotoEntity> = {}
  const patchesOut: Record<string, PatchEntity> = {}
  const detections: Record<string, DetectionEntity> = {}

  const classificationByPatch = new Map(resolvedClassifications.map((r) => [r.patch_id, r]))

  for (const patch of patches) {
    const nightId = patch.camera_day_id && hierarchy.nights[patch.camera_day_id]
      ? patch.camera_day_id
      : hierarchy.defaultNightId
    const photoId = syntheticPhotoId({ patch, patchSourcesById })
    const imageFile = indexedByAssetPath[patch.asset_path]

    if (!photos[photoId]) {
      photos[photoId] = { id: photoId, name: photoId, nightId }
    }

    patchesOut[patch.patch_id] = {
      id: patch.patch_id,
      name: patch.patch_id,
      nightId,
      photoId,
      imageFile,
    }

    const classification = classificationByPatch.get(patch.patch_id)
    if (classification) {
      detections[patch.patch_id] = detectionFromClassification({
        row: classification,
        nightId,
        photoId,
      })
    } else {
      detections[patch.patch_id] = {
        id: patch.patch_id,
        patchId: patch.patch_id,
        photoId,
        nightId,
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
