import type { IndexedFile } from '~/stores/entities/photos'
import type { ActiveMothboxNextPackage } from '~/features/mothbox-next/active-package'
import type { LoadedMothboxNextPackage } from '~/features/mothbox-next/load-package-data'
import { normalizeIndexedPathsToPackageRoot } from '~/features/mothbox-next/package-indexed-access'
import type { MothboxNextDatasetManifest } from '~/features/mothbox-next/dataset-manifest'
import type { MorphoLinksMap } from '~/features/data-flow/3.persist/links'
import type { ProjectEntity } from '~/stores/entities/1.projects'
import type { SiteEntity } from '~/stores/entities/2.sites'
import type { DeploymentEntity } from '~/stores/entities/3.deployments'
import type { LeafGroupEntity } from '~/stores/entities/leaf-groups'
import {
  normalizeLeafGroupsFromCache,
  resolveDatasetId,
  type LeafGroupCacheRow,
} from '~/features/mothbox-next/dataset-scope'
import type { PhotoEntity } from '~/stores/entities/photos'
import type { PatchEntity } from '~/stores/entities/5.patches'
import type { DetectionEntity } from '~/models/detection.types'
import type { LeafGroupSummaryEntity } from '~/stores/entities/night-summaries'
import {
  buildIndexedFileMap,
  readIndexedEntryText,
} from '~/features/mothbox-next/package-indexed-access'
import { findPackageManifestInIndexedFiles } from '~/features/mothbox-next/load-package-data'
import { DB_NAME, idbDelete, idbGet, idbPut } from '~/utils/index-db'

const IDB_STORE = 'package-sessions'

export type IndexedFileMeta = {
  path: string
  name: string
  size: number
}

export const PACKAGE_SESSION_CACHE_VERSION = 5

export type PackageSessionCacheEntry = {
  cacheVersion: number
  fingerprint: string
  folderName: string
  savedAt: number
  packageRoot: string
  manifest: MothboxNextDatasetManifest
  loaded: LoadedMothboxNextPackage
  projects: Record<string, ProjectEntity>
  sites: Record<string, SiteEntity>
  deployments: Record<string, DeploymentEntity>
  leafGroups: Record<string, LeafGroupEntity>
  photos: Record<string, PhotoEntity>
  patches: Record<string, PatchEntity>
  detections: Record<string, DetectionEntity>
  leafGroupSummaries: Record<string, LeafGroupSummaryEntity>
  morphoLinks: MorphoLinksMap
  indexedMeta: IndexedFileMeta[]
}

export type PackageSessionRestoreFailureReason =
  | 'missing-fingerprint'
  | 'cache-miss'
  | 'stale-fingerprint'
  | 'incomplete-tree'
  | 'apply-failed'

export type PackageSessionRestoreResult =
  | { ok: true }
  | { ok: false; reason: PackageSessionRestoreFailureReason }

/** True when the home UI can show either legacy site/deployment rows or manifest hierarchy leaves. */
export function isSessionCacheRenderable(entry: PackageSessionCacheEntry): boolean {
  const projectIds = Object.keys(entry.projects)
  if (projectIds.length === 0) return false

  const hasLegacyRows =
    Object.values(entry.sites).some((site) => projectIds.includes(site.projectId)) ||
    Object.values(entry.deployments).some((deployment) => projectIds.includes(deployment.projectId))

  if (hasLegacyRows) return true

  return Object.values(entry.leafGroups).some((leafGroup) => {
    const datasetId = resolveDatasetId(leafGroup)
    return datasetId ? projectIds.includes(datasetId) : false
  })
}

export function hashString(value: string): string {
  let hash = 5381
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 33) ^ value.charCodeAt(i)
  }
  return (hash >>> 0).toString(36)
}

const PACKAGE_RECORD_PATH_PREFIXES = ['02_records/', '03_classifications/'] as const

export async function computePackageRecordContentDigest(indexed: IndexedFile[]): Promise<string> {
  const byPath = buildIndexedFileMap(indexed)
  const paths = indexed
    .map((entry) => entry.path)
    .filter((path) => PACKAGE_RECORD_PATH_PREFIXES.some((prefix) => path.startsWith(prefix)))
    .sort()

  const parts: string[] = []
  for (const path of paths) {
    const entry = byPath[path]
    if (!entry) {
      parts.push(`${path}:missing`)
      continue
    }

    try {
      const text = await readIndexedEntryText(entry)
      parts.push(`${path}:${hashString(text)}`)
    } catch {
      parts.push(`${path}:unreadable`)
    }
  }

  return hashString(parts.join('\n'))
}

export async function computePackageSessionFingerprint(params: {
  indexed: IndexedFile[]
}): Promise<string | null> {
  const { indexed } = params
  const manifestInfo = findPackageManifestInIndexedFiles(indexed)
  if (!manifestInfo) return null

  const byPath = buildIndexedFileMap(indexed)
  const manifestEntry = byPath[manifestInfo.manifestPath]
  if (!manifestEntry) return null

  const manifestText = await readIndexedEntryText(manifestEntry)
  const paths = indexed.map((entry) => entry.path).sort()
  const pathsDigest = hashString(paths.join('\n'))
  const contentDigest = await computePackageRecordContentDigest(indexed)

  return `${hashString(manifestText)}:${paths.length}:${pathsDigest}:${contentDigest}`
}

export function stripFileFromIndexedRef(ref: IndexedFile | undefined): IndexedFile | undefined {
  if (!ref) return undefined
  return { path: ref.path, name: ref.name, size: ref.size }
}

export function stripIndexedFilesFromPhotos(photos: Record<string, PhotoEntity>): Record<string, PhotoEntity> {
  const next: Record<string, PhotoEntity> = {}
  for (const [id, photo] of Object.entries(photos)) {
    next[id] = {
      ...photo,
      imageFile: stripFileFromIndexedRef(photo.imageFile),
      botDetectionFile: stripFileFromIndexedRef(photo.botDetectionFile),
      userDetectionFile: stripFileFromIndexedRef(photo.userDetectionFile),
    }
  }
  return next
}

export function stripIndexedFilesFromPatches(patches: Record<string, PatchEntity>): Record<string, PatchEntity> {
  const next: Record<string, PatchEntity> = {}
  for (const [id, patch] of Object.entries(patches)) {
    next[id] = {
      ...patch,
      imageFile: stripFileFromIndexedRef(patch.imageFile),
    }
  }
  return next
}

export function toIndexedFileMeta(indexed: IndexedFile[]): IndexedFileMeta[] {
  return indexed.map((entry) => ({
    path: entry.path,
    name: entry.name,
    size: entry.size,
  }))
}

export function mergeIndexedWithHandles(params: {
  meta: IndexedFileMeta[]
  live: IndexedFile[]
}): IndexedFile[] {
  const { meta, live } = params
  const liveByPath = buildIndexedFileMap(live)

  return meta.map((entry) => {
    const handleEntry = liveByPath[entry.path]
    return {
      ...entry,
      handle: handleEntry?.handle,
      file: handleEntry?.file,
      size: handleEntry?.size ?? entry.size,
      parentDir: handleEntry?.parentDir,
      rootDir: handleEntry?.rootDir,
    }
  })
}

export function relinkIndexedRefFromLive(params: {
  ref: IndexedFile | undefined
  liveByPath: Record<string, IndexedFile>
}): IndexedFile | undefined {
  const { ref, liveByPath } = params
  if (!ref?.path) return ref

  const live = liveByPath[ref.path]
  if (!live) return ref

  return {
    ...ref,
    handle: live.handle,
    file: live.file,
    size: live.size ?? ref.size,
    parentDir: live.parentDir,
    rootDir: live.rootDir,
  }
}

export function relinkPhotosIndexedFiles(params: {
  photos: Record<string, PhotoEntity>
  liveByPath: Record<string, IndexedFile>
}): Record<string, PhotoEntity> {
  const { photos, liveByPath } = params
  const next: Record<string, PhotoEntity> = {}

  for (const [id, photo] of Object.entries(photos)) {
    next[id] = {
      ...photo,
      imageFile: relinkIndexedRefFromLive({ ref: photo.imageFile, liveByPath }),
      botDetectionFile: relinkIndexedRefFromLive({ ref: photo.botDetectionFile, liveByPath }),
      userDetectionFile: relinkIndexedRefFromLive({ ref: photo.userDetectionFile, liveByPath }),
    }
  }

  return next
}

function packageSessionCacheKey(folderName: string): string {
  return folderName.trim()
}

export function isValidPackageSessionCacheEntry(
  entry: PackageSessionCacheEntry | null | undefined,
  folderName: string,
): entry is PackageSessionCacheEntry {
  const key = packageSessionCacheKey(folderName)
  if (!key || !entry?.fingerprint) return false
  if (entry.folderName !== key) return false
  if ((entry.cacheVersion ?? 1) < PACKAGE_SESSION_CACHE_VERSION) return false
  return true
}

function normalizePackageSessionCacheEntry(entry: PackageSessionCacheEntry): PackageSessionCacheEntry {
  const leafGroups = normalizeLeafGroupsFromCache(entry.leafGroups as Record<string, LeafGroupCacheRow>)
  return { ...entry, leafGroups: leafGroups as Record<string, LeafGroupEntity> }
}

export async function loadPackageSessionCache(folderName: string): Promise<PackageSessionCacheEntry | null> {
  const key = packageSessionCacheKey(folderName)
  if (!key) return null

  try {
    const saved = (await idbGet(DB_NAME, IDB_STORE, key)) as PackageSessionCacheEntry | null
    if (!isValidPackageSessionCacheEntry(saved, folderName)) return null
    return normalizePackageSessionCacheEntry(saved)
  } catch {
    return null
  }
}

export async function savePackageSessionCache(entry: PackageSessionCacheEntry): Promise<void> {
  const key = packageSessionCacheKey(entry.folderName)
  if (!key) return

  try {
    await idbPut(DB_NAME, IDB_STORE, key, entry)
  } catch (err) {
    console.warn('🚨 packageSessionCache: save failed', { folderName: key, err })
  }
}

export async function invalidatePackageSessionCache(folderName: string): Promise<void> {
  const key = packageSessionCacheKey(folderName)
  if (!key) return

  try {
    await idbDelete(DB_NAME, IDB_STORE, key)
  } catch {
    // ignore
  }
}

export type BuildPackageSessionCacheEntryParams = {
  folderName: string
  indexed: IndexedFile[]
  activePackage: ActiveMothboxNextPackage | null
  projects: Record<string, ProjectEntity>
  sites: Record<string, SiteEntity>
  deployments: Record<string, DeploymentEntity>
  leafGroups: Record<string, LeafGroupEntity>
  photos: Record<string, PhotoEntity>
  patches: Record<string, PatchEntity>
  detections: Record<string, DetectionEntity>
  leafGroupSummaries: Record<string, LeafGroupSummaryEntity>
  morphoLinks: MorphoLinksMap
}

export async function buildPackageSessionCacheEntry(
  params: BuildPackageSessionCacheEntryParams,
): Promise<PackageSessionCacheEntry | null> {
  const active = params.activePackage
  if (!active?.loaded) return null

  const normalized = normalizeIndexedPathsToPackageRoot(params.indexed)
  const fingerprint = await computePackageSessionFingerprint({ indexed: normalized })
  if (!fingerprint) return null

  const folderName = params.folderName.trim()
  if (!folderName) return null

  const entry: PackageSessionCacheEntry = {
    cacheVersion: PACKAGE_SESSION_CACHE_VERSION,
    fingerprint,
    folderName,
    savedAt: Date.now(),
    packageRoot: active.packageRoot,
    manifest: active.manifest,
    loaded: active.loaded,
    projects: params.projects,
    sites: params.sites,
    deployments: params.deployments,
    leafGroups: params.leafGroups,
    photos: stripIndexedFilesFromPhotos(params.photos),
    patches: stripIndexedFilesFromPatches(params.patches),
    detections: params.detections,
    leafGroupSummaries: params.leafGroupSummaries,
    morphoLinks: params.morphoLinks,
    indexedMeta: toIndexedFileMeta(normalized),
  }

  if (!isSessionCacheRenderable(entry)) return null

  return entry
}

export async function persistPackageSessionCacheEntry(entry: PackageSessionCacheEntry): Promise<void> {
  await savePackageSessionCache(entry)
  console.log('💾 packageSessionCache: saved', { folderName: entry.folderName, fingerprint: entry.fingerprint })
}
