import type { IndexedFile } from '~/stores/entities/photos'
import { projectsStore } from '~/stores/entities/1.projects'
import { sitesStore } from '~/stores/entities/2.sites'
import { deploymentsStore } from '~/stores/entities/3.deployments'
import { nightsStore } from '~/stores/entities/4.nights'
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

export async function reloadActivePackageFromWriter(params: {
  writer: PackageTextWriter
  indexedFiles: IndexedFile[]
  rebuildCache?: boolean
}) {
  const { writer, indexedFiles, rebuildCache = true } = params
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

  applyLoadedPackageToStores({ loaded, indexedFiles })
  return loaded
}

export async function reloadActivePackageFromIndexedFiles(params: { files: IndexedFile[] }) {
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

  applyLoadedPackageToStores({ loaded, indexedFiles: params.files })
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

function applyLoadedPackageToStores(params: {
  loaded: LoadedMothboxNextPackage
  indexedFiles: IndexedFile[]
}) {
  const { loaded, indexedFiles } = params
  const byPath = buildIndexedFileMap(indexedFiles)
  const indexedByAssetPath = buildAssetPathIndex({
    patches: loaded.patches,
    byRelativePath: byPath,
  })

  const hydrated = hydratePackageEntities({
    datasetId: loaded.manifest.dataset_id,
    patches: loaded.patches,
    patchSources: loaded.patchSources,
    deployments: loaded.deployments,
    cameraDays: loaded.cameraDays,
    resolvedClassifications: loaded.resolvedClassifications,
    indexedByAssetPath,
  })

  projectsStore.set(hydrated.projects)
  sitesStore.set(hydrated.sites)
  deploymentsStore.set(hydrated.deployments)
  nightsStore.set(hydrated.nights)
  photosStore.set(hydrated.photos)
  patchesStore.set(hydrated.patches)
  detectionsStore.set(hydrated.detections)
}
