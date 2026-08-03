import { parquetMetadataAsync, parquetReadObjects } from 'hyparquet'
import { buildTaxonRecord } from '~/models/taxonomy/builder'
import type { ClassificationRecord, PatchRecord, PatchSourceRecord, DeploymentRecord, CameraDayRecord } from '../../records'
import { flattenClassificationFiles, resolveCurrentClassifications } from '../../resolve-classifications'
import { isPatchImageFileName, isCsvFileName, isParquetFileName, isAmiCropImagePath } from '~/features/data-flow/1.ingest/classify-dataset-folder'
import { toPackageRelativeAssetPath, type PackageSourceLayout } from '~/features/data-flow/1.ingest/resolve-package-source-layout'
import type { DinalabAdapterIO, DinalabAdapterProgressCallback } from './adapter-io'
import { imageMediaTypeFromPath } from './adapter-media-type'
import { formatProgressFraction } from './adapter-progress'
import { joinRelative } from './adapter-path-utils'
import type { BuiltDinalabAdapterRecords } from './build-dinalab-adapter-records'

const AMI_METADATA_COLUMNS = [
  'detectionid',
  'taxonlevel',
  'label',
  'labelid',
  'score',
  'abovethreshold',
  'algorithm',
  'sourceimageid',
  'cropurl',
  'code',
  'year',
  'projectid',
  'partnerid',
  'wktposition',
  'filename',
  'deploymentid',
  'url',
  'timestamp',
  'x1',
  'x2',
  'y1',
  'y2',
  // Hubert/AMI variant column names
  'orderlabel',
  'orderscore',
  'deploymentcode',
  'deploymentyear',
]

const AMI_PARQUET_ROW_BATCH_SIZE = 50_000
const AMI_CLASSIFIER_PRIORITY = ['uk-denmark-moths', 'fastai-species', 'mcc24', 'ami-csv', 'ami'] as const
const TAXON_RANK_ORDER = ['kingdom', 'phylum', 'class', 'order', 'family', 'genus', 'species'] as const
const DEEPEST_RANK_FIRST = [...TAXON_RANK_ORDER].reverse()

export type AmiMetadataRow = {
  detectionid: string
  taxonlevel?: string
  label?: string
  labelid?: string
  score?: number
  abovethreshold?: boolean
  algorithm?: string
  sourceimageid?: string
  cropurl?: string
  code?: string
  year?: number | string
  projectid?: string
  partnerid?: string
  wktposition?: string
  filename?: string
  deploymentid?: string
  url?: string
  timestamp?: string | number | bigint
  x1?: number
  x2?: number
  y1?: number
  y2?: number
  metadataPath: string
  supplementalMetadataPath?: string
}

type AmiCrop = {
  relativePath: string
  patchFileName: string
  detectionId: string
  projectId: string
  year: string
  country: string
  code: string
  sourceFileName: string
  sourcePhotoRelativePath: string
}

export async function buildAmiAdapterRecords(params: {
  datasetId: string
  io: DinalabAdapterIO
  retainPatchesInSource: boolean
  packageRelativeSourcePrefix: string
  packageSourceLayout: PackageSourceLayout
  onProgress?: DinalabAdapterProgressCallback
}): Promise<BuiltDinalabAdapterRecords> {
  const { datasetId, io, packageRelativeSourcePrefix, onProgress } = params
  const progressMessage = 'Converting AMI dataset...'

  onProgress?.({
    phase: 'scan',
    message: progressMessage,
    description: 'Scanning AMI processed crops...',
  })

  // Scan io.source first; if no AMI crops found there (e.g. user opened the
  // project folder directly with _processed/ inside it), fall back to scanning
  // io.rootMetadata (the datasets root, which sees _processed/ at its own level).
  let cropPaths = await io.source.findFiles((name) => isPatchImageFileName(name))
  if (!cropPaths.some(isAmiCropImagePath) && io.rootMetadata) {
    const rootCropPaths = await io.rootMetadata.findFiles((name) => isPatchImageFileName(name))
    if (rootCropPaths.some(isAmiCropImagePath)) cropPaths = rootCropPaths
  }

  const crops = cropPaths
    .map((path) => parseAmiCropPath(path, datasetId))
    .filter((crop): crop is AmiCrop => !!crop)
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath))

  if (!crops.length) {
    throw new Error('No AMI crop images found under a _processed/ or _crops_ folder.')
  }

  const cropIds = new Set(crops.map((crop) => crop.detectionId))

  onProgress?.({
    phase: 'scan',
    message: progressMessage,
    description: `Found ${crops.length.toLocaleString()} processed AMI crop${crops.length === 1 ? '' : 's'}`,
  })

  const metadataRows = await readAmiMetadataRows({ io, cropIds, onProgress, progressMessage })
  const rowsByDetectionId = groupRowsByDetectionId(metadataRows)
  const defaultAlgorithm = selectDatasetAlgorithm(metadataRows)

  const patches: PatchRecord[] = []
  const patchSources: PatchSourceRecord[] = []
  const botRows: ClassificationRecord[] = []
  const deploymentsById = new Map<string, DeploymentRecord>()
  const cameraDaysById = new Map<string, CameraDayRecord>()

  for (let cropIndex = 0; cropIndex < crops.length; cropIndex++) {
    const crop = crops[cropIndex]
    const rows = rowsByDetectionId.get(crop.detectionId) ?? []
    const representative = rows[0]
    const deploymentId = deploymentIdForAmiCrop({ crop, representative })
    const capturedAt = capturedAtFromAmi({ row: representative, crop })
    const nightDate = nightDateFromCapturedAt(capturedAt) ?? nightDateFromSourceFileName(crop.sourceFileName) ?? 'unknown-night'
    const cameraDayId = `${deploymentId}__${nightDate}`
    const assetPath = toPackageRelativeAssetPath({
      sourcePrefix: packageRelativeSourcePrefix,
      pathRelativeToSource: crop.relativePath,
    })

    if (cropIndex === 0 || cropIndex === crops.length - 1 || cropIndex % 20 === 0) {
      onProgress?.({
        phase: 'patches',
        message: progressMessage,
        description: `Indexing AMI crops ${formatProgressFraction({ current: cropIndex + 1, total: crops.length })}`,
      })
    }

    patches.push({
      patch_id: crop.detectionId,
      dataset_id: datasetId,
      asset_path: assetPath,
      media_type: imageMediaTypeFromPath(crop.patchFileName),
      captured_at: capturedAt,
      deployment_id: deploymentId,
      camera_day_id: cameraDayId,
    })

    patchSources.push({
      patch_id: crop.detectionId,
      source_type: 'ami_crop',
      source_photo_id: representative?.sourceimageid || crop.sourceFileName.replace(/\.(jpg|jpeg|png)$/i, ''),
      source_photo_asset_path: toPackageRelativeAssetPath({
        sourcePrefix: packageRelativeSourcePrefix,
        pathRelativeToSource: crop.sourcePhotoRelativePath,
      }),
      original_patch_path: assetPath,
      source_bot_detection_id: crop.detectionId,
      metadata_path: representative?.metadataPath,
      source_image_id: representative?.sourceimageid,
      source_photo_url: representative?.url,
      crop_url: representative?.cropurl,
      crop_points: cropPointsFromAmiRow(representative),
      source_metadata: representative
        ? {
            ami_detection_id: crop.detectionId,
            ami_deployment_id: representative.deploymentid,
            ami_project_id: representative.projectid || crop.projectId,
            ami_code: representative.code,
            ami_country: crop.country,
            ami_year: representative.year ?? crop.year,
            ami_partner_id: representative.partnerid,
            ami_wkt_position: representative.wktposition,
            ami_source_filename: representative.filename,
            ami_source_url: representative.url,
            ami_label_ids: uniqueStrings(rows.map((row) => row.labelid)),
            ami_algorithms: uniqueStrings(rows.map((row) => row.algorithm)),
            ami_metadata_paths: metadataPathsFromAmiRows(rows),
            ...(rows.some((row) => row.abovethreshold === true) ? { ami_above_threshold: true } : {}),
          }
        : undefined,
    })

    if (!deploymentsById.has(deploymentId)) {
      deploymentsById.set(deploymentId, {
        deployment_id: deploymentId,
        site_id: `${datasetId}/site/${crop.country}`,
        device_id: representative?.code || crop.code,
        site_name_from_folder: crop.country,
        device_id_from_folder: representative?.code || crop.code,
        deployment_start_from_folder: String(representative?.year ?? crop.year),
        dataset_name_from_folder: representative?.projectid || crop.projectId,
      })
    }

    if (!cameraDaysById.has(cameraDayId)) {
      cameraDaysById.set(cameraDayId, {
        camera_day_id: cameraDayId,
        deployment_id: deploymentId,
        device_id: representative?.code || crop.code,
        night_date: nightDate,
      })
    }

    // Produce one classification per algorithm so the user can switch between them in the UI.
    // The default algorithm (latest timestamp, deepest rank) gets classified_at=1 so it wins
    // in resolveCurrentClassifications. Others get classified_at=null and are available for
    // view-time switching without re-reading disk.
    const algorithmGroups = groupRowsByAlgorithm(rows)
    for (const [algorithm, algorithmRows] of algorithmGroups) {
      const classification = classificationFromAlgorithmRows({
        patchId: crop.detectionId,
        algorithmRows,
        allRowsForDetection: rows,
        classifiedAt: algorithm === defaultAlgorithm ? 1 : null,
      })
      if (classification) botRows.push(classification)
    }
  }

  const resolvedClassifications = resolveCurrentClassifications({
    rows: flattenClassificationFiles({ files: [{ path: '03_classifications/_bot.ndjson', rows: botRows }] }),
  })

  return {
    patches,
    patchSources,
    botRows,
    humanRows: [],
    resolvedClassifications,
    deployments: [...deploymentsById.values()].sort((a, b) => a.deployment_id.localeCompare(b.deployment_id)),
    cameraDays: [...cameraDaysById.values()].sort((a, b) => a.camera_day_id.localeCompare(b.camera_day_id)),
  }
}

async function readAmiMetadataRows(params: {
  io: DinalabAdapterIO
  cropIds: Set<string>
  onProgress?: DinalabAdapterProgressCallback
  progressMessage: string
}) {
  const { io, cropIds, onProgress, progressMessage } = params
  // Parquet/CSV may live inside the dataset folder or at the datasets root
  // (sibling to the project folder) — check both, tag each path with its
  // source IO, and deduplicate by base filename so the same file isn't read twice.
  type TaggedPath = { metadataPath: string; source: DinalabAdapterIO['source'] }
  const tagPaths = (paths: string[], source: NonNullable<DinalabAdapterIO['source']>): TaggedPath[] =>
    paths.map((metadataPath) => ({ metadataPath, source }))

  const sourceParquetTagged = tagPaths(
    (await io.source.findFiles((name) => isParquetFileName(name))).sort(),
    io.source,
  )
  const sourceCsvTagged = tagPaths(
    (await io.source.findFiles((name) => isCsvFileName(name))).sort(),
    io.source,
  )
  const rootParquetTagged = io.rootMetadata
    ? tagPaths((await io.rootMetadata.findFiles((name) => isParquetFileName(name))).sort(), io.rootMetadata)
    : []
  const rootCsvTagged = io.rootMetadata
    ? tagPaths((await io.rootMetadata.findFiles((name) => isCsvFileName(name))).sort(), io.rootMetadata)
    : []

  const parquetEntries = deduplicateTaggedByFileName([...sourceParquetTagged, ...rootParquetTagged])
  const csvEntries = deduplicateTaggedByFileName([...sourceCsvTagged, ...rootCsvTagged])

  const parquetRows: AmiMetadataRow[] = []
  for (const { metadataPath, source } of parquetEntries) {
    onProgress?.({
      phase: 'scan',
      message: progressMessage,
      description: `Reading AMI parquet metadata ${metadataPath}...`,
    })

    const rows = await readAmiParquetMetadataRows({ source, metadataPath, cropIds })
    parquetRows.push(...rows)
  }

  const parquetDetectionIds = new Set(parquetRows.map((row) => row.detectionid))
  // Also read the CSV when the parquet only has species/genus-level rows — the CSV
  // typically carries order-level labels that fill in the higher-taxa fields.
  const parquetNeedsHigherTaxaEnrichment =
    parquetRows.length > 0 &&
    parquetRows.every((row) => {
      const level = normalizeTaxonLevel(row.taxonlevel)
      return level === 'species' || level === 'genus' || level === ''
    })
  const needsCsvSupplement =
    parquetRows.length === 0 ||
    parquetRows.some((row) => !row.cropurl) ||
    [...cropIds].some((cropId) => !parquetDetectionIds.has(cropId)) ||
    parquetNeedsHigherTaxaEnrichment

  if (!needsCsvSupplement) return parquetRows

  const csvRows: AmiMetadataRow[] = []
  for (const { metadataPath, source } of csvEntries) {
    onProgress?.({
      phase: 'scan',
      message: progressMessage,
      description: `Reading AMI CSV metadata ${metadataPath}...`,
    })

    csvRows.push(...readAmiCsvMetadataRows({
      text: await source.readText(metadataPath),
      metadataPath,
      cropIds,
    }))
  }

  return mergeAmiPrimaryAndSupplementalRows({
    primaryRows: parquetRows,
    supplementalRows: csvRows,
  })
}

async function readAmiParquetMetadataRows(params: {
  source: DinalabAdapterIO['source']
  metadataPath: string
  cropIds: Set<string>
}): Promise<AmiMetadataRow[]> {
  const { source, metadataPath, cropIds } = params
  const buffer = await source.readBinary(metadataPath)
  const file = {
    byteLength: buffer.byteLength,
    slice: async (start: number, end?: number) => buffer.slice(start, end),
  }
  const metadata = await parquetMetadataAsync(file)
  const rowCount = Number(metadata.num_rows ?? 0)
  const out: AmiMetadataRow[] = []

  for (let rowStart = 0; rowStart < rowCount; rowStart += AMI_PARQUET_ROW_BATCH_SIZE) {
    const rows = await parquetReadObjects({
      file,
      metadata,
      columns: AMI_METADATA_COLUMNS,
      rowStart,
      rowEnd: Math.min(rowStart + AMI_PARQUET_ROW_BATCH_SIZE, rowCount),
    })

    for (const rawRow of rows) {
      const row = normalizeAmiMetadataRow({ row: rawRow, metadataPath })
      if (row && cropIds.has(row.detectionid)) out.push(row)
    }
  }

  return out
}

function readAmiCsvMetadataRows(params: {
  text: string
  metadataPath: string
  cropIds: Set<string>
}): AmiMetadataRow[] {
  const { text, metadataPath, cropIds } = params
  const records = parseCsvRecords(text)
  const out: AmiMetadataRow[] = []

  for (const record of records) {
    const inferredTaxonLevel = record.taxonlevel || (record.orderlabel ? 'order' : '')
    // Strip AMI sub-order qualifiers like "Lepidoptera Macros" → "Lepidoptera".
    // Only clean when the taxon level is inferred from orderlabel (not explicit).
    const cleanedOrderLabel =
      inferredTaxonLevel === 'order' && !record.taxonlevel && record.orderlabel
        ? cleanAmiOrderLabel(record.orderlabel)
        : record.orderlabel
    const row = normalizeAmiMetadataRow({
      row: {
        detectionid: record.detectionid,
        taxonlevel: inferredTaxonLevel,
        label: record.label || cleanedOrderLabel,
        labelid: record.labelid,
        score: record.score || record.orderscore,
        abovethreshold: record.abovethreshold,
        algorithm: record.algorithm || 'ami-csv',
        sourceimageid: record.sourceimageid,
        cropurl: record.cropurl,
        code: record.code || record.deploymentcode,
        year: record.year || record.deploymentyear,
        projectid: record.projectid,
        partnerid: record.partnerid,
        wktposition: record.wktposition,
        filename: sourceFileNameFromCropUrl(record.cropurl),
        deploymentid: record.deploymentid,
        url: record.url,
        timestamp: record.timestamp,
        x1: record.x1,
        x2: record.x2,
        y1: record.y1,
        y2: record.y2,
      },
      metadataPath,
    })
    if (row && cropIds.has(row.detectionid)) out.push(row)
  }

  return out
}

function normalizeAmiMetadataRow(params: {
  row: Record<string, unknown>
  metadataPath: string
}): AmiMetadataRow | null {
  const { row, metadataPath } = params
  const detectionid = stringValue(row.detectionid)
  if (!detectionid) return null

  return {
    detectionid,
    taxonlevel: stringValue(row.taxonlevel),
    label: stringValue(row.label) ?? stringValue(row.orderlabel),
    labelid: stringValue(row.labelid),
    score: numberValue(row.score) ?? numberValue(row.orderscore),
    abovethreshold: booleanValue(row.abovethreshold),
    algorithm: stringValue(row.algorithm),
    sourceimageid: stringValue(row.sourceimageid),
    cropurl: stringValue(row.cropurl),
    code: stringValue(row.code) ?? stringValue(row.deploymentcode),
    year: stringValue(row.year) ?? stringValue(row.deploymentyear) ?? numberValue(row.year),
    projectid: stringValue(row.projectid),
    partnerid: stringValue(row.partnerid),
    wktposition: stringValue(row.wktposition),
    filename: stringValue(row.filename),
    deploymentid: stringValue(row.deploymentid),
    url: stringValue(row.url),
    timestamp: bigintStringNumberValue(row.timestamp),
    x1: numberValue(row.x1),
    x2: numberValue(row.x2),
    y1: numberValue(row.y1),
    y2: numberValue(row.y2),
    metadataPath,
  }
}

export function mergeAmiPrimaryAndSupplementalRows(params: {
  primaryRows: AmiMetadataRow[]
  supplementalRows: AmiMetadataRow[]
}): AmiMetadataRow[] {
  const { primaryRows, supplementalRows } = params
  if (!primaryRows.length) return supplementalRows
  if (!supplementalRows.length) return primaryRows

  const supplementalByDetectionId = groupRowsByDetectionId(supplementalRows)
  const primaryDetectionIds = new Set(primaryRows.map((row) => row.detectionid))
  const merged: AmiMetadataRow[] = []

  for (const row of primaryRows) {
    const supplemental = supplementalByDetectionId.get(row.detectionid)?.[0]
    if (!supplemental) {
      merged.push(row)
      continue
    }

    merged.push(mergeMissingAmiRowFields({ primary: row, supplemental }))

    // When primary and supplemental represent *different* taxon levels (e.g. parquet
    // has species-level, CSV has order-level), keep the supplemental as a separate
    // row so taxonFieldsFromAmiRows can extract both levels for the full taxonomy.
    const primaryLevel = normalizeTaxonLevel(row.taxonlevel)
    const supplLevel = normalizeTaxonLevel(supplemental.taxonlevel)
    if (supplLevel && primaryLevel !== supplLevel && supplemental.label) {
      merged.push(supplemental)
    }
  }

  for (const supplemental of supplementalRows) {
    if (!primaryDetectionIds.has(supplemental.detectionid)) merged.push(supplemental)
  }

  return merged
}

function mergeMissingAmiRowFields(params: {
  primary: AmiMetadataRow
  supplemental: AmiMetadataRow
}): AmiMetadataRow {
  const { primary, supplemental } = params
  return {
    ...primary,
    labelid: primary.labelid ?? supplemental.labelid,
    abovethreshold: primary.abovethreshold ?? supplemental.abovethreshold,
    sourceimageid: primary.sourceimageid ?? supplemental.sourceimageid,
    cropurl: primary.cropurl ?? supplemental.cropurl,
    code: primary.code ?? supplemental.code,
    year: primary.year ?? supplemental.year,
    projectid: primary.projectid ?? supplemental.projectid,
    partnerid: primary.partnerid ?? supplemental.partnerid,
    wktposition: primary.wktposition ?? supplemental.wktposition,
    filename: primary.filename ?? supplemental.filename,
    deploymentid: primary.deploymentid ?? supplemental.deploymentid,
    url: primary.url ?? supplemental.url,
    timestamp: primary.timestamp ?? supplemental.timestamp,
    x1: primary.x1 ?? supplemental.x1,
    x2: primary.x2 ?? supplemental.x2,
    y1: primary.y1 ?? supplemental.y1,
    y2: primary.y2 ?? supplemental.y2,
    supplementalMetadataPath: primary.supplementalMetadataPath ?? supplemental.metadataPath,
  }
}

function groupRowsByDetectionId(rows: AmiMetadataRow[]) {
  const out = new Map<string, AmiMetadataRow[]>()
  for (const row of rows) {
    if (!out.has(row.detectionid)) out.set(row.detectionid, [])
    out.get(row.detectionid)?.push(row)
  }
  return out
}

function groupRowsByAlgorithm(rows: AmiMetadataRow[]) {
  const out = new Map<string, AmiMetadataRow[]>()
  for (const row of rows) {
    const key = row.algorithm || 'ami'
    if (!out.has(key)) out.set(key, [])
    out.get(key)!.push(row)
  }
  return out
}

function selectDatasetAlgorithm(allRows: AmiMetadataRow[]): string {
  const byAlgorithm = new Map<string, AmiMetadataRow[]>()
  for (const row of allRows) {
    const key = row.algorithm || 'ami'
    if (!byAlgorithm.has(key)) byAlgorithm.set(key, [])
    byAlgorithm.get(key)!.push(row)
  }
  const ranked = [...byAlgorithm.entries()]
    .map(([algorithm, rows]) => {
      const ranks = [...new Set(rows.map((row) => normalizeTaxonLevel(row.taxonlevel)))]
      const deepestRankIndex = Math.max(
        ...ranks.map((rank) => TAXON_RANK_ORDER.indexOf(rank as (typeof TAXON_RANK_ORDER)[number])),
      )
      const deepestRank = TAXON_RANK_ORDER[deepestRankIndex]
      const bestScore = deepestRank
        ? Math.max(
            ...rows
              .filter((row) => normalizeTaxonLevel(row.taxonlevel) === deepestRank)
              .map((row) => row.score ?? Number.NEGATIVE_INFINITY),
          )
        : Number.NEGATIVE_INFINITY
      const maxTimestamp = Math.max(
        ...rows.map((row) => {
          const ts = row.timestamp
          if (typeof ts === 'bigint') return Number(ts)
          return (ts as number | null | undefined) ?? Number.NEGATIVE_INFINITY
        }),
      )
      return { algorithm, deepestRankIndex, bestScore, maxTimestamp, classifierPriority: amiClassifierPriority(algorithm) }
    })
    .sort((a, b) => {
      if (a.deepestRankIndex !== b.deepestRankIndex) return b.deepestRankIndex - a.deepestRankIndex
      if (a.maxTimestamp !== b.maxTimestamp) return b.maxTimestamp - a.maxTimestamp
      if (a.bestScore !== b.bestScore) return b.bestScore - a.bestScore
      if (a.classifierPriority !== b.classifierPriority) return a.classifierPriority - b.classifierPriority
      return a.algorithm.localeCompare(b.algorithm)
    })
  return ranked[0]?.algorithm ?? 'ami'
}

function classificationFromAlgorithmRows(params: {
  patchId: string
  algorithmRows: AmiMetadataRow[]
  allRowsForDetection: AmiMetadataRow[]
  classifiedAt: number | null
}): ClassificationRecord | null {
  const { patchId, algorithmRows, allRowsForDetection, classifiedAt } = params
  if (!algorithmRows.length) return null

  const primaryRank = DEEPEST_RANK_FIRST.find((rank) =>
    algorithmRows.some((row) => normalizeTaxonLevel(row.taxonlevel) === rank && row.label),
  )
  const primary = primaryRank
    ? algorithmRows
        .filter((row) => normalizeTaxonLevel(row.taxonlevel) === primaryRank && row.label)
        .sort((a, b) => (b.score ?? Number.NEGATIVE_INFINITY) - (a.score ?? Number.NEGATIVE_INFINITY))[0]
    : algorithmRows[0]
  if (!primary?.label) return null

  // Use only this algorithm's rows for taxonomy — mixing algorithms would produce
  // inconsistent classifications (e.g. species from one algorithm, genus from another).
  const taxonFields = taxonFieldsFromAmiRows(algorithmRows)
  const taxon = normalizeAmiTaxonSpecies({
    taxon: buildTaxonRecord({
      ...taxonFields,
      metadata: {
        extras: {
          ami_detection_id: patchId,
          ami_algorithms: uniqueStrings(allRowsForDetection.map((row) => row.algorithm)),
          ami_label_ids: uniqueStrings(allRowsForDetection.map((row) => row.labelid)),
          ami_selected_algorithm: primary.algorithm,
        },
      },
    }),
    speciesLabel: taxonFields.species,
    genus: taxonFields.genus,
  })

  return {
    patch_id: patchId,
    classifier_id: primary.algorithm || 'ami',
    classifier_type: 'bot',
    classification_type: 'taxon',
    label: primary.label,
    taxon,
    morphospecies: null,
    is_error: false,
    confidence: primary.score ?? null,
    classified_at: classifiedAt,
    source_bot_detection_id: patchId,
  }
}

function normalizeAmiTaxonSpecies(params: {
  taxon: ReturnType<typeof buildTaxonRecord>
  speciesLabel?: string
  genus?: string
}) {
  const { taxon, speciesLabel } = params
  if (!taxon || !speciesLabel) return taxon

  const parsed = parseBinomialSpeciesLabel(speciesLabel)
  if (!parsed) return taxon

  return {
    ...taxon,
    scientificName: `${parsed.genus} ${parsed.epithet}`,
    genus: parsed.genus,
    species: parsed.epithet,
  }
}

function parseBinomialSpeciesLabel(value: string) {
  const normalized = value.trim().replace(/\s+/g, ' ')
  const match = normalized.match(/^([A-Z][A-Za-z-]+)\s+([a-z][A-Za-z-]+)\b/)
  if (!match?.[1] || !match?.[2]) return null
  return { genus: match[1], epithet: match[2] }
}

function taxonFieldsFromAmiRows(rows: AmiMetadataRow[]) {
  const out: Record<string, string> = {}
  for (const rank of TAXON_RANK_ORDER) {
    const row = rows
      .filter((candidate) => normalizeTaxonLevel(candidate.taxonlevel) === rank && candidate.label)
      .sort((a, b) => (b.score ?? Number.NEGATIVE_INFINITY) - (a.score ?? Number.NEGATIVE_INFINITY))[0]
    if (row?.label) out[rank] = row.label
  }
  return out
}

function selectAmiClassifierRows(rows: AmiMetadataRow[]) {
  const byAlgorithm = new Map<string, AmiMetadataRow[]>()
  for (const row of rows) {
    const key = row.algorithm || 'ami'
    if (!byAlgorithm.has(key)) byAlgorithm.set(key, [])
    byAlgorithm.get(key)?.push(row)
  }

  const ranked = [...byAlgorithm.entries()]
    .map(([algorithm, algorithmRows]) => {
      const ranks = uniqueStrings(algorithmRows.map((row) => normalizeTaxonLevel(row.taxonlevel)))
      const deepestRankIndex = Math.max(...ranks.map((rank) => TAXON_RANK_ORDER.indexOf(rank as (typeof TAXON_RANK_ORDER)[number])))
      const deepestRank = TAXON_RANK_ORDER[deepestRankIndex]
      const primaryScore = deepestRank
        ? Math.max(
            ...algorithmRows
              .filter((row) => normalizeTaxonLevel(row.taxonlevel) === deepestRank)
              .map((row) => row.score ?? Number.NEGATIVE_INFINITY),
          )
        : Number.NEGATIVE_INFINITY
      const maxTimestamp = Math.max(
        ...algorithmRows.map((row) => {
          const ts = row.timestamp
          if (typeof ts === 'bigint') return Number(ts)
          return (ts as number | null | undefined) ?? Number.NEGATIVE_INFINITY
        }),
      )
      return {
        algorithm,
        rows: algorithmRows,
        rankCount: ranks.length,
        deepestRankIndex,
        primaryScore,
        maxTimestamp,
        classifierPriority: amiClassifierPriority(algorithm),
      }
    })
    .sort((a, b) => {
      // Prefer deepest rank, then most recent run, then highest score, then known priority list
      if (a.deepestRankIndex !== b.deepestRankIndex) return b.deepestRankIndex - a.deepestRankIndex
      if (a.maxTimestamp !== b.maxTimestamp) return b.maxTimestamp - a.maxTimestamp
      if (a.primaryScore !== b.primaryScore) return b.primaryScore - a.primaryScore
      if (a.classifierPriority !== b.classifierPriority) return a.classifierPriority - b.classifierPriority
      if (a.rankCount !== b.rankCount) return b.rankCount - a.rankCount
      return a.algorithm.localeCompare(b.algorithm)
    })

  return ranked[0]?.rows ?? rows
}

function amiClassifierPriority(algorithm: string) {
  const index = AMI_CLASSIFIER_PRIORITY.indexOf(algorithm as (typeof AMI_CLASSIFIER_PRIORITY)[number])
  return index >= 0 ? index : AMI_CLASSIFIER_PRIORITY.length
}

function parseAmiCropPath(relativePath: string, fallbackProjectId?: string): AmiCrop | null {
  const normalized = relativePath.replaceAll('\\', '/')
  const parts = normalized.split('/').filter(Boolean)

  const patchFileName = parts[parts.length - 1] ?? ''
  const match = patchFileName.match(/^(.*)_crop_([0-9a-fA-F-]+)\.(jpg|jpeg|png)$/i)
  if (!match) return null

  const processedIndex = parts.findIndex((part) => part.toLowerCase() === '_processed')
  // Allow processedIndex === 0: _processed is at the root of io.source (i.e. the
  // user opened the project folder directly, so there is no project segment before it).
  if (processedIndex >= 0) {
    return parseAmiProcessedCropPath({ normalized, parts, processedIndex, patchFileName, match, fallbackProjectId })
  }

  const cropsIndex = parts.findIndex((part) => part.toLowerCase() === '_crops_')
  if (cropsIndex >= 2) {
    return parseAmiCropsCropPath({ normalized, parts, cropsIndex, patchFileName, match })
  }

  return null
}

function parseAmiProcessedCropPath(params: {
  normalized: string
  parts: string[]
  processedIndex: number
  patchFileName: string
  match: RegExpMatchArray
  fallbackProjectId?: string
}): AmiCrop | null {
  const { normalized, parts, processedIndex, patchFileName, match, fallbackProjectId } = params
  // When processedIndex === 0, _processed is at the root of io.source (the project
  // folder itself is the source root), so there is no project segment before it.
  // Use fallbackProjectId (typically the dataset id) in that case.
  const projectId = processedIndex >= 1 ? parts[processedIndex - 1] : fallbackProjectId
  const year = parts[processedIndex + 1]
  const country = parts[processedIndex + 2]
  const code = parts[processedIndex + 3]
  if (!projectId || !year || !country || !code) return null

  const sourceFileName = `${match[1]}.${match[3]}`
  // For processedIndex === 0, there is no project prefix in the source path.
  const sourcePhotoRelativePath = joinRelative(...parts.slice(0, processedIndex), year, country, code, sourceFileName)

  return {
    relativePath: normalized,
    patchFileName,
    detectionId: match[2],
    projectId,
    year,
    country,
    code,
    sourceFileName,
    sourcePhotoRelativePath,
  }
}

function parseAmiCropsCropPath(params: {
  normalized: string
  parts: string[]
  cropsIndex: number
  patchFileName: string
  match: RegExpMatchArray
}): AmiCrop | null {
  const { normalized, parts, cropsIndex, patchFileName, match } = params
  const projectId = parts[cropsIndex - 2]
  const year = parts[cropsIndex - 1]
  const country = parts[cropsIndex + 1]
  const code = parts[cropsIndex + 2]
  if (!projectId || !year || !country || !code) return null

  const sourceFileName = `${match[1]}.${match[3]}`
  const sourcePhotoRelativePath = joinRelative(...parts.slice(0, cropsIndex), country, code, sourceFileName)

  return {
    relativePath: normalized,
    patchFileName,
    detectionId: match[2],
    projectId,
    year,
    country,
    code,
    sourceFileName,
    sourcePhotoRelativePath,
  }
}

function deploymentIdForAmiCrop(params: {
  crop: AmiCrop
  representative?: AmiMetadataRow
}) {
  const { crop, representative } = params
  return `${representative?.projectid || crop.projectId}_${crop.country}_${representative?.code || crop.code}_${representative?.year ?? crop.year}`
}

function capturedAtFromAmi(params: {
  row?: AmiMetadataRow
  crop: AmiCrop
}) {
  const { row, crop } = params
  const timestamp = row?.timestamp
  if (typeof timestamp === 'bigint') return new Date(Number(timestamp) * 1000).toISOString()
  if (typeof timestamp === 'number' && Number.isFinite(timestamp)) {
    return new Date(timestamp > 10_000_000_000 ? timestamp : timestamp * 1000).toISOString()
  }
  if (typeof timestamp === 'string' && timestamp.trim()) {
    const parsed = Date.parse(timestamp)
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString()
  }

  const date = nightDateFromSourceFileName(crop.sourceFileName)
  return date ? `${date}T00:00:00.000Z` : undefined
}

function nightDateFromCapturedAt(value?: string) {
  if (!value) return undefined
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/)
  return match?.[1]
}

function nightDateFromSourceFileName(fileName: string) {
  const match = fileName.match(/^(\d{4})(\d{2})(\d{2})/)
  if (!match) return undefined
  return `${match[1]}-${match[2]}-${match[3]}`
}

function cropPointsFromAmiRow(row?: AmiMetadataRow) {
  if (!row) return undefined
  const { x1, x2, y1, y2 } = row
  if (![x1, x2, y1, y2].every((value) => typeof value === 'number' && Number.isFinite(value))) {
    return undefined
  }
  return [
    [x1 as number, y1 as number],
    [x2 as number, y1 as number],
    [x2 as number, y2 as number],
    [x1 as number, y2 as number],
  ]
}

function metadataPathsFromAmiRows(rows: AmiMetadataRow[]) {
  return uniqueStrings(rows.flatMap((row) => [row.metadataPath, row.supplementalMetadataPath]))
}

function sourceFileNameFromCropUrl(value?: string) {
  const fileName = value?.split('/').pop() ?? ''
  const match = fileName.match(/^(.*)_crop_[^.]+\.(jpg|jpeg|png)$/i)
  return match ? `${match[1]}.${match[2]}` : ''
}

function cleanAmiOrderLabel(label: string): string {
  // "Lepidoptera Macros" / "Diptera Brachycera" → take only the first word (the
  // actual order name); sub-order qualifiers used by AMI are not standard taxon ranks.
  return label.trim().split(/\s+/)[0] ?? label
}

function normalizeTaxonLevel(value?: string) {
  const normalized = value?.trim().toLowerCase()
  if (!normalized) return ''
  if (normalized === 'klass') return 'class'
  return TAXON_RANK_ORDER.includes(normalized as (typeof TAXON_RANK_ORDER)[number]) ? normalized : ''
}

function parseCsvRecords(text: string): Array<Record<string, string>> {
  const rows = parseCsvRows(text)
  const [headers, ...body] = rows
  if (!headers?.length) return []

  return body
    .filter((row) => row.some((cell) => cell.trim()))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header.trim(), row[index]?.trim() ?? ''])))
}

function parseCsvRows(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    const next = text[index + 1]

    if (char === '"' && inQuotes && next === '"') {
      cell += '"'
      index += 1
      continue
    }
    if (char === '"') {
      inQuotes = !inQuotes
      continue
    }
    if (char === ',' && !inQuotes) {
      row.push(cell)
      cell = ''
      continue
    }
    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      continue
    }
    cell += char
  }

  row.push(cell)
  rows.push(row)
  return rows
}

function stringValue(value: unknown) {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed || undefined
  }
  if (typeof value === 'number' || typeof value === 'bigint') return String(value)
  return undefined
}

function numberValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'bigint') return Number(value)
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function booleanValue(value: unknown) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string' && value.trim()) {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true') return true
    if (normalized === 'false') return false
  }
  return undefined
}

function bigintStringNumberValue(value: unknown) {
  if (typeof value === 'bigint' || typeof value === 'number') return value
  return stringValue(value)
}

function uniqueStrings(values: Array<string | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => !!value))]
}

function deduplicateTaggedByFileName<T extends { metadataPath: string }>(entries: T[]): T[] {
  const seen = new Set<string>()
  return entries.filter((entry) => {
    const base = entry.metadataPath.split('/').pop() ?? entry.metadataPath
    if (seen.has(base)) return false
    seen.add(base)
    return true
  })
}
