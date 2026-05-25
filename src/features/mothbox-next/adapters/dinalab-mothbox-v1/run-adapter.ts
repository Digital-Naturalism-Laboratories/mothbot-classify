import { serializeNdjsonLines } from '../../parse-ndjson'
import type { PatchRecord, PatchSourceRecord, ClassificationRecord } from '../../records'
import { classificationFromBotShape, classificationFromIdentifiedShape } from '../../bot-shape-to-classification'
import { flattenClassificationFiles, resolveCurrentClassifications } from '../../resolve-classifications'
import { extractPatchFilename } from '../../patch-path'
import type { DinalabAdapterIO, DinalabAdapterResult, DinalabAdapterProgressCallback } from './adapter-io'
import { formatProgressFraction } from './adapter-progress'
import {
  buildDeploymentAndCameraDayRecords,
  inferNightDateFromPatchId,
  resolveDeploymentContext,
} from './derive-dinalab-hierarchy'

export async function runDinalabMothboxV1Adapter(params: {
  datasetId: string
  io: DinalabAdapterIO
  humanClassifierId?: string
  /** When true, copy the full legacy source tree into package 00_source/ (in-app migrate). */
  archiveSourceTree?: boolean
  /** Name of the picked legacy folder (used when bot JSON lives at that folder's root). */
  legacySourceRootName?: string
  onProgress?: DinalabAdapterProgressCallback
}): Promise<DinalabAdapterResult> {
  const { datasetId, io, legacySourceRootName, onProgress } = params
  const archiveSourceTree = params.archiveSourceTree === true
  const humanClassifierId = params.humanClassifierId?.trim() || 'bf'
  const sourcePathPrefix = archiveSourceTree ? '00_source/' : ''
  const progressMessage = 'Converting legacy dataset…'

  const patches: PatchRecord[] = []
  const patchSources: PatchSourceRecord[] = []
  const botRows: ClassificationRecord[] = []
  const humanRows: ClassificationRecord[] = []

  onProgress?.({
    phase: 'scan',
    message: progressMessage,
    description: 'Scanning legacy folder for bot detection files…',
  })

  const botJsonPaths = await io.source.findFiles((name) => name.endsWith('_botdetection.json'))

  onProgress?.({
    phase: 'scan',
    message: progressMessage,
    description: `Found ${botJsonPaths.length.toLocaleString()} bot detection file${botJsonPaths.length === 1 ? '' : 's'}`,
  })

  for (let botFileIndex = 0; botFileIndex < botJsonPaths.length; botFileIndex++) {
    const botRelativePath = botJsonPaths[botFileIndex]
    const shouldReportPatchProgress =
      botJsonPaths.length <= 20 || botFileIndex === 0 || botFileIndex === botJsonPaths.length - 1 || botFileIndex % 5 === 0

    if (shouldReportPatchProgress) {
      onProgress?.({
        phase: 'patches',
        message: progressMessage,
        description: `Processing bot detections ${formatProgressFraction({ current: botFileIndex + 1, total: botJsonPaths.length })} · ${patches.length.toLocaleString()} patches`,
      })
    }
    const text = await io.source.readText(botRelativePath)
    const json = JSON.parse(text)
    const shapes = Array.isArray(json?.shapes) ? json.shapes : []
    for (const shape of shapes) {
      const patchFileName = extractPatchFilename({ patchPath: String(shape?.patch_path ?? '') })
      if (!patchFileName) continue

      const patchId = patchFileName.replace(/\.(jpg|jpeg|png)$/i, '.pt')
      const botDir = dirnameRelative(botRelativePath)
      const sourcePatchRelative = joinRelative(botDir, 'patches', patchFileName)
      if (!(await io.source.exists(sourcePatchRelative))) continue

      const hierarchy = resolveDeploymentContext({ botRelativePath, datasetId, legacySourceRootName })
      const nightDate = inferNightDateFromPatchId(patchId) ?? hierarchy.nightDate

      const assetPath = `01_patches/${patchFileName}`
      await io.package.copyFromSource({
        sourceRelativePath: sourcePatchRelative,
        packageRelativePath: assetPath,
      })

      const photoBase = patchFileName.replace(/_\d+_Mothbot.*$/i, '').replace(/\.(jpg|jpeg|png)$/i, '')

      patches.push({
        patch_id: patchId,
        dataset_id: datasetId,
        asset_path: assetPath,
        media_type: 'image/jpeg',
        deployment_id: hierarchy.deploymentId,
        camera_day_id: buildCameraDayIdFromParts({
          deploymentId: hierarchy.deploymentId,
          nightDate,
        }),
      })

      patchSources.push({
        patch_id: patchId,
        source_type: 'crop_from_photo',
        source_photo_id: photoBase,
        original_bot_detection_path: joinRelative(sourcePathPrefix, botRelativePath),
        original_patch_path: joinRelative(sourcePathPrefix, sourcePatchRelative),
      })

      const classifierId = extractClassifierIdFromPatch(patchId)
      botRows.push(
        classificationFromBotShape({
          shape: shape as Record<string, unknown>,
          patchId,
          classifierId,
        }),
      )
    }

    const identifiedRelative = botRelativePath.replace('_botdetection.json', '_identified.json')
    if (await io.source.exists(identifiedRelative)) {
      const identifiedJson = JSON.parse(await io.source.readText(identifiedRelative))
      const identifiedShapes = Array.isArray(identifiedJson?.shapes) ? identifiedJson.shapes : []
      for (const shape of identifiedShapes) {
        const patchFileName = extractPatchFilename({ patchPath: String(shape?.patch_path ?? '') })
        if (!patchFileName) continue
        const patchId = patchFileName.replace(/\.(jpg|jpeg|png)$/i, '.pt')
        const row = classificationFromIdentifiedShape({
          shape: shape as Record<string, unknown>,
          patchId,
          classifierId: humanClassifierId,
        })
        if (row) humanRows.push(row)
      }
    }
  }

  if (!patches.length) {
    throw new Error('No patches found. Pick a folder with *_botdetection.json and patches/*.jpg under each night.')
  }

  onProgress?.({
    phase: 'patches',
    message: progressMessage,
    description: `Copied ${patches.length.toLocaleString()} patches — preparing package records…`,
  })

  if (archiveSourceTree) {
    await archiveLegacySourceTree({ io, onProgress, progressMessage })
  }

  onProgress?.({
    phase: 'records',
    message: progressMessage,
    description: 'Writing package records and manifest…',
  })

  const { deployments, cameraDays } = buildDeploymentAndCameraDayRecords({ datasetId, patches })

  await io.package.writeText('02_records/patches.ndjson', serializeNdjsonLines(patches))
  await io.package.writeText('02_records/patch-sources.ndjson', serializeNdjsonLines(patchSources))
  await io.package.writeText('02_records/deployments.ndjson', serializeNdjsonLines(deployments))
  await io.package.writeText('02_records/camera-days.ndjson', serializeNdjsonLines(cameraDays))
  await io.package.writeText('03_classifications/_bot.ndjson', serializeNdjsonLines(botRows))

  const humanClassifierPath = `03_classifications/${humanClassifierId}.ndjson`
  if (humanRows.length) {
    await io.package.writeText(humanClassifierPath, serializeNdjsonLines(humanRows))
  }

  const resolved = resolveCurrentClassifications({
    rows: flattenClassificationFiles({
      files: [
        { path: '03_classifications/_bot.ndjson', rows: botRows },
        ...(humanRows.length ? [{ path: humanClassifierPath, rows: humanRows }] : []),
      ],
    }),
  })

  await io.package.writeText('02_records/current-classifications.ndjson', serializeNdjsonLines(resolved))

  const manifest = {
    format: 'mothbox-next-dataset',
    version: 2,
    dataset_id: datasetId,
    package_kind: 'source_managed_working_dataset',
    classification_unit: 'patch',
    adapter_id: 'dinalab-mothbox-v1',
    source: archiveSourceTree ? { included: true, path: '00_source/' } : { included: false },
    folders: {
      ...(archiveSourceTree ? { source: '00_source/' } : {}),
      records: '02_records/',
      classifications: '03_classifications/',
      patches: '01_patches/',
    },
    records: {
      patches: '02_records/patches.ndjson',
      current_classifications: '02_records/current-classifications.ndjson',
      patch_sources: '02_records/patch-sources.ndjson',
      deployments: '02_records/deployments.ndjson',
      camera_days: '02_records/camera-days.ndjson',
    },
    classification_sources: [
      '03_classifications/_bot.ndjson',
      ...(humanRows.length ? [humanClassifierPath] : []),
    ],
    patches: { included: true, path: '01_patches/', required_when_source_absent: true },
  }

  await io.package.writeText('dataset.json', JSON.stringify(manifest, null, 2) + '\n')
  await io.package.writeText(
    'adapter-report.json',
    JSON.stringify(
      {
        adapter_id: 'dinalab-mothbox-v1',
        patch_count: patches.length,
        bot_rows: botRows.length,
        human_rows: humanRows.length,
      },
      null,
      2,
    ) + '\n',
  )

  return {
    datasetId,
    patchCount: patches.length,
    botRowCount: botRows.length,
    humanRowCount: humanRows.length,
  }
}

function extractClassifierIdFromPatch(patchId: string): string {
  const match = patchId.match(/_Mothbot_([^/]+)$/i) ?? patchId.match(/_([^_]+\.pt)$/i)
  return match?.[1] ?? 'mothbot'
}

function dirnameRelative(filePath: string): string {
  const normalized = filePath.replaceAll('\\', '/')
  const parts = normalized.split('/').filter(Boolean)
  if (parts.length <= 1) return ''
  return parts.slice(0, -1).join('/')
}

function buildCameraDayIdFromParts(params: { deploymentId: string; nightDate: string }) {
  return `${params.deploymentId}__${params.nightDate}`
}

function joinRelative(...segments: string[]): string {
  return segments
    .filter((s) => s.length > 0)
    .join('/')
    .replaceAll('\\', '/')
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
      packageRelativePath: joinRelative('00_source', sourceRelativePath),
    })
  }
}
