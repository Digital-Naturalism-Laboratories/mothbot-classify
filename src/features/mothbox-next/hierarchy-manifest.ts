import type { MothboxNextDatasetManifest } from './dataset-manifest'

export type HierarchyLevelDef = {
  key: string
  label: string
  records: string
  id_field: string
  parent_field: string | null
}

export type HierarchyDef = {
  levels: HierarchyLevelDef[]
  leaf: {
    key: string
    patch_field: string
  }
}

export function defaultLeafCameraDayId(datasetId: string) {
  return `${datasetId}__default`
}

export function isDefaultLeafCameraDayId(cameraDayId: string) {
  return (cameraDayId ?? '').endsWith('__default')
}

export function defaultDinalabHierarchy(manifest: MothboxNextDatasetManifest): HierarchyDef {
  const deploymentsPath = manifest.records.deployments ?? '02_records/deployments.ndjson'
  const cameraDaysPath = manifest.records.camera_days ?? '02_records/camera-days.ndjson'

  return {
    levels: [
      {
        key: 'deployment',
        label: 'Deployment',
        records: deploymentsPath,
        id_field: 'deployment_id',
        parent_field: null,
      },
      {
        key: 'night',
        label: 'Night',
        records: cameraDaysPath,
        id_field: 'camera_day_id',
        parent_field: 'deployment_id',
      },
    ],
    leaf: {
      key: 'night',
      patch_field: 'camera_day_id',
    },
  }
}

export function defaultPatchImagesOnlyHierarchy(manifest: MothboxNextDatasetManifest): HierarchyDef {
  const cameraDaysPath = manifest.records.camera_days ?? '02_records/camera-days.ndjson'

  return {
    levels: [
      {
        key: 'night',
        label: 'All Patches',
        records: cameraDaysPath,
        id_field: 'camera_day_id',
        parent_field: null,
      },
    ],
    leaf: {
      key: 'night',
      patch_field: 'camera_day_id',
    },
  }
}

export function inferFlatPatchImagesHierarchy(params: {
  manifest: MothboxNextDatasetManifest
  cameraDayIds: string[]
}): HierarchyDef | null {
  const { manifest, cameraDayIds } = params
  if (cameraDayIds.length !== 1) return null
  if (!isDefaultLeafCameraDayId(cameraDayIds[0] ?? '')) return null
  return defaultPatchImagesOnlyHierarchy(manifest)
}

export function resolveHierarchyFromManifest(params: {
  manifest: MothboxNextDatasetManifest
  cameraDayIds?: string[]
  patchSources?: import('./records').PatchSourceRecord[]
}): HierarchyDef {
  const { manifest, cameraDayIds = [], patchSources = [] } = params

  if (manifest.hierarchy?.levels?.length && manifest.hierarchy.leaf?.patch_field) {
    return manifest.hierarchy
  }

  if (patchSources.length > 0 && patchSources.every((row) => row.source_type === 'patch_image_only')) {
    return defaultPatchImagesOnlyHierarchy(manifest)
  }

  const flat = inferFlatPatchImagesHierarchy({ manifest, cameraDayIds })
  if (flat) return flat

  return defaultDinalabHierarchy(manifest)
}

export function hierarchyForDinalabWriter(manifest: MothboxNextDatasetManifest): HierarchyDef {
  return defaultDinalabHierarchy(manifest)
}

