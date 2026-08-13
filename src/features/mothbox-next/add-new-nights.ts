/**
 * Adds night folders found on disk into an existing package's records without
 * rebuilding the package.
 *
 * The dinalab adapter is a full rebuild: it overwrites
 * `02_records/current-classifications.ndjson` and the human classifier file,
 * which would wipe identification work. Here the adapter's record *builder* is
 * driven over a source view filtered to only the new night folders, and the
 * resulting rows are appended. Existing lines are never rewritten.
 */

import type { DinalabAdapterIO, DinalabAdapterSourceIO } from './adapters/dinalab-mothbox-v1/adapter-io'
import { buildDinalabMothboxV1Records } from './adapters/dinalab-mothbox-v1/build-dinalab-adapter-records'
import type { PackageSourceLayout } from '~/features/data-flow/1.ingest/resolve-package-source-layout'
import {
  appendNdjsonRows,
  appendNdjsonRowsByKey,
  findUningestedNightFolders,
  isBotDetectionFileName,
  isPathInFolders,
  parseNdjson,
} from './incremental-nights'

const RECORDS = {
  patches: '02_records/patches.ndjson',
  patchSources: '02_records/patch-sources.ndjson',
  cameraDays: '02_records/camera-days.ndjson',
  deployments: '02_records/deployments.ndjson',
  currentClassifications: '02_records/current-classifications.ndjson',
  botClassifications: '03_classifications/_bot.ndjson',
} as const

export type NewNightsDetection = {
  /** Night folders present on disk but absent from the records. */
  folders: string[]
}

export type AddNewNightsResult = {
  folders: string[]
  patchesAdded: number
  cameraDaysAdded: number
  botRowsAdded: number
}

async function readTextSafe(io: DinalabAdapterIO, relativePath: string): Promise<string> {
  try {
    return await io.package.readText(relativePath)
  } catch {
    return ''
  }
}

/**
 * Finds night folders on disk that the package's records don't cover yet.
 * Read-only — makes no writes.
 */
export async function detectNewNightFolders(io: DinalabAdapterIO): Promise<NewNightsDetection> {
  const botDetectionPaths = await io.source.findFiles(isBotDetectionFileName)
  if (!botDetectionPaths.length) return { folders: [] }

  const patchesText = await readTextSafe(io, RECORDS.patches)
  const existingAssetPaths = parseNdjson<{ asset_path?: string }>(patchesText)
    .map((row) => row?.asset_path)
    .filter((path): path is string => typeof path === 'string' && !!path)

  return { folders: findUningestedNightFolders({ botDetectionPaths, existingAssetPaths }) }
}

/** Wraps the source IO so `findFiles` only sees files inside `folders`. */
function createFolderScopedSourceIO(source: DinalabAdapterSourceIO, folders: Set<string>): DinalabAdapterSourceIO {
  return {
    exists: source.exists,
    readText: source.readText,
    readBinary: source.readBinary,
    findFiles: async (predicate) => {
      const all = await source.findFiles(predicate)
      return all.filter((path) => isPathInFolders(path, folders))
    },
  }
}

/**
 * Builds records for `folders` and appends them to the package.
 *
 * Writes only additive rows to patches / patch-sources / camera-days /
 * deployments / `_bot.ndjson`, plus bot rows for the new patches in
 * `current-classifications.ndjson`. The human classifier file is never touched.
 */
export async function addNewNightsToPackage(params: {
  datasetId: string
  io: DinalabAdapterIO
  folders: string[]
  humanClassifierId?: string
  packageRelativeSourcePrefix: string
  packageSourceLayout: PackageSourceLayout
  legacySourceRootName?: string
  originalSourceExists?: (relativePath: string) => Promise<boolean>
}): Promise<AddNewNightsResult> {
  const { datasetId, io, folders, packageRelativeSourcePrefix, packageSourceLayout, legacySourceRootName } = params

  if (!folders.length) {
    return { folders: [], patchesAdded: 0, cameraDaysAdded: 0, botRowsAdded: 0 }
  }

  const folderSet = new Set(folders)
  const scopedIO: DinalabAdapterIO = {
    ...io,
    source: createFolderScopedSourceIO(io.source, folderSet),
  }

  const built = await buildDinalabMothboxV1Records({
    datasetId,
    io: scopedIO,
    humanClassifierId: params.humanClassifierId,
    retainPatchesInSource: true,
    packageRelativeSourcePrefix,
    packageSourceLayout,
    legacySourceRootName,
    originalSourceExists: params.originalSourceExists,
  })

  const patches = await appendRecord({ io, path: RECORDS.patches, additions: built.patches, key: 'patch_id' })
  await appendRecord({ io, path: RECORDS.patchSources, additions: built.patchSources, key: 'patch_id' })
  const cameraDays = await appendRecord({
    io,
    path: RECORDS.cameraDays,
    additions: built.cameraDays,
    key: 'camera_day_id',
  })
  await appendRecord({ io, path: RECORDS.deployments, additions: built.deployments, key: 'deployment_id' })

  // Bot classifications are an append-only log; new rows can't collide with
  // existing ones because their patch ids are new.
  const botText = await readTextSafe(io, RECORDS.botClassifications)
  const botMerged = appendNdjsonRows({ existingText: botText, additions: built.botRows })
  if (botMerged.addedCount) await io.package.writeText(RECORDS.botClassifications, botMerged.text)

  // current-classifications is keyed by patch — appending only brand-new patch
  // ids leaves every existing identification line untouched.
  const currentText = await readTextSafe(io, RECORDS.currentClassifications)
  const currentMerged = appendNdjsonRowsByKey({
    existingText: currentText,
    additions: built.botRows as Array<Record<string, unknown>>,
    key: 'patch_id',
  })
  if (currentMerged.addedCount) await io.package.writeText(RECORDS.currentClassifications, currentMerged.text)

  return {
    folders,
    patchesAdded: patches,
    cameraDaysAdded: cameraDays,
    botRowsAdded: botMerged.addedCount,
  }
}

async function appendRecord<T extends Record<string, unknown>>(params: {
  io: DinalabAdapterIO
  path: string
  additions: T[]
  key: keyof T & string
}): Promise<number> {
  const { io, path, additions, key } = params
  const existingText = await readTextSafe(io, path)
  const merged = appendNdjsonRowsByKey({ existingText, additions, key })
  if (merged.addedCount) await io.package.writeText(path, merged.text)
  return merged.addedCount
}
