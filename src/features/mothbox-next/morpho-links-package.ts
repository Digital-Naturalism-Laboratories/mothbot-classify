import { normalizeMorphoKey } from '~/models/taxonomy/morphospecies'
import {
  morphoLinksStore,
  saveMorphoLinksToIdb,
  setMorphoLinksForActiveDataset,
} from '~/features/data-flow/3.persist/links'
import type { MorphoLinksMap } from '~/features/data-flow/3.persist/links'
import { serializeNdjsonLines } from './parse-ndjson'
import { parseMorphoLinkRecords } from './parse-package-records'
import type { MorphoLinkRecord } from './records'
import type { PackageDataAccess } from './load-package-data'
import {
  fileExistsAt,
  readTextFile,
  removeFileAt,
  writeTextFile,
  type FileSystemDirectoryHandleLike,
} from '~/utils/fs-directory-handle'

export const PACKAGE_MORPHO_LINKS_RECORD = '02_records/morpho-links.ndjson'

/** Legacy JSON drop-in at package root (pre–mothbox-next or one-time import). */
export const LEGACY_PACKAGE_MORPHO_LINKS_JSON = 'morpho_links.json'

/** Removed layout — migrated into {@link PACKAGE_MORPHO_LINKS_RECORD}. */
export const DEPRECATED_MORPHO_LINKS_JSON = '03_metadata/morpho_links.json'

export function morphoLinksMapToRecords(links: MorphoLinksMap): MorphoLinkRecord[] {
  return Object.entries(links)
    .map(([rawKey, url]) => ({
      morpho_key: normalizeMorphoKey(rawKey),
      url: url.trim(),
    }))
    .filter((row) => row.morpho_key && row.url)
    .sort((a, b) => a.morpho_key.localeCompare(b.morpho_key))
}

export function morphoLinkRecordsToMap(rows: MorphoLinkRecord[]): MorphoLinksMap {
  const links: MorphoLinksMap = {}
  for (const row of rows) {
    const key = normalizeMorphoKey(row.morpho_key)
    const url = row.url?.trim()
    if (!key || !url) continue
    links[key] = url
  }
  return links
}

export function parseMorphoLinksJson(text: string): MorphoLinksMap | null {
  try {
    const parsed = JSON.parse(text) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null

    const links: MorphoLinksMap = {}
    for (const [rawKey, rawUrl] of Object.entries(parsed)) {
      if (typeof rawUrl !== 'string' || !rawUrl.trim()) continue
      const key = normalizeMorphoKey(rawKey)
      if (!key) continue
      links[key] = rawUrl.trim()
    }

    return Object.keys(links).length ? links : null
  } catch {
    return null
  }
}

export function parseMorphoLinksNdjson(text: string): MorphoLinksMap | null {
  try {
    const rows = parseMorphoLinkRecords(text)
    if (!rows.length) return null
    return morphoLinkRecordsToMap(rows)
  } catch {
    return null
  }
}

export function mergeMorphoLinksIntoStore(incoming: MorphoLinksMap) {
  return setMorphoLinksForActiveDataset({ links: incoming, mode: 'merge' })
}

export async function applyMorphoLinksFromPackage(params: {
  access: PackageDataAccess
  morphoLinksNdjsonPath: string
}) {
  const { access, morphoLinksNdjsonPath } = params
  try {
    const text = await access.readPackageFile(morphoLinksNdjsonPath)
    const links = parseMorphoLinksNdjson(text)
    if (links) setMorphoLinksForActiveDataset({ links, mode: 'replace' })
  } catch {
    // optional record file
  }
}

async function readMorphoLinksJsonFile(params: {
  packageHandle: FileSystemDirectoryHandleLike
  relativePath: string
}): Promise<MorphoLinksMap | null> {
  const { packageHandle, relativePath } = params
  if (!(await packageFileExists({ packageHandle, relativePath }))) return null

  const text = await readTextFile(packageHandle, relativePath)
  return parseMorphoLinksJson(text)
}

async function readMorphoLinksNdjsonFile(params: {
  packageHandle: FileSystemDirectoryHandleLike
  relativePath: string
}): Promise<MorphoLinksMap | null> {
  const { packageHandle, relativePath } = params
  if (!(await packageFileExists({ packageHandle, relativePath }))) return null

  const text = await readTextFile(packageHandle, relativePath)
  return parseMorphoLinksNdjson(text)
}

async function packageFileExists(params: {
  packageHandle: FileSystemDirectoryHandleLike
  relativePath: string
}) {
  const { packageHandle, relativePath } = params
  try {
    return await fileExistsAt(packageHandle, relativePath)
  } catch {
    return false
  }
}

export async function migrateLegacyMorphoLinksInPackage(params: {
  packageHandle: FileSystemDirectoryHandleLike
}): Promise<{ importedCount: number; removedLegacyFile: boolean }> {
  const { packageHandle } = params
  let merged: MorphoLinksMap = {}

  const fromRecords = await readMorphoLinksNdjsonFile({
    packageHandle,
    relativePath: PACKAGE_MORPHO_LINKS_RECORD,
  })
  if (fromRecords) merged = { ...merged, ...fromRecords }

  const fromDeprecatedJson = await readMorphoLinksJsonFile({
    packageHandle,
    relativePath: DEPRECATED_MORPHO_LINKS_JSON,
  })
  if (fromDeprecatedJson) merged = { ...merged, ...fromDeprecatedJson }

  const fromLegacyRoot = await readMorphoLinksJsonFile({
    packageHandle,
    relativePath: LEGACY_PACKAGE_MORPHO_LINKS_JSON,
  })
  if (fromLegacyRoot) merged = { ...merged, ...fromLegacyRoot }

  if (!Object.keys(merged).length) {
    return { importedCount: 0, removedLegacyFile: false }
  }

  const linksToPersist = setMorphoLinksForActiveDataset({ links: merged, mode: 'replace' })
  await saveMorphoLinksToIdb(linksToPersist)

  const rows = morphoLinksMapToRecords(linksToPersist)
  await writeTextFile(packageHandle, PACKAGE_MORPHO_LINKS_RECORD, serializeNdjsonLines(rows))

  let removedLegacyFile = false
  for (const legacyPath of [LEGACY_PACKAGE_MORPHO_LINKS_JSON, DEPRECATED_MORPHO_LINKS_JSON]) {
    if (!(await packageFileExists({ packageHandle, relativePath: legacyPath }))) continue
    try {
      await removeFileAt(packageHandle, legacyPath)
      removedLegacyFile = true
    } catch (err) {
      console.warn('🚨 migrateLegacyMorphoLinksInPackage: could not remove legacy morpho links file', {
        legacyPath,
        err,
      })
    }
  }

  return { importedCount: Object.keys(linksToPersist).length, removedLegacyFile }
}
