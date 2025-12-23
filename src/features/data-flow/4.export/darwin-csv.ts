import { ensureReadWritePermission, persistenceConstants } from '~/features/data-flow/3.persist/files.persistence'
import {
  deriveTaxonNameFromDetection,
  extractTaxonMetadataFromDetection,
  extractTaxonomyFieldsFromDetection,
} from '~/models/taxonomy/extract'
import { getValidScientificNameForExport } from '~/models/taxonomy/morphospecies'
import { patchesStore, type PatchEntity } from '~/stores/entities/5.patches'
import { getDetectionsForNight, type DetectionEntity } from '~/stores/entities/detections'
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

export async function exportNightDarwinCSV(params: { nightId: string }): Promise<boolean> {
  const { nightId } = params
  if (!nightId) return false
  console.log('🏁 exportNightDarwinCSV: start', { nightId })

  const root = (await idbGet(
    persistenceConstants.IDB_NAME,
    persistenceConstants.IDB_STORE,
    'projectsRoot',
  )) as FileSystemDirectoryHandleLike | null
  if (!root) return false

  const granted = await ensureReadWritePermission(root as any)
  if (!granted) return false

  const generated = await generateNightDarwinCSVString({ nightId })
  if (!generated) return false
  const { csv } = generated

  const fileName = buildNightExportFileName({ nightId })
  const projectExportPath = getProjectExportPath({ nightId })
  const pathParts = [...projectExportPath.split('/').filter(Boolean), fileName]

  await fsaaWriteText(root, pathParts, csv)
  console.log('✅ exportNightDarwinCSV: written file', { path: pathParts.join('/') })

  return true
}

export async function openNightFolderPicker(params: { nightId: string }): Promise<boolean> {
  const { nightId } = params
  if (!nightId) return false

  const root = (await idbGet(
    persistenceConstants.IDB_NAME,
    persistenceConstants.IDB_STORE,
    'projectsRoot',
  )) as FileSystemDirectoryHandleLike | null
  if (!root) return false

  const granted = await ensureReadWritePermission(root as any)
  if (!granted) return false

  const allPhotos = photosStore.get() || {}
  const photos = Object.values(allPhotos).filter((p) => p.nightId === nightId)
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

export async function copyNightFolderPathToClipboard(params: { nightId: string }): Promise<boolean> {
  const { nightId } = params
  if (!nightId) return false

  const allPhotos = photosStore.get() || {}
  const photos = Object.values(allPhotos).filter((p) => p.nightId === nightId)
  if (!photos.length) return false

  const nightDiskPath = getNightDiskPathFromPhotos({ photos })
  if (!nightDiskPath) return false

  const ok = await writeTextToClipboard(nightDiskPath)
  console.log(ok ? '📋 Copied night folder path' : '🚨 Failed to copy folder path', { nightDiskPath })
  return ok
}

export async function copyNightExportFilePathToClipboard(params: { nightId: string }): Promise<boolean> {
  const { nightId } = params
  if (!nightId) return false

  const fileName = buildNightExportFileName({ nightId })
  const projectExportPath = getProjectExportPath({ nightId })
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

export async function generateNightDarwinCSVString(params: { nightId: string }): Promise<{ csv: string; nightDiskPath: string } | null> {
  const { nightId } = params
  if (!nightId) return null

  const allPhotos = photosStore.get() || {}
  const allPatches = patchesStore.get() || {}

  const detections = getDetectionsForNight(nightId)
  console.log('📥 Export: incoming detections', { nightId, count: detections.length, detections })

  const photos = Object.values(allPhotos).filter((p) => p.nightId === nightId)
  if (!photos.length) return null

  const nightDiskPath = getNightDiskPathFromPhotos({ photos })
  if (!nightDiskPath) return null

  const rowObjs: DarwinRow[] = []
  for (const d of detections) {
    const patch = allPatches[d.patchId]
    const photo = allPhotos[d.photoId]
    const rowObj = buildDarwinShapeFromDetection({ detection: d, patch, photo, nightId, nightDiskPath })
    rowObjs.push(rowObj)
  }

  console.log('📤 Export: output rows', { nightId, count: rowObjs.length, rows: rowObjs })

  // Handle empty detections case: return CSV with headers only
  if (rowObjs.length === 0) {
    const headersLine = DARWIN_COLUMNS.join(',')
    const csv = headersLine
    return { csv, nightDiskPath }
  }

  const csv = objectsToCSV({ objects: rowObjs as any[], headers: [...(DARWIN_COLUMNS as readonly string[])] as string[] })
  return { csv, nightDiskPath }
}

function buildNightExportFileName(params: { nightId: string }): string {
  const { nightId } = params
  const { datasetName, siteName, deploymentName, nightName } = buildExportFileNameParts({ nightId })
  const today = formatTodayYyyyMm_Dd()

  const fileName = siteName
    ? `${datasetName}_${siteName}_${deploymentName}_${nightName}_exported-${today}.csv`
    : `${datasetName}_${deploymentName}_${nightName}_exported-${today}.csv`
  return fileName
}

function parseNightIdParts(params: { nightId: string }): { project: string; deployment: string; night: string } | null {
  const { nightId } = params
  if (!nightId) return null

  const parts = nightId.split('/').filter(Boolean)
  // nightId format: project/site/deployment/night
  if (parts.length < 4) return null

  const project = parts[0] || ''
  const deployment = parts[2] || ''
  const night = parts[3] || ''

  if (!project || !deployment || !night) return null

  return { project, deployment, night }
}

export function buildDarwinShapeFromDetection(params: {
  detection: DetectionEntity
  patch?: PatchEntity
  photo?: PhotoEntity
  nightId: string
  nightDiskPath: string
}): DarwinRow {
  const { detection, patch, photo, nightId, nightDiskPath } = params
  const baseName = getPhotoBaseFromPhotoId(photo?.id || '')
  const verbatimEventDate = extractVerbatimEventDateFromPhotoBase({ baseName })
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

  const nightParts = parseNightIdParts({ nightId })
  const datasetID = nightParts ? `${nightParts.project}_${nightParts.deployment}_${nightParts.night}` : nightId.replaceAll('/', '_')
  const parentEventID = nightParts ? `${nightParts.project}_${nightParts.deployment}` : datasetID
  const eventID = photo?.id || ''
  const occurrenceID = patch?.id || ''

  // Deployment is datasetID without the trailing night date segment
  const deployment = extractDeploymentFromDatasetID({ datasetID })
  const mothbox = extractMothboxFromNightDiskPath({ nightDiskPath })
  const detectionBy = extractDetectionByFromPatchId({ patchId: patch?.id || '', photoBase: baseName })
  const detection_confidence = detection?.score != null ? String(detection.score) : ''
  const userInitials = userSessionStore.get()?.initials || ''
  const identifiedBy = detection?.detectedBy === 'user' ? userInitials : ''
  const ID_confidence = ''

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
  if (!m) return { eventDate: '', eventTime: '', utcOffset: '' }
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
