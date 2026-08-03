import type { IndexedFile } from '~/stores/entities/photos'
import type { PatchEntity } from '~/stores/entities/5.patches'
import { projectsStore } from '~/stores/entities/1.projects'
import { sitesStore } from '~/stores/entities/2.sites'
import { deploymentsStore } from '~/stores/entities/3.deployments'
import { leafGroupsStore } from '~/stores/entities/leaf-groups'
import { photosStore } from '~/stores/entities/photos'
import { patchesStore } from '~/stores/entities/5.patches'
import { detectionsStore } from '~/stores/entities/detections'
import { mothboxNextPackageStore } from './active-package'
import { hydratePackageEntities } from './hydration-bridge'
import { loadMothboxNextPackageData, type LoadedMothboxNextPackage } from './load-package-data'
import type { PackageDataAccess } from './load-package-data'
import type { PackageTextWriter } from './persist/persist-human-classifications'
import { rebuildCurrentClassificationsCacheFromDisk } from './persist/persist-human-classifications'
import {
  buildIndexedFileMap,
  buildAssetPathIndex,
  createPackageDataAccessFromIndexedFiles,
  createPackageDataAccessFromWriter,
  readIndexedEntryText,
} from './package-indexed-access'
import { findPackageManifestInIndexedFiles } from './load-package-data'
import { joinRelativePaths } from './package-paths'
import { restoreSpeciesListSelectionFromPackage } from './restore-species-selection-from-package'
import { applyMorphoLinksFromPackage } from './morpho-links-package'
import { applyIndexedFilesState } from '~/features/data-flow/1.ingest/files.initialize'
import { applyClusterOverridesForLeafGroup } from '~/features/data-flow/3.persist/cluster-overrides'
import { rebuildLeafGroupSummariesFromDetections } from './rebuild-night-summaries'
import { speciesListsStore } from '~/features/data-flow/2.identify/species-list.store'
import { resolveLegacySourceRootForPackage } from './adapters/dinalab-mothbox-v1/derive-dinalab-hierarchy'
import { applyActiveHierarchyFromPackageRecords } from './apply-package-hierarchy'
import { normalizeFlatPatchImagesRecords } from './normalize-flat-patch-images-records'

export async function reloadActivePackageFromWriter(params: {
  writer: PackageTextWriter
  indexedFiles: IndexedFile[]
  sourceResolutionIndexed?: IndexedFile[]
  rebuildCache?: boolean
}) {
  const { writer, indexedFiles, sourceResolutionIndexed, rebuildCache = true } = params
  const active = mothboxNextPackageStore.get()
  if (!active) throw new Error('No mothbox-next package is open.')

  if (rebuildCache) {
    await rebuildCurrentClassificationsCacheFromDisk({ writer, activePackage: active })
  }

  const loaded = await loadMothboxNextPackageFromWriter({
    writer,
    packageRoot: active.packageRoot,
    manifest: active.manifest,
  })

  await applyLoadedPackageToStores({
    loaded,
    indexedFiles,
    sourceResolutionIndexed: sourceResolutionIndexed ?? indexedFiles,
  })
  return loaded
}

export async function reloadActivePackageFromIndexedFiles(params: {
  files: IndexedFile[]
  sourceResolutionIndexed?: IndexedFile[]
}) {
  const manifestInfo = findPackageManifestInIndexedFiles(params.files)
  if (!manifestInfo) throw new Error('No dataset.json in indexed files.')

  const byPath = buildIndexedFileMap(params.files)
  const manifestEntry = byPath[manifestInfo.manifestPath]
  if (!manifestEntry) throw new Error('dataset.json is not readable.')

  const access = createPackageDataAccessFromIndexedFiles({
    files: params.files,
    packageRoot: manifestInfo.packageRoot,
  })

  const loaded = await loadMothboxNextPackageData({
    packageRoot: manifestInfo.packageRoot,
    readManifestText: () => readIndexedEntryText(manifestEntry),
    access,
  })

  if (!loaded) throw new Error('Failed to load mothbox-next package.')

  mothboxNextPackageStore.set({
    packageRoot: manifestInfo.packageRoot,
    manifest: loaded.manifest,
    loaded,
  })

  await applyLoadedPackageToStores({
    loaded,
    indexedFiles: params.files,
    sourceResolutionIndexed: params.sourceResolutionIndexed ?? params.files,
  })
  return loaded
}

async function loadMothboxNextPackageFromWriter(params: {
  writer: PackageTextWriter
  packageRoot: string
  manifest: LoadedMothboxNextPackage['manifest']
}): Promise<LoadedMothboxNextPackage> {
  const { writer, packageRoot, manifest } = params
  const access = createPackageDataAccessFromWriter({ writer, packageRoot })

  const manifestText = await writer.readText(joinRelativePaths(packageRoot, 'dataset.json'))
  const loaded = await loadMothboxNextPackageData({
    packageRoot,
    readManifestText: async () => manifestText,
    access,
  })

  if (!loaded) throw new Error('Failed to load package from disk.')

  mothboxNextPackageStore.set({ packageRoot, manifest: loaded.manifest, loaded })
  return loaded
}

export async function refreshActivePackageLoadedFromWriter(params: { writer: PackageTextWriter }) {
  const active = mothboxNextPackageStore.get()
  if (!active) return null

  return loadMothboxNextPackageFromWriter({
    writer: params.writer,
    packageRoot: active.packageRoot,
    manifest: active.manifest,
  })
}

export function relinkPackagePatchImageFilesFromIndexed(params: {
  loaded: LoadedMothboxNextPackage
  indexedFiles: IndexedFile[]
}) {
  const { loaded, indexedFiles } = params
  const indexedByAssetPath = buildAssetPathIndex({
    patches: loaded.patches,
    byRelativePath: buildIndexedFileMap(indexedFiles),
    packageRoot: loaded.packageRoot,
  })

  const patches = patchesStore.get() || {}
  const nextPatches: Record<string, PatchEntity> = { ...patches }

  for (const patchRecord of loaded.patches) {
    const imageFile = indexedByAssetPath[patchRecord.asset_path]
    const entity = nextPatches[patchRecord.patch_id]
    if (!entity) continue
    nextPatches[patchRecord.patch_id] = {
      ...entity,
      ...(imageFile ? { imageFile } : {}),
    }
  }

  patchesStore.set(nextPatches)
}

async function readLegacySourceRootFromPackage(params: {
  access: PackageDataAccess
  patchSources?: LoadedMothboxNextPackage['patchSources']
  indexedPaths?: string[]
}): Promise<string | undefined> {
  const { access, patchSources, indexedPaths } = params
  let fromReport: string | undefined

  try {
    const text = await access.readPackageFile('adapter-report.json')
    const raw = JSON.parse(text) as { source_prefix?: string | null }
    fromReport = raw?.source_prefix?.trim() || undefined
  } catch {
    fromReport = undefined
  }

  return resolveLegacySourceRootForPackage({
    explicitLegacySourceRootName: fromReport,
    patchSources,
    indexedPaths,
  })
}

export async function applyLoadedPackageToStores(params: {
  loaded: LoadedMothboxNextPackage
  indexedFiles: IndexedFile[]
  sourceResolutionIndexed?: IndexedFile[]
}) {
  const { loaded, indexedFiles } = params
  const sourceResolutionIndexed = params.sourceResolutionIndexed ?? indexedFiles
  const sourceResolutionByPath = buildIndexedFileMap(sourceResolutionIndexed)
  const byPath = buildIndexedFileMap(indexedFiles)
  const indexedByAssetPath = buildAssetPathIndex({
    patches: loaded.patches,
    byRelativePath: byPath,
    packageRoot: loaded.packageRoot,
  })

  const access = createPackageDataAccessFromIndexedFiles({
    files: indexedFiles,
    packageRoot: loaded.packageRoot,
  })
  const legacySourceRootName = await readLegacySourceRootFromPackage({
    access,
    patchSources: loaded.patchSources,
    indexedPaths: sourceResolutionIndexed.map((file) => file.path),
  })

  const normalized = normalizeFlatPatchImagesRecords({
    datasetId: loaded.manifest.dataset_id,
    manifest: loaded.manifest,
    patches: loaded.patches,
    patchSources: loaded.patchSources,
    deployments: loaded.deployments,
    cameraDays: loaded.cameraDays,
  })

  const hydrated = hydratePackageEntities({
    datasetId: loaded.manifest.dataset_id,
    manifest: { ...loaded.manifest, hierarchy: normalized.hierarchy },
    patches: normalized.patches,
    patchSources: loaded.patchSources,
    deployments: normalized.deployments,
    cameraDays: normalized.cameraDays,
    resolvedClassifications: loaded.resolvedClassifications,
    classificationFiles: loaded.classificationFiles,
    indexedByAssetPath,
    sourceResolutionByPath,
    packageRoot: loaded.packageRoot,
    legacySourceRootName,
    indexedPaths: sourceResolutionIndexed.map((file) => file.path),
  })

  projectsStore.set(hydrated.projects)
  sitesStore.set(hydrated.sites)
  deploymentsStore.set(hydrated.deployments)
  leafGroupsStore.set(hydrated.nights)
  photosStore.set(hydrated.photos)
  patchesStore.set(hydrated.patches)

  // Derive leaf group IDs from the already-built nights index (avoids scanning all detections)
  const leafGroupIds = Object.keys(hydrated.nights)
  // Apply overrides directly into hydrated.detections — it's a local object, mutation is safe
  for (const leafGroupId of leafGroupIds) {
    await applyClusterOverridesForLeafGroup({ leafGroupId, detections: hydrated.detections, photos: hydrated.photos })
  }
  detectionsStore.set(hydrated.detections)
  rebuildLeafGroupSummariesFromDetections(hydrated.detections)

  applyActiveHierarchyFromPackageRecords({
    manifest: loaded.manifest,
    patches: loaded.patches,
    patchSources: loaded.patchSources,
    deployments: loaded.deployments,
    cameraDays: loaded.cameraDays,
    normalized,
  })

  restoreSpeciesListSelectionFromPackage({
    projectId: loaded.manifest.dataset_id,
    classifications: loaded.resolvedClassifications,
    speciesLists: speciesListsStore.get() || {},
  })

  applyIndexedFilesState({ indexed: indexedFiles, ingestMode: 'mothbox-next' })

  await applyMorphoLinksFromPackage({
    access,
    morphoLinksNdjsonPath: loaded.paths.morphoLinksNdjson,
  })
}
