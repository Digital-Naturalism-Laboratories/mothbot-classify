import { normalizeMorphoKey } from '~/models/taxonomy/morphospecies'
import {
  readLegacyMorphoCoversFromIdb,
  replaceMorphoCovers,
  type MorphoCover,
} from '~/features/data-flow/3.persist/covers'
import { ensureReadWritePermission, persistenceConstants } from '~/features/data-flow/3.persist/files.persistence'
import { idbGet } from '~/utils/index-db'
import {
  fileExistsAt,
  readTextFile,
  writeTextFile,
  type FileSystemDirectoryHandleLike,
} from '~/utils/fs-directory-handle'
import { serializeNdjsonLines } from './parse-ndjson'
import { parseMorphoCoverRecords } from './parse-package-records'
import type { MorphoCoverRecord } from './records'
import { patchIdFromImageFileName } from './adapters/dinalab-mothbox-v1/adapter-patch-assets'

/** Lives beside morpho-links.ndjson, so it travels with the shareable package. */
export const PACKAGE_MORPHO_COVERS_RECORD = '02_records/morpho-covers.ndjson'

export function morphoCoversToRecords(covers: Record<string, MorphoCover>): MorphoCoverRecord[] {
  return Object.entries(covers)
    .map(([rawKey, cover]) => ({
      morpho_key: normalizeMorphoKey(rawKey),
      leaf_group_id: cover?.leafGroupId ?? '',
      patch_id: cover?.patchId ?? '',
    }))
    .filter((row) => row.morpho_key && row.leaf_group_id && row.patch_id)
    .sort((a, b) => a.morpho_key.localeCompare(b.morpho_key))
}

export function morphoCoverRecordsToMap(rows: MorphoCoverRecord[]): Record<string, MorphoCover> {
  const covers: Record<string, MorphoCover> = {}
  for (const row of rows) {
    const key = normalizeMorphoKey(row.morpho_key)
    if (!key) continue
    covers[key] = { leafGroupId: row.leaf_group_id, patchId: row.patch_id }
  }
  return covers
}

/**
 * Loads the opened package's covers into the store. The first time a package
 * opens without a covers file, it is seeded from the old browser-wide covers,
 * keeping only covers whose patch belongs to this package, and written out.
 */
export async function syncMorphoCoversWithPackage(params: {
  packageHandle: FileSystemDirectoryHandleLike
  findPatch: (patchId: string) => { leafGroupId: string } | undefined
}): Promise<{ source: 'package' | 'seeded' | 'none'; count: number }> {
  const { packageHandle, findPatch } = params

  if (await fileExistsAt(packageHandle, PACKAGE_MORPHO_COVERS_RECORD).catch(() => false)) {
    const covers = morphoCoverRecordsToMap(
      parseMorphoCoverRecords(await readTextFile(packageHandle, PACKAGE_MORPHO_COVERS_RECORD)),
    )
    replaceMorphoCovers(covers)
    return { source: 'package', count: Object.keys(covers).length }
  }

  const seeded: Record<string, MorphoCover> = {}
  for (const [key, cover] of Object.entries(await readLegacyMorphoCoversFromIdb())) {
    const match = matchLegacyCoverPatch({ patchId: cover.patchId, findPatch })
    if (match) seeded[key] = match
  }
  replaceMorphoCovers(seeded)

  const count = Object.keys(seeded).length
  if (!count) return { source: 'none', count }

  try {
    await writeTextFile(packageHandle, PACKAGE_MORPHO_COVERS_RECORD, serializeNdjsonLines(morphoCoversToRecords(seeded)))
  } catch (err) {
    // Read-only folder: covers still show from the store; they'll be written on the next change.
    console.warn('🚨 syncMorphoCoversWithPackage: could not write seeded covers', err)
  }
  return { source: 'seeded', count }
}

/**
 * Finds a browser-stored cover's patch in this package. Old Classify keyed
 * patches by crop file name (`…_Mothbot_yolo1.pt.jpg`) and used its own night
 * ids; packages drop the image extension, so try that id too, and take the
 * night from the package's patch so the cover opens the right night.
 */
function matchLegacyCoverPatch(params: {
  patchId: string
  findPatch: (patchId: string) => { leafGroupId: string } | undefined
}): MorphoCover | null {
  const { patchId, findPatch } = params
  for (const candidate of new Set([patchId, patchIdFromImageFileName(patchId)])) {
    const patch = findPatch(candidate)
    if (patch?.leafGroupId) return { leafGroupId: patch.leafGroupId, patchId: candidate }
  }
  return null
}

export async function writeMorphoCoversToOpenPackage(covers: Record<string, MorphoCover>) {
  // The persisted projectsRoot handle is the open package's directory.
  const root = (await idbGet(
    persistenceConstants.IDB_NAME,
    persistenceConstants.IDB_STORE,
    'projectsRoot',
  )) as FileSystemDirectoryHandleLike | null
  if (!root) return

  const granted = await ensureReadWritePermission(root)
  if (!granted) return

  await writeTextFile(root, PACKAGE_MORPHO_COVERS_RECORD, serializeNdjsonLines(morphoCoversToRecords(covers)))
}
