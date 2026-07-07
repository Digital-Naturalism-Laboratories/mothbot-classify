import type { DinalabAdapterIO, DinalabAdapterResult, DinalabAdapterProgressCallback } from './adapter-io'
import { formatProgressFraction } from './adapter-progress'
import { buildDinalabMothboxV1Records } from './build-dinalab-adapter-records'
import { buildAmiAdapterRecords } from './build-ami-adapter-records'
import type { DatasetFolderKind } from '~/features/data-flow/1.ingest/classify-dataset-folder'
import { writeDinalabMothboxV1Package } from './write-dinalab-adapter-package'
import { PACKAGE_ARCHIVE_DIR } from '~/features/data-flow/1.ingest/reserved-paths'
import type { PackageSourceLayout } from '~/features/data-flow/1.ingest/resolve-package-source-layout'
import { joinRelative } from './adapter-path-utils'

export async function runDinalabMothboxV1Adapter(params: {
  datasetId: string
  io: DinalabAdapterIO
  humanClassifierId?: string
  /** CLI only: copy the full legacy source tree into package 00_source/. */
  archiveSourceTree?: boolean
  /** Patch images stay at source paths under the package folder (no 01_patches/ copy). */
  retainPatchesInSource?: boolean
  /** Path from package root to source tree, e.g. "" | "MyDeployment/" | "00_source". */
  packageRelativeSourcePrefix?: string
  packageSourceLayout?: PackageSourceLayout
  legacySourceRootName?: string
  folderKind?: Exclude<DatasetFolderKind, 'package' | 'skip'>
  /** Read-only existence check against the original (primary) source folder, used as a fallback when locating full-size source photos not present in a `_processed` mirror. */
  originalSourceExists?: (relativePath: string) => Promise<boolean>
  onProgress?: DinalabAdapterProgressCallback
}): Promise<DinalabAdapterResult> {
  const { datasetId, io, legacySourceRootName, folderKind, onProgress, originalSourceExists } = params
  const archiveSourceTree = params.archiveSourceTree === true
  const retainPatchesInSource = params.retainPatchesInSource === true
  const humanClassifierId = params.humanClassifierId?.trim() || 'bf'
  const packageRelativeSourcePrefix =
    params.packageRelativeSourcePrefix ?? (archiveSourceTree || retainPatchesInSource ? PACKAGE_ARCHIVE_DIR : '')
  const packageSourceLayout = params.packageSourceLayout ?? (packageRelativeSourcePrefix === PACKAGE_ARCHIVE_DIR ? 'archive' : 'in_place')
  const progressMessage = archiveSourceTree ? 'Converting legacy dataset…' : 'Setting up dataset…'

  const buildParams = {
    datasetId,
    io,
    retainPatchesInSource,
    packageRelativeSourcePrefix,
    packageSourceLayout,
    legacySourceRootName,
    onProgress,
  }

  const built =
    folderKind === 'ami'
      ? await buildAmiAdapterRecords(buildParams)
      : await buildDinalabMothboxV1Records({
          ...buildParams,
          humanClassifierId,
          processedMirrorRoot: folderKind === 'mothbox-processed' ? '_processed' : undefined,
          originalSourceExists: folderKind === 'mothbox-processed-sibling' ? originalSourceExists : undefined,
        })

  if (archiveSourceTree && !retainPatchesInSource) {
    await archiveLegacySourceTree({ io, onProgress, progressMessage })
  }

  onProgress?.({
    phase: 'records',
    message: progressMessage,
    description: 'Writing package records and manifest…',
  })

  await writeDinalabMothboxV1Package({
    datasetId,
    io,
    built,
    retainPatchesInSource,
    archiveSourceTree,
    packageRelativeSourcePrefix,
    packageSourceLayout,
    humanClassifierId,
    folderKind,
  })

  return {
    datasetId,
    patchCount: built.patches.length,
    botRowCount: built.botRows.length,
    humanRowCount: built.humanRows.length,
  }
}

async function archiveLegacySourceTree(params: {
  io: DinalabAdapterIO
  onProgress?: DinalabAdapterProgressCallback
  progressMessage: string
}) {
  const { io, onProgress, progressMessage } = params

  onProgress?.({
    phase: 'scan',
    message: progressMessage,
    description: 'Counting legacy source files to archive…',
  })

  const sourceFiles = await io.source.findFiles(() => true)
  const total = sourceFiles.length

  onProgress?.({
    phase: 'archive',
    message: progressMessage,
    description: `Archiving ${total.toLocaleString()} source file${total === 1 ? '' : 's'} into 00_source/…`,
  })

  for (let fileIndex = 0; fileIndex < sourceFiles.length; fileIndex++) {
    const sourceRelativePath = sourceFiles[fileIndex]
    const shouldReportArchiveProgress =
      total <= 100 || fileIndex === 0 || fileIndex === total - 1 || fileIndex % 50 === 0

    if (shouldReportArchiveProgress) {
      onProgress?.({
        phase: 'archive',
        message: progressMessage,
        description: `Archiving source files ${formatProgressFraction({ current: fileIndex + 1, total })}`,
      })
    }

    await io.package.copyFromSource({
      sourceRelativePath,
      packageRelativePath: joinRelative(PACKAGE_ARCHIVE_DIR, sourceRelativePath),
    })
  }
}
