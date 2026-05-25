import { serializeNdjsonLines } from '../../parse-ndjson'
import type { DinalabAdapterIO } from './adapter-io'
import type { BuiltDinalabAdapterRecords } from './build-dinalab-adapter-records'
import type { PackageSourceLayout } from '~/features/data-flow/1.ingest/resolve-package-source-layout'
import { PACKAGE_ARCHIVE_DIR } from '~/features/data-flow/1.ingest/reserved-paths'
import {
  hierarchyForDinalabWriter,
  hierarchyForPatchImagesWriter,
} from '~/features/mothbox-next/hierarchy-manifest'
import type { DatasetFolderKind } from '~/features/data-flow/1.ingest/classify-dataset-folder'

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

  const humanClassifierPath = `03_classifications/${humanClassifierId}.ndjson`

  await writeBuiltPackageRecordFiles({
    io,
    built,
    humanClassifierPath,
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
      ...(built.humanRows.length ? [humanClassifierPath] : []),
    ],
  }

  const hierarchy =
    folderKind === 'patch-images-only'
      ? hierarchyForPatchImagesWriter(manifestBase)
      : hierarchyForDinalabWriter(manifestBase)

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
  const humanClassifierPath = `03_classifications/${humanClassifierId}.ndjson`

  await writeBuiltPackageRecordFiles({
    io,
    built,
    humanClassifierPath,
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

async function writeBuiltPackageRecordFiles(params: {
  io: DinalabAdapterIO
  built: BuiltDinalabAdapterRecords
  humanClassifierPath: string
}) {
  const { io, built, humanClassifierPath } = params

  await io.package.writeText('02_records/patches.ndjson', serializeNdjsonLines(built.patches))
  await io.package.writeText('02_records/patch-sources.ndjson', serializeNdjsonLines(built.patchSources))
  await io.package.writeText('02_records/deployments.ndjson', serializeNdjsonLines(built.deployments))
  await io.package.writeText('02_records/camera-days.ndjson', serializeNdjsonLines(built.cameraDays))
  await io.package.writeText('03_classifications/_bot.ndjson', serializeNdjsonLines(built.botRows))

  if (built.humanRows.length) {
    await io.package.writeText(humanClassifierPath, serializeNdjsonLines(built.humanRows))
  }

  await io.package.writeText(
    '02_records/current-classifications.ndjson',
    serializeNdjsonLines(built.resolvedClassifications),
  )
}
