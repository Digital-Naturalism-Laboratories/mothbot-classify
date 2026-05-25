import type { IndexedFile } from '~/stores/entities/photos'
import { clearMothboxNextPackage, mothboxNextPackageStore } from '~/features/mothbox-next/active-package'
import { applyLoadedPackageToStores } from '~/features/mothbox-next/reload-package'
import {
  computePackageSessionFingerprint,
  loadPackageSessionCache,
  mergeIndexedWithHandles,
  isSessionCacheRenderable,
  type PackageSessionRestoreResult,
} from './package-session-cache'
import { normalizeIndexedPathsToPackageRoot } from '~/features/mothbox-next/package-indexed-access'

export async function restorePackageSessionCache(params: {
  folderName: string
  indexed: IndexedFile[]
}): Promise<PackageSessionRestoreResult> {
  const normalized = normalizeIndexedPathsToPackageRoot(params.indexed)
  const fingerprint = await computePackageSessionFingerprint({ indexed: normalized })
  if (!fingerprint) return { ok: false, reason: 'missing-fingerprint' }

  const cached = await loadPackageSessionCache(params.folderName)
  if (!cached) return { ok: false, reason: 'cache-miss' }
  if (cached.fingerprint !== fingerprint) return { ok: false, reason: 'stale-fingerprint' }
  if (!isSessionCacheRenderable(cached)) return { ok: false, reason: 'incomplete-tree' }

  const mergedIndexed = mergeIndexedWithHandles({
    meta: cached.indexedMeta,
    live: normalized,
  })

  try {
    mothboxNextPackageStore.set({
      packageRoot: cached.packageRoot,
      manifest: cached.manifest,
      loaded: cached.loaded,
    })
    await applyLoadedPackageToStores({
      loaded: cached.loaded,
      indexedFiles: mergedIndexed,
      sourceResolutionIndexed: normalized,
    })
  } catch (err) {
    clearMothboxNextPackage()
    console.warn('🚨 packageSessionCache: restore apply failed', {
      folderName: params.folderName,
      err,
    })
    return { ok: false, reason: 'apply-failed' }
  }

  console.log('✅ packageSessionCache: restored from IDB', {
    folderName: params.folderName,
    fingerprint,
    indexedCount: mergedIndexed.length,
  })

  return { ok: true }
}

export async function tryRestorePackageFromSessionCache(params: {
  folderName: string
  indexed: IndexedFile[]
}): Promise<boolean> {
  const result = await restorePackageSessionCache(params)
  return result.ok
}
