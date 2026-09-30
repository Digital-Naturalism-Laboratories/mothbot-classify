import { PATCH_MEASUREMENTS_RECORD } from '../../patch-measurements'
import { serializeNdjsonLines } from '../../parse-ndjson'
import type { DinalabAdapterIO } from './adapter-io'
import type { BuiltDinalabAdapterRecords } from './build-dinalab-adapter-records'
import type { PackageSourceLayout } from '~/features/data-flow/1.ingest/resolve-package-source-layout'
import { PACKAGE_ARCHIVE_DIR } from '~/features/data-flow/1.ingest/reserved-paths'
import { hierarchyForDinalabWriter } from '~/features/mothbox-next/hierarchy-manifest'
import type { DatasetFolderKind } from '~/features/data-flow/1.ingest/classify-dataset-folder'
import { groupHumanRowsByClassifierFile, humanClassifierFilePath } from '~/features/mothbox-next/human-classifier-files'

export async function writeDinalabMothboxV1Package(params: {
  datasetId: string
  io: DinalabAdapterIO
  built: BuiltDinalabAdapterRecords
  retainPatchesInSource: boolean
  archiveSourceTree: boolean
  packageRelativeSourcePrefix: string
  packageSourceLayout: PackageSourceLayout
  humanClassifierId: string
  folderKind?: Exclude<DatasetFolderKind, 'package' | 'skip'>
}): Promise<void> {
  const {
    datasetId,
    io,
    built,
    retainPatchesInSource,
    archiveSourceTree,
    packageRelativeSourcePrefix,
    packageSourceLayout,
    humanClassifierId,
    folderKind,
  } = params

  const humanClassifierPaths = await writeBuiltPackageRecordFiles({
    io,
    built,
    humanClassifierId,
    clearPreviousGeneratedHumanClassifierFiles: true,
  })

  const sourcePathLabel =
    packageSourceLayout === 'archive'
      ? `${PACKAGE_ARCHIVE_DIR}/`
      : packageRelativeSourcePrefix
        ? `${packageRelativeSourcePrefix.replace(/\/+$/, '')}/`
        : './'

  const manifestBase = {
    format: 'mothbox-next-dataset' as const,
    version: 3,
    dataset_id: datasetId,
    package_kind: (retainPatchesInSource || archiveSourceTree
      ? 'source_managed_working_dataset'
      : 'lightweight_substrate') as 'source_managed_working_dataset' | 'lightweight_substrate',
    classification_unit: 'patch',
    adapter_id: 'dinalab-mothbox-v1',
    source: retainPatchesInSource || archiveSourceTree
      ? {
          included: true,
          path: sourcePathLabel,
          layout: packageSourceLayout,
          original_source_available_elsewhere: false,
          trace_fields: ['02_records/patch-sources.ndjson'],
        }
      : {
          included: false,
          path: null,
          original_source_available_elsewhere: true,
          trace_fields: ['02_records/patch-sources.ndjson'],
        },
    cloud_upload_default: retainPatchesInSource
      ? { include_source: true, include_patches: false }
      : archiveSourceTree
        ? undefined
        : { include_source: false, include_patches: true },
    folders: {
      ...(retainPatchesInSource || archiveSourceTree
        ? { source: packageSourceLayout === 'archive' ? `${PACKAGE_ARCHIVE_DIR}/` : sourcePathLabel }
        : {}),
      records: '02_records/',
      classifications: '03_classifications/',
      patches: '01_patches/',
    },
    patches: retainPatchesInSource
      ? { included: false, path: '01_patches/', required_when_source_absent: false }
      : { included: true, path: '01_patches/', required_when_source_absent: true },
    records: {
      patches: '02_records/patches.ndjson',
      current_classifications: '02_records/current-classifications.ndjson',
      patch_sources: '02_records/patch-sources.ndjson',
      deployments: '02_records/deployments.ndjson',
      camera_days: '02_records/camera-days.ndjson',
      morpho_links: '02_records/morpho-links.ndjson',
    },
    classification_sources: [
      '03_classifications/_bot.ndjson',
      ...humanClassifierPaths,
    ],
  }

  const hierarchy = hierarchyForDinalabWriter(manifestBase)

  const manifest = {
    ...manifestBase,
    hierarchy,
  }

  await io.package.writeText('dataset.json', JSON.stringify(manifest, null, 2) + '\n')
  await io.package.writeText(
    'adapter-report.json',
    JSON.stringify(
      {
        adapter_id: 'dinalab-mothbox-v1',
        patch_count: built.patches.length,
        bot_rows: built.botRows.length,
        human_rows: built.humanRows.length,
        source_layout: packageSourceLayout,
        source_prefix: packageRelativeSourcePrefix || null,
        hierarchy_key: hierarchy.leaf.key,
        source_layout_kind: folderKind ?? 'legacy-root',
      },
      null,
      2,
    ) + '\n',
  )
}

export async function writeMergedPackageRecords(params: {
  io: DinalabAdapterIO
  built: BuiltDinalabAdapterRecords
  humanClassifierId: string
  patchCount: number
}): Promise<void> {
  const { io, built, humanClassifierId, patchCount } = params

  await writeBuiltPackageRecordFiles({
    io,
    built,
    humanClassifierId,
    clearPreviousGeneratedHumanClassifierFiles: false,
  })

  await io.package.writeText(
    'adapter-report.json',
    JSON.stringify(
      {
        adapter_id: 'dinalab-mothbox-v1',
        patch_count: patchCount,
        bot_rows: built.botRows.length,
        human_rows: built.humanRows.length,
        merged: true,
      },
      null,
      2,
    ) + '\n',
  )
}

/**
 * Writes the record files plus one human classifier file per person in
 * `built.humanRows` (legacy IDs keep the initials of whoever made them), and
 * always the running user's file. Returns the human classifier paths written.
 */
async function writeBuiltPackageRecordFiles(params: {
  io: DinalabAdapterIO
  built: BuiltDinalabAdapterRecords
  humanClassifierId: string
  clearPreviousGeneratedHumanClassifierFiles: boolean
}): Promise<string[]> {
  const { io, built, clearPreviousGeneratedHumanClassifierFiles, humanClassifierId } = params

  const humanFiles = groupHumanRowsByClassifierFile({ rows: built.humanRows, fallbackClassifierId: humanClassifierId })
  const ownPath = humanClassifierFilePath(humanClassifierId)
  if (!humanFiles.some((file) => file.path === ownPath)) humanFiles.push({ path: ownPath, rows: [] })
  const humanClassifierPaths = humanFiles.map((file) => file.path)

  if (clearPreviousGeneratedHumanClassifierFiles) {
    await clearPreviousGeneratedHumanClassifierFilesFromManifest({ io, keepPaths: humanClassifierPaths })
  }

  await io.package.writeText('02_records/patches.ndjson', serializeNdjsonLines(built.patches))
  await io.package.writeText('02_records/patch-sources.ndjson', serializeNdjsonLines(built.patchSources))
  await io.package.writeText(PATCH_MEASUREMENTS_RECORD, serializeNdjsonLines(built.measurements))
  await io.package.writeText('02_records/deployments.ndjson', serializeNdjsonLines(built.deployments))
  await io.package.writeText('02_records/camera-days.ndjson', serializeNdjsonLines(built.cameraDays))
  await io.package.writeText('03_classifications/_bot.ndjson', serializeNdjsonLines(built.botRows))
  for (const file of humanFiles) {
    await io.package.writeText(file.path, serializeNdjsonLines(file.rows))
  }

  await io.package.writeText(
    '02_records/current-classifications.ndjson',
    serializeNdjsonLines(built.resolvedClassifications),
  )

  return humanClassifierPaths
}

async function clearPreviousGeneratedHumanClassifierFilesFromManifest(params: {
  io: DinalabAdapterIO
  keepPaths: string[]
}) {
  const { io } = params
  const keepPaths = new Set(params.keepPaths.map(normalizeClassificationPath))
  const stalePaths = (await readPreviousGeneratedHumanClassifierPaths(io)).filter((path) => !keepPaths.has(path))

  for (const path of stalePaths) {
    await io.package.writeText(path, '')
  }
}

async function readPreviousGeneratedHumanClassifierPaths(io: DinalabAdapterIO): Promise<string[]> {
  let raw: unknown
  try {
    raw = JSON.parse(await io.package.readText('dataset.json'))
  } catch {
    return []
  }

  const sources = (raw as { classification_sources?: unknown })?.classification_sources
  if (!Array.isArray(sources)) return []

  return uniqueStrings(
    sources
      .map((path) => (typeof path === 'string' ? normalizeClassificationPath(path) : ''))
      .filter(isHumanClassificationPath),
  )
}

function isHumanClassificationPath(path: string) {
  if (!path.startsWith('03_classifications/') || !path.endsWith('.ndjson')) return false
  const fileName = path.split('/').pop()
  return !!fileName && fileName !== '_bot.ndjson'
}

function normalizeClassificationPath(path: string) {
  return path.replaceAll('\\', '/').replace(/^\/+/, '')
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}
