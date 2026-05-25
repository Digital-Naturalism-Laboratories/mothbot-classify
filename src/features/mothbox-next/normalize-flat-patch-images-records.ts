import type { MothboxNextDatasetManifest } from './dataset-manifest'
import {
  defaultLeafCameraDayId,
  defaultPatchImagesOnlyHierarchy,
  isDefaultLeafCameraDayId,
  type HierarchyDef,
} from './hierarchy-manifest'
import type { CameraDayRecord, DeploymentRecord, PatchRecord, PatchSourceRecord } from './records'

export const FLAT_PATCH_IMAGES_LEAF_LABEL = 'All Patches'

export function isPatchImagesOnlyPackage(params: {
  manifest: MothboxNextDatasetManifest
  patchSources?: PatchSourceRecord[]
  patches?: PatchRecord[]
  deployments?: DeploymentRecord[]
}): boolean {
  const { manifest, patchSources = [], patches = [], deployments = [] } = params

  if (patchSources.length > 0 && patchSources.every((row) => row.source_type === 'patch_image_only')) {
    return true
  }

  if (deployments.length > 0) return false

  if (manifest.hierarchy?.levels?.length === 1) return true

  const cameraDayIds = [...new Set(patches.map((patch) => patch.camera_day_id).filter(Boolean))]
  if (cameraDayIds.length === 1 && isDefaultLeafCameraDayId(cameraDayIds[0] ?? '')) return true

  return false
}

export function normalizeFlatPatchImagesRecords(params: {
  datasetId: string
  manifest: MothboxNextDatasetManifest
  patches: PatchRecord[]
  patchSources?: PatchSourceRecord[]
  deployments: DeploymentRecord[]
  cameraDays: CameraDayRecord[]
}): {
  patches: PatchRecord[]
  deployments: DeploymentRecord[]
  cameraDays: CameraDayRecord[]
  hierarchy: HierarchyDef
} {
  const { datasetId, manifest, patchSources = [] } = params

  if (!isPatchImagesOnlyPackage({ manifest, patchSources, patches: params.patches })) {
    return {
      patches: params.patches,
      deployments: params.deployments,
      cameraDays: params.cameraDays,
      hierarchy: manifest.hierarchy ?? defaultPatchImagesOnlyHierarchy(manifest),
    }
  }

  const leafId = defaultLeafCameraDayId(datasetId)
  const patches = params.patches.map((patch) => ({
    ...patch,
    camera_day_id: leafId,
    deployment_id: undefined,
  }))

  return {
    patches,
    deployments: [],
    cameraDays: [{ camera_day_id: leafId, night_date: FLAT_PATCH_IMAGES_LEAF_LABEL }],
    hierarchy: defaultPatchImagesOnlyHierarchy(manifest),
  }
}
