import type { MothboxNextDatasetManifest } from './dataset-manifest'
import { setActiveHierarchy } from './active-hierarchy'
import { normalizeFlatPatchImagesRecords } from './normalize-flat-patch-images-records'
import { resolveHierarchyNodes } from './resolve-hierarchy-nodes'
import type {
  CameraDayRecord,
  DeploymentRecord,
  PatchRecord,
  PatchSourceRecord,
} from './records'

type NormalizedPackageRecords = ReturnType<typeof normalizeFlatPatchImagesRecords>

export function applyActiveHierarchyFromPackageRecords(params: {
  manifest: MothboxNextDatasetManifest
  patches: PatchRecord[]
  patchSources: PatchSourceRecord[]
  deployments: DeploymentRecord[]
  cameraDays: CameraDayRecord[]
  normalized?: NormalizedPackageRecords
}) {
  const { manifest, patches, patchSources, deployments, cameraDays, normalized: preNormalized } = params

  const normalized =
    preNormalized ??
    normalizeFlatPatchImagesRecords({
      datasetId: manifest.dataset_id,
      manifest,
      patches,
      patchSources,
      deployments,
      cameraDays,
    })

  setActiveHierarchy(
    resolveHierarchyNodes({
      manifest: { ...manifest, hierarchy: normalized.hierarchy },
      deployments: normalized.deployments,
      cameraDays: normalized.cameraDays,
      patchSources,
    }),
  )
}
