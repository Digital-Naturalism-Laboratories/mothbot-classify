import { ensureReadWritePermission, persistenceConstants } from '~/features/data-flow/3.persist/files.persistence'
import {
  deriveTaxonNameFromDetection,
  extractTaxonMetadataFromDetection,
  extractTaxonomyFieldsFromDetection,
} from '~/models/taxonomy/extract'
import { getValidScientificNameForExport } from '~/models/taxonomy/morphospecies'
import { patchesStore, type PatchEntity } from '~/stores/entities/5.patches'
import { getDetectionsForLeafGroup, type DetectionEntity } from '~/stores/entities/detections'
import { photosStore, type PhotoEntity } from '~/stores/entities/photos'
import { userSessionStore } from '~/stores/ui'
import { objectsToCSV } from '~/utils/csv'
import { fsaaWriteText, type FileSystemDirectoryHandleLike } from '~/utils/fsaa'
import { idbGet } from '~/utils/index-db'
import { getNightDiskPathFromPhotos, getPhotoBaseFromPhotoId } from '~/utils/paths'
import { buildExportFileNameParts, formatTodayYyyyMm_Dd, getProjectExportPath } from './export-utils'

const DARWIN_COLUMNS = [
  // Taxonomy columns
  'species_list_doi',
  'kingdom',
  'phylum',
  'class',
  'order',
  'family',
  'genus',
  'species',
  'morphospecies',
  'taxonID',
  'commonName',
  'scientificName',
  'name',

  // Mothbox specific Metadata
  'deployment',
  'image_id',
  'identifiedBy',
  'detectionBy',
  'detection_confidence',
  'ID_confidence',
  'mothbox',
  'filepath',
  'original_mothbox_identifciation',
  'cluster_ID',
  'temporal_subcluster_ID',
  'width',
  'height',
  'area',

  // Date/Time
  'eventDate',
  'eventTime',
  'UTCOFFSET',
  'verbatimEventDate',

  // Other
  'basisOfRecord',
  'datasetID',
  'parentEventID',
  'eventID',
  'occurrenceID',

  // TODO. In the future we should have taxonomy at the end
] as const

type DarwinColumn = (typeof DARWIN_COLUMNS)[number]
type DarwinRow = Record<DarwinColumn, string>

export async function exportNightDarwinCSV(params: { leafGroupId: string }): Promise<boolean> {
  const { leafGroupId } = params
  if (!leafGroupId) return false
  console.log('🏁 exportNightDarwinCSV: start', { leafGroupId })

  const root = (await idbGet(
    persistenceConstants.IDB_NAME,
    persistenceConstants.IDB_STORE,
    'projectsRoot',
  )) as FileSystemDirectoryHandleLike | null
  if (!root) return false

  const granted = await ensureReadWritePermission(root as any)
  if (!granted) return false

  const generated = await generateNightDarwinCSVString({ leafGroupId })
  if (!generated) return false
  const { csv } = generated

  const fileName = buildNightExportFileName({ leafGroupId })
  const projectExportPath = getProjectExportPath({ leafGroupId })
  const pathParts = [...projectExportPath.split('/').filter(Boolean), fileName]

  await fsaaWriteText(root, pathParts, csv)
  console.log('✅ exportNightDarwinCSV: written file', { path: pathParts.join('/') })

  return true
}

export async function openNightFolderPicker(params: { leafGroupId: string }): Promise<boolean> {
  const { leafGroupId } = params
  if (!leafGroupId) return false

  const root = (await idbGet(
    persistenceConstants.IDB_NAME,
    persistenceConstants.IDB_STORE,
    'projectsRoot',
  )) as FileSystemDirectoryHandleLike | null
  if (!root) return false

  const granted = await ensureReadWritePermission(root as any)
  if (!granted) return false

  const allPhotos = photosStore.get() || {}
  const photos = Object.values(allPhotos).filter((p) => p.leafGroupId === leafGroupId)
  if (!photos.length) return false

  const nightDiskPath = getNightDiskPathFromPhotos({ photos })
  if (!nightDiskPath) return false

  const dirParts = nightDiskPath.split('/').filter(Boolean)

  let current: FileSystemDirectoryHandleLike | null = root
  for (const part of dirParts) {
    const next = (await current?.getDirectoryHandle?.(part, { create: false })) as FileSystemDirectoryHandleLike | null
    if (!next) return false
    current = next
  }

  const canShow = typeof (window as unknown as { showDirectoryPicker?: unknown })?.showDirectoryPicker === 'function'
  if (!canShow) return false

  try {
    // @ts-expect-error: startIn can accept a FileSystemHandle; TS lib may be behind
    await window.showDirectoryPicker?.({ startIn: current as any })
    return true
  } catch {
    return false
  }
}

export async function copyNightFolderPathToClipboard(params: { leafGroupId: string }): Promise<boolean> {
  const { leafGroupId } = params
  if (!leafGroupId) return false

  const allPhotos = photosStore.get() || {}
  const photos = Object.values(allPhotos).filter((p) => p.leafGroupId === leafGroupId)
  if (!photos.length) return false

  const nightDiskPath = getNightDiskPathFromPhotos({ photos })
  if (!nightDiskPath) return false

  const ok = await writeTextToClipboard(nightDiskPath)
  console.log(ok ? '📋 Copied night folder path' : '🚨 Failed to copy folder path', { nightDiskPath })
  return ok
}

export async function copyNightExportFilePathToClipboard(params: { leafGroupId: string }): Promise<boolean> {
  const { leafGroupId } = params
  if (!leafGroupId) return false

  const fileName = buildNightExportFileName({ leafGroupId })
  const projectExportPath = getProjectExportPath({ leafGroupId })
  const fullPath = [...projectExportPath.split('/').filter(Boolean), fileName].join('/')

  const ok = await writeTextToClipboard(fullPath)
  console.log(ok ? '📋 Copied export file path' : '🚨 Failed to copy export file path', { fullPath })
  return ok
}

async function writeTextToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator?.clipboard?.writeText === 'function') {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    console.error('Error writing text to clipboard')
  }

  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', 'true')
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    document.body.appendChild(textarea)
    textarea.select()
    const success = document.execCommand('copy')
    textarea.remove()
    return success
  } catch {
    return false
  }
}

export async function generateNightDarwinCSVString(params: { leafGroupId: string }): Promise<{ csv: string; nightDiskPath: string } | null> {
  const { leafGroupId } = params
  if (!leafGroupId) return null

  const allPhotos = photosStore.get() || {}
  const allPatches = patchesStore.get() || {}

  const detections = getDetectionsForLeafGroup(leafGroupId)
  console.log('📥 Export: incoming detections', { leafGroupId, count: detections.length, detections })

  const photos = Object.values(allPhotos).filter((p) => p.leafGroupId === leafGroupId)
  if (!photos.length) return null

  const nightDiskPath = getNightDiskPathFromPhotos({ photos })
  if (!nightDiskPath) return null

  const rowObjs: DarwinRow[] = []
  for (const d of detections) {
    const patch = allPatches[d.patchId]
    const photo = allPhotos[d.photoId]
    const rowObj = buildDarwinShapeFromDetection({ detection: d, patch, photo, leafGroupId, nightDiskPath })
    rowObjs.push(rowObj)
  }

  console.log('📤 Export: output rows', { leafGroupId, count: rowObjs.length, rows: rowObjs })

  // Handle empty detections case: return CSV with headers only
  if (rowObjs.length === 0) {
    const headersLine = DARWIN_COLUMNS.join(',')
    const csv = headersLine
    return { csv, nightDiskPath }
  }

  const csv = objectsToCSV({ objects: rowObjs as any[], headers: [...(DARWIN_COLUMNS as readonly string[])] as string[] })
  return { csv, nightDiskPath }
}

function buildNightExportFileName(params: { leafGroupId: string }): string {
  const { leafGroupId } = params
  const { datasetName, siteName, deploymentName, nightName } = buildExportFileNameParts({ leafGroupId })
  const today = formatTodayYyyyMm_Dd()

  const fileName = siteName
    ? `${datasetName}_${siteName}_${deploymentName}_${nightName}_exported-${today}.csv`
    : `${datasetName}_${deploymentName}_${nightName}_exported-${today}.csv`
  return fileName
}

function parseNightIdParts(params: { leafGroupId: string }): { project: string; deployment: string; night: string } | null {
  const { leafGroupId } = params
  if (!leafGroupId) return null

  const parts = leafGroupId.split('/').filter(Boolean)
  // leafGroupId format: project/deployment/night
  if (parts.length < 3) return null

  const project = parts[0] || ''
  const deployment = parts[1] || ''
  const night = parts[2] || ''

  if (!project || !deployment || !night) return null

  return { project, deployment, night }
}

export function buildDarwinShapeFromDetection(params: {
  detection: DetectionEntity
  patch?: PatchEntity
  photo?: PhotoEntity
  leafGroupId: string
  nightDiskPath: string
}): DarwinRow {
  const { detection, patch, photo, leafGroupId, nightDiskPath } = params
  const baseName = getPhotoBaseFromPhotoId(photo?.id || '')
  const capturedAt = typeof patch?.capturedAt === 'string' ? patch.capturedAt.trim() : ''
  const verbatimEventDate = extractVerbatimEventDateFromPhotoBase({ baseName }) || capturedAt
  const { eventDate, eventTime, utcOffset } = deriveEventDateTime({ verbatimEventDate })
  const filepath = patch?.imageFile?.path || ''
  const image_id = patch?.id || ''

  // Use shared taxonomy utilities
  const taxonomyFields = extractTaxonomyFieldsFromDetection({ detection })
  const taxonMetadata = extractTaxonMetadataFromDetection({ detection })

  // Darwin CSV uses fixed values for kingdom/phylum/class, unless it's an error
  const isError = detection?.isError === true
  const kingdom = isError ? '' : 'Animalia'
  const phylum = isError ? '' : 'Arthropoda'
  const klass = isError ? '' : 'Insecta'
  const order = taxonomyFields.order || ''
  const family = taxonomyFields.family || ''
  const genus = taxonomyFields.genus || ''
  const species = taxonomyFields.species || ''
  const morphospecies = detection?.morphospecies || ''
  const taxonID = String(taxonMetadata.taxonID || '')
  const commonName = taxonMetadata.vernacularName || ''
  const species_list_doi = String(taxonMetadata.speciesListDOI || '')

  // For errors, scientificName should be blank, but name should be "ERROR"
  // Use validated scientificName (no morphospecies/numbers)
  const scientificName = isError
    ? ''
    : getValidScientificNameForExport({
        taxon: detection?.taxon,
        morphospecies: detection?.morphospecies,
        label: detection?.label,
      })
  const name = isError ? 'ERROR' : deriveTaxonNameFromDetection({ detection })

  const nightParts = parseNightIdParts({ leafGroupId })
  const datasetID = nightParts ? `${nightParts.project}_${nightParts.deployment}_${nightParts.night}` : leafGroupId.replaceAll('/', '_')
  const parentEventID = nightParts ? `${nightParts.project}_${nightParts.deployment}` : datasetID
  const eventID = photo?.id || ''
  const occurrenceID = patch?.id || ''

  // Deployment is datasetID without the trailing night date segment
  const deployment = extractDeploymentFromDatasetID({ datasetID })
  const mothbox = extractMothboxFromNightDiskPath({ nightDiskPath })
  const detectionBy = detection?.botClassifierId || extractDetectionByFromPatchId({ patchId: patch?.id || '', photoBase: baseName })
  const detection_confidence = detection?.score != null ? String(detection.score) : ''
  const userInitials = userSessionStore.get()?.initials || ''
  const identifiedBy = detection?.detectedBy === 'user' ? userInitials : ''
  const ID_confidence = ''
  const geometryFields = buildGeometryExportFields({ detection })

  const row: DarwinRow = {
    basisOfRecord: 'MachineObservation',
    datasetID,
    parentEventID,
    eventID,
    occurrenceID,
    verbatimEventDate,
    eventDate,
    eventTime,
    UTCOFFSET: utcOffset,
    detectionBy,
    detection_confidence,
    identifiedBy,
    ID_confidence,
    kingdom,
    phylum,
    class: klass,
    order,
    family,
    genus,
    species,
    morphospecies,
    taxonID,
    commonName,
    scientificName,
    name,
    species_list_doi,
    filepath,
    mothbox,
    original_mothbox_identifciation: detection?.originalMothboxLabel || '',
    ...geometryFields,
    deployment,
    image_id,
  }
  return row
}

// FSAA writer moved to utils/fsaa.ts

function extractVerbatimEventDateFromPhotoBase(params: { baseName?: string }) {
  const base = (params?.baseName ?? '').trim()
  if (!base) return ''

  const match = base.match(/(\d{4}_\d{2}_\d{2}__\d{2}_\d{2}_\d{2})/)
  const verbatim = match?.[1] || ''
  return verbatim
}

function deriveEventDateTime(params: { verbatimEventDate: string }): { eventDate: string; eventTime: string; utcOffset: string } {
  const { verbatimEventDate } = params

  if (!verbatimEventDate) return { eventDate: '', eventTime: '', utcOffset: '' }
  const m = verbatimEventDate.match(/(\d{4})_(\d{2})_(\d{2})__([0-9]{2})_([0-9]{2})_([0-9]{2})/)
  if (!m) return deriveIsoEventDateTime({ verbatimEventDate })
  const yyyy = m[1]
  const MM = m[2]
  const dd = m[3]
  const hh = m[4]
  const mm = m[5]
  const ss = m[6]
  const eventDate = `${yyyy}-${MM}-${dd}`
  const eventTime = `${hh}:${mm}:${ss}`
  const utcOffset = ''
  return { eventDate, eventTime, utcOffset }
}

function deriveIsoEventDateTime(params: { verbatimEventDate: string }): { eventDate: string; eventTime: string; utcOffset: string } {
  const trimmed = params.verbatimEventDate.trim()
  const match = trimmed.match(
    /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.\d+)?(?:\s*(Z)|([+-]\d{2}(?::?\d{2})?))?$/i,
  )
  if (match) {
    return {
      eventDate: match[1],
      eventTime: match[2],
      utcOffset: match[3] ? '+00:00' : normalizeUtcOffset(match[4]),
    }
  }

  const parsed = Date.parse(trimmed)
  if (!Number.isFinite(parsed)) return { eventDate: '', eventTime: '', utcOffset: '' }

  const iso = new Date(parsed).toISOString()
  return {
    eventDate: iso.slice(0, 10),
    eventTime: iso.slice(11, 19),
    utcOffset: '',
  }
}

function normalizeUtcOffset(value?: string): string {
  if (!value) return ''
  if (/^[+-]\d{2}$/.test(value)) return `${value}:00`
  const compact = value.match(/^([+-]\d{2})(\d{2})$/)
  if (compact) return `${compact[1]}:${compact[2]}`
  return value
}

function extractMothboxFromNightDiskPath(params: { nightDiskPath: string }): string {
  const { nightDiskPath } = params

  const norm = String(nightDiskPath || '')
    .replaceAll('\\', '/')
    .replace(/^\/+/, '')
  const parts = norm.split('/').filter(Boolean)

  if (parts.length < 2) return ''

  const deploymentFolder = parts[parts.length - 2]
  const m = deploymentFolder.match(/^(.*)_(\d{4}-\d{2}-\d{2})$/)
  const beforeDate = m ? m[1] : deploymentFolder
  const segs = beforeDate.split('_').filter(Boolean)
  const device = segs[segs.length - 1] || ''
  return device
}

function extractDetectionByFromPatchId(params: { patchId: string; photoBase: string }): string {
  const { patchId, photoBase } = params

  let name = (patchId || '').replace(/\.jpg$/i, '')
  const prefix = `${photoBase}_`

  if (photoBase && name.startsWith(prefix)) name = name.slice(prefix.length)
  const idx = name.indexOf('_')

  if (idx >= 0) name = name.slice(idx + 1)
  return name
}

function buildGeometryExportFields(params: { detection: DetectionEntity }) {
  const { detection } = params
  const clusterFields = deriveClusterExportFields({ clusterId: detection?.clusterId })
  const patchSizeFields = derivePatchDimensionsFromPoints({ points: detection?.points })

  return {
    cluster_ID: clusterFields.clusterId,
    temporal_subcluster_ID: clusterFields.temporalSubclusterId,
    width: patchSizeFields.width,
    height: patchSizeFields.height,
    area: patchSizeFields.area,
  }
}

function deriveClusterExportFields(params: { clusterId?: number | null }) {
  const { clusterId } = params
  if (typeof clusterId !== 'number' || !Number.isFinite(clusterId) || clusterId < 0) {
    return { clusterId: '', temporalSubclusterId: '' }
  }

  const clusterIdString = String(clusterId)
  const [topLevelId, subclusterId = ''] = clusterIdString.split('.')
  const temporalSubclusterId = subclusterId.replace(/^0+/, '')

  return {
    clusterId: topLevelId || '',
    temporalSubclusterId,
  }
}

function derivePatchDimensionsFromPoints(params: { points?: number[][] }) {
  const { points } = params
  if (!Array.isArray(points) || points.length < 2) {
    return { width: '', height: '', area: '' }
  }

  const edgeLengths = getEdgeLengths({ points })
  if (edgeLengths.length < 2) {
    return { width: '', height: '', area: '' }
  }

  const width = Math.round(Math.min(...edgeLengths))
  const height = Math.round(Math.max(...edgeLengths))
  const area = width * height

  return {
    width: String(width),
    height: String(height),
    area: String(area),
  }
}

function getEdgeLengths(params: { points: number[][] }) {
  const { points } = params
  const edgeLengths: number[] = []

  for (let i = 0; i < points.length; i++) {
    const start = points[i]
    const end = points[(i + 1) % points.length]
    const startX = typeof start?.[0] === 'number' ? start[0] : null
    const startY = typeof start?.[1] === 'number' ? start[1] : null
    const endX = typeof end?.[0] === 'number' ? end[0] : null
    const endY = typeof end?.[1] === 'number' ? end[1] : null

    if (startX == null || startY == null || endX == null || endY == null) continue

    const distance = Math.hypot(endX - startX, endY - startY)
    if (distance > 0) edgeLengths.push(distance)
  }

  return edgeLengths
}

/**
 * Extracts deployment from datasetID by removing the trailing night date segment.
 * Example: "Dinacon2025_Les_BeachPalm_grupoKite_2025-06-23_2025-06-22" -> "Dinacon2025_Les_BeachPalm_grupoKite_2025-06-23"
 * The last segment is typically the night date (YYYY-MM-DD format).
 */
function extractDeploymentFromDatasetID(params: { datasetID: string }): string {
  const { datasetID } = params

  if (!datasetID) return ''

  // Split by underscore and check if last segment is a date (YYYY-MM-DD)
  const segments = datasetID.split('_')
  if (segments.length < 2) return datasetID

  const lastSegment = segments[segments.length - 1]
  const isDate = /^\d{4}-\d{2}-\d{2}$/.test(lastSegment || '')

  if (isDate) {
    // Remove the last segment (night date)
    const deployment = segments.slice(0, -1).join('_')
    return deployment
  }

  return datasetID
}
