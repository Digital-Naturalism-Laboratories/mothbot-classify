import { parquetMetadataAsync, parquetReadObjects } from 'hyparquet'
import { buildTaxonRecord } from '~/models/taxonomy/builder'
import type { ClassificationRecord, PatchRecord, PatchSourceRecord, DeploymentRecord, CameraDayRecord } from '../../records'
import { flattenClassificationFiles, resolveCurrentClassifications } from '../../resolve-classifications'
import { isPatchImageFileName, isCsvFileName, isParquetFileName } from '~/features/data-flow/1.ingest/classify-dataset-folder'
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
]

const AMI_PARQUET_ROW_BATCH_SIZE = 50_000
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

  const cropPaths = await io.source.findFiles((name) => isPatchImageFileName(name))
  const crops = cropPaths
    .map(parseAmiCropPath)
    .filter((crop): crop is AmiCrop => !!crop)
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath))

  if (!crops.length) {
    throw new Error('No AMI processed crop images found under a _processed/ folder.')
  }

  const cropIds = new Set(crops.map((crop) => crop.detectionId))

  onProgress?.({
    phase: 'scan',
    message: progressMessage,
    description: `Found ${crops.length.toLocaleString()} processed AMI crop${crops.length === 1 ? '' : 's'}`,
  })

  const metadataRows = await readAmiMetadataRows({ io, cropIds, onProgress, progressMessage })
  const rowsByDetectionId = groupRowsByDetectionId(metadataRows)

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
      source_photo_asset_path: crop.sourcePhotoRelativePath,
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

    const classification = classificationFromAmiRows({ patchId: crop.detectionId, rows })
    if (classification) botRows.push(classification)
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
  const parquetPaths = (await io.source.findFiles((name) => isParquetFileName(name))).sort()
  const csvPaths = (await io.source.findFiles((name) => isCsvFileName(name))).sort()

  const parquetRows: AmiMetadataRow[] = []
  for (const metadataPath of parquetPaths) {
    onProgress?.({
      phase: 'scan',
      message: progressMessage,
      description: `Reading AMI parquet metadata ${metadataPath}...`,
    })

    const rows = await readAmiParquetMetadataRows({ io, metadataPath, cropIds })
    parquetRows.push(...rows)
  }

  const parquetDetectionIds = new Set(parquetRows.map((row) => row.detectionid))
  const needsCsvSupplement =
    parquetRows.length === 0 ||
    parquetRows.some((row) => !row.cropurl) ||
    [...cropIds].some((cropId) => !parquetDetectionIds.has(cropId))

  if (!needsCsvSupplement) return parquetRows

  const csvRows: AmiMetadataRow[] = []
  for (const metadataPath of csvPaths) {
    onProgress?.({
      phase: 'scan',
      message: progressMessage,
      description: `Reading AMI CSV metadata ${metadataPath}...`,
    })

    csvRows.push(...readAmiCsvMetadataRows({
      text: await io.source.readText(metadataPath),
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
  io: DinalabAdapterIO
  metadataPath: string
  cropIds: Set<string>
}): Promise<AmiMetadataRow[]> {
  const { io, metadataPath, cropIds } = params
  const buffer = await io.source.readBinary(metadataPath)
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
    const row = normalizeAmiMetadataRow({
      row: {
        detectionid: record.detectionid,
        taxonlevel: record.taxonlevel || (record.orderlabel ? 'order' : ''),
        label: record.label || record.orderlabel,
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
    label: stringValue(row.label),
    labelid: stringValue(row.labelid),
    score: numberValue(row.score),
    abovethreshold: booleanValue(row.abovethreshold),
    algorithm: stringValue(row.algorithm),
    sourceimageid: stringValue(row.sourceimageid),
    cropurl: stringValue(row.cropurl),
    code: stringValue(row.code),
    year: stringValue(row.year) || numberValue(row.year),
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
  const merged = primaryRows.map((row) => {
    const supplemental = supplementalByDetectionId.get(row.detectionid)?.[0]
    return supplemental ? mergeMissingAmiRowFields({ primary: row, supplemental }) : row
  })

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

function classificationFromAmiRows(params: {
  patchId: string
  rows: AmiMetadataRow[]
}): ClassificationRecord | null {
  const { patchId, rows } = params
  if (!rows.length) return null

  const selectedRows = selectAmiClassifierRows(rows)
  const primaryRank = DEEPEST_RANK_FIRST.find((rank) =>
    selectedRows.some((row) => normalizeTaxonLevel(row.taxonlevel) === rank && row.label),
  )
  const primary = primaryRank
    ? selectedRows
        .filter((row) => normalizeTaxonLevel(row.taxonlevel) === primaryRank && row.label)
        .sort((a, b) => (b.score ?? Number.NEGATIVE_INFINITY) - (a.score ?? Number.NEGATIVE_INFINITY))[0]
    : selectedRows[0]
  if (!primary?.label) return null

  const taxonFields = taxonFieldsFromAmiRows(selectedRows)
  const taxon = normalizeAmiTaxonSpecies({
    taxon: buildTaxonRecord({
      ...taxonFields,
      metadata: {
        extras: {
          ami_detection_id: patchId,
          ami_algorithms: uniqueStrings(rows.map((row) => row.algorithm)),
          ami_label_ids: uniqueStrings(rows.map((row) => row.labelid)),
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
    classified_at: null,
    source_bot_detection_id: patchId,
  }
}

function normalizeAmiTaxonSpecies(params: {
  taxon: ReturnType<typeof buildTaxonRecord>
  speciesLabel?: string
  genus?: string
}) {
  const { taxon, speciesLabel, genus } = params
  if (!taxon || !speciesLabel || !genus) return taxon

  const normalizedSpecies = speciesLabel.trim()
  const normalizedGenus = genus.trim()
  const prefix = `${normalizedGenus} `
  if (!normalizedSpecies.toLowerCase().startsWith(prefix.toLowerCase())) return taxon

  const epithet = normalizedSpecies.slice(prefix.length).trim()
  if (!epithet) return taxon

  return {
    ...taxon,
    scientificName: normalizedSpecies,
    species: epithet,
  }
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
      return { algorithm, rows: algorithmRows, rankCount: ranks.length, deepestRankIndex, primaryScore }
    })
    .sort((a, b) => {
      if (a.rankCount !== b.rankCount) return b.rankCount - a.rankCount
      if (a.deepestRankIndex !== b.deepestRankIndex) return b.deepestRankIndex - a.deepestRankIndex
      if (a.primaryScore !== b.primaryScore) return b.primaryScore - a.primaryScore
      return a.algorithm.localeCompare(b.algorithm)
    })

  return ranked[0]?.rows ?? rows
}

function parseAmiCropPath(relativePath: string): AmiCrop | null {
  const normalized = relativePath.replaceAll('\\', '/')
  const parts = normalized.split('/').filter(Boolean)
  const processedIndex = parts.findIndex((part) => part.toLowerCase() === '_processed')
  if (processedIndex < 1) return null

  const patchFileName = parts[parts.length - 1] ?? ''
  const match = patchFileName.match(/^(.*)_crop_([0-9a-fA-F-]+)\.(jpg|jpeg|png)$/i)
  if (!match) return null

  const projectId = parts[processedIndex - 1]
  const year = parts[processedIndex + 1]
  const country = parts[processedIndex + 2]
  const code = parts[processedIndex + 3]
  if (!projectId || !year || !country || !code) return null

  const sourceFileName = `${match[1]}.${match[3]}`
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
