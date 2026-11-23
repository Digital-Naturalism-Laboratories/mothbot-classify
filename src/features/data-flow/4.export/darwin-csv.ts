import { ensureReadWritePermission, persistenceConstants } from '~/features/data-flow/3.persist/files.persistence'
import { normalizeNonTargetLabel } from '~/models/non-target'
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
import { buildExportFileNameParts, formatTodayYyyyMm_Dd, getPackageExportFolderPath, getProjectExportPath } from './export-utils'
import { botAlgorithmLabel } from '~/features/mothbox-next/bot-shape-to-classification'
import { currentHumanClassifierId } from '~/features/mothbox-next/human-classifier-id'
import { speciesListsStore } from '~/features/data-flow/2.identify/species-list.store'
import {
  canonicalSpeciesListRef,
  inferTaxonIDSource,
  normalizeTaxonKeyStyle,
} from '~/models/taxonomy/species-list-source'
import { taxonKeysOf } from '~/models/taxonomy/taxon-keys'
import { nonTargetPathOf } from '~/models/non-target'
import { mothboxNextPackageStore } from '~/features/mothbox-next/active-package'
import { DETERMINATION_ALGORITHM } from '~/features/mothbox-next/resolve-classifications'
import type { DeploymentRecord } from '~/features/mothbox-next/records'
import type { SessionRecord } from '~/features/mothbox-next/sessions'

/**
 * Columns of the Darwin Core CSV export. Field names are camelCase (ontology: Field Names),
 * keeping Darwin Core's own names where it has them. Renamed from earlier versions:
 * species_list_doi → taxaListDOI, taxonID_source → taxonIDSource (now a key style such
 * as `col`), detectionBy → detectedBy, detection_confidence → detectionScore,
 * ID_confidence → identificationScore, mothbox → deviceID, filepath → filePath,
 * original_mothbox_identifciation → machineIdentification, cluster_ID → clusterID,
 * temporal_subcluster_ID → trackID, pixel_mass_* → pixelMass*, UTCOFFSET → utcOffset,
 * deployment → deploymentID, image_id → imageID.
 */
const DARWIN_COLUMNS = [
  // Taxonomy columns
  'taxaListDOI',
  'taxaListExclusions',
  'kingdom',
  'phylum',
  'class',
  'order',
  'family',
  'genus',
  'species',
  'morphospecies',
  'taxonID',
  'taxonIDSource',
  'gbifTaxonKey',
  'colTaxonKey',
  'boldBIN',
  'inatTaxonID',
  'fieldguideID',
  'commonName',
  'scientificName',
  'name',
  'nonTarget',
  'nonTargetCategory',

  // Identification
  'identifiedBy',
  'identifierType',
  'identificationScore',
  'determinationAlgorithm',
  'machineIdentification',
  'machineTaxaListDOI',
  'machineTaxaListExclusions',

  // Detection and device
  'deploymentID',
  'imageID',
  'detectedBy',
  'detectionScore',
  'deviceID',
  'deviceType',
  'filePath',
  'clusterID',
  'trackID',
  'width',
  'height',
  'area',
  'pixelMassPixels',
  'pixelMassMm2',
  'pixelMassMethod',

  // Date/Time
  'eventDate',
  'eventTime',
  'utcOffset',
  'verbatimEventDate',

  // Events: deployment → session → capture window → capture (ontology: Events)
  'sessionID',
  'sessionStart',
  'sessionEnd',
  'captureWindowID',

  // Other
  'basisOfRecord',
  'datasetID',
  'parentEventID',
  'eventID',
  'occurrenceID',
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

  const pathParts = getNightDarwinExportPathParts({ leafGroupId })

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

/**
 * Where a night's Darwin CSV is written, relative to the opened folder (the
 * `projectsRoot` handle). The writer, the success toast and the copy-path
 * buttons all use this, so they can't disagree about the location again.
 *
 * Mothbox Next packages: `<package>/04_exports/` — the opened folder *is* the
 * package, and visualizations already go there. Legacy datasets (the opened
 * folder holds project folders): `<project>/exports/`.
 */
export function getNightDarwinExportPathParts(params: { leafGroupId: string }): string[] {
  const { leafGroupId } = params
  const folder = getPackageExportFolderPath() ?? getProjectExportPath({ leafGroupId })
  return [...folder.split('/').filter(Boolean), buildNightExportFileName({ leafGroupId })]
}

/**
 * The export folder as the user would find it on disk, starting from the
 * folder they opened (browsers never reveal the absolute path).
 */
export function describeDarwinExportFolder(params: { leafGroupId: string }): string {
  return withOpenedFolderName(getNightDarwinExportPathParts(params).slice(0, -1))
}

function withOpenedFolderName(parts: string[]): string {
  let opened = ''
  try {
    opened = localStorage.getItem(persistenceConstants.LOCAL_NAME_KEY) ?? ''
  } catch {
    // localStorage unavailable — show the path from the opened folder
  }
  return [opened, ...parts].filter(Boolean).join('/')
}

export async function copyNightExportFilePathToClipboard(params: { leafGroupId: string }): Promise<boolean> {
  const { leafGroupId } = params
  if (!leafGroupId) return false

  const fullPath = withOpenedFolderName(getNightDarwinExportPathParts({ leafGroupId }))

  const ok = await writeTextToClipboard(fullPath)
  console.log(ok ? '📋 Copied export file path' : '🚨 Failed to copy export file path', { fullPath })
  return ok
}

export async function copyNightExportFolderPathToClipboard(params: { leafGroupId: string }): Promise<boolean> {
  const { leafGroupId } = params
  if (!leafGroupId) return false

  const folderPath = describeDarwinExportFolder({ leafGroupId })
  const ok = await writeTextToClipboard(folderPath)
  console.log(ok ? '📋 Copied export folder path' : '🚨 Failed to copy export folder path', { folderPath })
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
  const context = buildDarwinExportContext()
  for (const d of detections) {
    const patch = allPatches[d.patchId]
    const photo = allPhotos[d.photoId]
    const rowObj = buildDarwinShapeFromDetection({ detection: d, patch, photo, leafGroupId, nightDiskPath, context })
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
  /** Sessions and deployment details from the open package; built once per export. */
  context?: DarwinExportContext
}): DarwinRow {
  const { detection, patch, photo, leafGroupId, nightDiskPath } = params
  const context = params.context ?? buildDarwinExportContext()
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
  // Lists from the GBIF Backbone and Catalogue of Life eras can be mixed in one
  // project, and a bare taxonID doesn't say which key style it is (ontology: Taxon Keys).
  const taxonIDSource = taxonID ? normalizeTaxonKeyStyle(taxonMetadata.taxonIDSource) ?? inferTaxonIDSource(taxonID) ?? '' : ''
  const keys = isError ? {} : taxonKeysOf(detection?.taxon)
  const commonName = taxonMetadata.vernacularName || ''
  // Each ID carries the species list it was made from: the final ID's (human or
  // bot) and, separately, the original bot ID's — they can differ when a human
  // re-identifies with another list.
  const taxaListDOI = speciesListRefForExport(taxonMetadata.speciesListDOI)
  const taxaListExclusions = isError ? '' : detection?.speciesListExclusions || ''
  const machineTaxaListDOI = speciesListRefForExport(detection?.originalMothboxSpeciesList)
  const machineTaxaListExclusions = detection?.originalMothboxSpeciesListExclusions || ''

  // For Non-Target, scientificName is blank and name holds the Non-Target label.
  // Use validated scientificName (no morphospecies/numbers)
  const scientificName = isError
    ? ''
    : getValidScientificNameForExport({
        taxon: detection?.taxon,
        morphospecies: detection?.morphospecies,
        label: detection?.label,
      })
  // Keep the Non-Target category (e.g. "NON_TARGET/Error/Blur") in the exported name.
  const name = isError ? normalizeNonTargetLabel(detection?.label) : deriveTaxonNameFromDetection({ detection })

  const nightParts = parseNightIdParts({ leafGroupId })
  const datasetID = nightParts ? `${nightParts.project}_${nightParts.deployment}_${nightParts.night}` : leafGroupId.replaceAll('/', '_')
  const eventID = photo?.id || ''
  // One occurrence per detection unless tracking merged them (ontology: Occurrence).
  const occurrenceID = detection?.occurrenceId || patch?.id || detection?.patchId || ''

  // Deployment is datasetID without the trailing night date segment
  const deploymentID = extractDeploymentFromDatasetID({ datasetID })
  const deploymentRecord = context.deploymentByPatch.get(detection?.patchId ?? '')
  const deviceID = deploymentRecord?.device_name || extractMothboxFromNightDiskPath({ nightDiskPath })
  const deviceType = deploymentRecord?.device_type || ''

  // Events nest: deployment → session → capture window → capture (this photo).
  const session = detection?.sessionId ? context.sessionsById.get(detection.sessionId) : undefined
  const sessionID = detection?.sessionId ?? ''
  const captureWindowID = detection?.captureWindowId ?? ''
  const parentEventID =
    captureWindowID || sessionID || (nightParts ? `${nightParts.project}_${nightParts.deployment}` : datasetID)

  const detectedBy = detection?.botClassifierId
    ? botAlgorithmLabel(detection.botClassifierId)
    : extractDetectionByFromPatchId({ patchId: patch?.id || '', photoBase: baseName })
  const detectionScore = detection?.score != null ? String(detection.score) : ''
  const isPersonsIdentification = detection?.detectedBy === 'user'
  const identifiedBy = isPersonsIdentification ? identifiedByForDetection(detection) : ''
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
    utcOffset,
    sessionID,
    sessionStart: session?.start ?? '',
    sessionEnd: session?.end ?? '',
    captureWindowID,
    detectedBy,
    detectionScore,
    identifiedBy,
    identifierType: isPersonsIdentification ? 'human' : detection?.botClassifierId ? 'machine' : '',
    identificationScore: '',
    determinationAlgorithm: context.determinationAlgorithm,
    kingdom,
    phylum,
    class: klass,
    order,
    family,
    genus,
    species,
    morphospecies,
    taxonID,
    taxonIDSource,
    gbifTaxonKey: keys.gbif ?? '',
    colTaxonKey: keys.col ?? '',
    boldBIN: keys.bold ?? '',
    inatTaxonID: keys.inat ?? '',
    fieldguideID: keys.fieldguide ?? '',
    commonName,
    scientificName,
    name,
    nonTarget: isError ? 'true' : '',
    nonTargetCategory: isError ? nonTargetPathOf(detection?.label).join('/') : '',
    taxaListDOI,
    taxaListExclusions,
    filePath: filepath,
    deviceID,
    deviceType,
    machineIdentification: detection?.originalMothboxLabel || '',
    machineTaxaListDOI,
    machineTaxaListExclusions,
    ...geometryFields,
    deploymentID,
    imageID: image_id,
    pixelMassPixels: detection?.pixelMassPixels != null ? String(detection.pixelMassPixels) : '',
    pixelMassMm2: detection?.pixelMassMm2 != null ? String(detection.pixelMassMm2) : '',
    pixelMassMethod: detection?.pixelMassMethod ?? '',
  }
  return row
}

export type DarwinExportContext = {
  sessionsById: Map<string, SessionRecord>
  deploymentByPatch: Map<string, DeploymentRecord>
  /** The determination algorithm when a package is open (its determinations come from it). */
  determinationAlgorithm: string
}

/** Sessions and deployment details from the open package, looked up once per export. */
export function buildDarwinExportContext(): DarwinExportContext {
  const loaded = mothboxNextPackageStore.get()?.loaded
  const sessionsById = new Map((loaded?.sessions ?? []).map((s) => [s.sessionID, s]))
  const deploymentsById = new Map((loaded?.deployments ?? []).map((d) => [d.deployment_id, d]))
  const deploymentByPatch = new Map<string, DeploymentRecord>()
  for (const patch of loaded?.patches ?? []) {
    const deployment = patch.deployment_id ? deploymentsById.get(patch.deployment_id) : undefined
    if (deployment) deploymentByPatch.set(patch.patch_id, deployment)
  }
  return { sessionsById, deploymentByPatch, determinationAlgorithm: loaded ? DETERMINATION_ALGORITHM : '' }
}

/**
 * The species-list reference for the export, in one canonical form (older
 * versions stored `doi.org10.15468dl.x.csv`). An ID made while a GBIF list's DOI
 * was still pending (offline) carries the download page URL; if that list's DOI
 * has since been fetched, export the DOI instead.
 */
function speciesListRefForExport(ref?: string) {
  const canonical = canonicalSpeciesListRef(ref)
  if (!canonical) return ''
  for (const list of Object.values(speciesListsStore.get() || {})) {
    if (list.doiStatus !== 'resolved' && list.doiStatus !== 'filename') continue
    if (list.pendingRef && canonicalSpeciesListRef(list.pendingRef) === canonical) return list.doi
  }
  return canonical
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

/**
 * Credits whoever made the ID. The current user gets their initials as typed;
 * anyone else (e.g. IDs imported from old `_identified.json` files) gets their
 * lower-cased classifier id shown upper-case, the way initials were entered.
 */
function identifiedByForDetection(detection: DetectionEntity): string {
  const userInitials = userSessionStore.get()?.initials || ''
  const classifierId = detection.humanClassifierId?.trim()
  if (!classifierId || classifierId === currentHumanClassifierId()) return userInitials
  return classifierId.toUpperCase()
}

function buildGeometryExportFields(params: { detection: DetectionEntity }) {
  const { detection } = params
  const clusterFields = deriveClusterExportFields({ clusterId: detection?.clusterId })
  const patchSizeFields = derivePatchDimensionsFromPoints({ points: detection?.points })

  return {
    clusterID: clusterFields.clusterId,
    trackID: clusterFields.temporalSubclusterId,
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

  const width = Math.round(edgeLengths.reduce((a, b) => Math.min(a, b), Number.POSITIVE_INFINITY))
  const height = Math.round(edgeLengths.reduce((a, b) => Math.max(a, b), Number.NEGATIVE_INFINITY))
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
