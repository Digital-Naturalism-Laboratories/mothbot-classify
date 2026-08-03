import { detectionsStore, getDetectionsForLeafGroup, getIdentifiedDetectionsForLeafGroup, type DetectionEntity } from '~/stores/entities/detections'
import { photosStore, type PhotoEntity } from '~/stores/entities/photos'
import { patchesStore, type PatchEntity } from '~/stores/entities/5.patches'
import { idbGet } from '~/utils/index-db'
import { fsaaWriteBytes, type FileSystemDirectoryHandleLike } from '~/utils/fsaa'
import { ensureReadWritePermission, persistenceConstants } from '~/features/data-flow/3.persist/files.persistence'
import { generateNightDarwinCSVString } from '~/features/data-flow/4.export/darwin-csv'
import { zipSync, strToU8, type Zippable } from 'fflate'
import { getProjectExportPath, sanitizeForFileName, buildExportFileNameParts } from './export-utils'

type ZipInput = Zippable

export async function exportNightSummaryRS(params: { leafGroupId: string }): Promise<boolean> {
  const { leafGroupId } = params
  if (!leafGroupId) return false
  console.log('🏁 exportNightSummaryRS: start', { leafGroupId })

  const root = (await idbGet(
    persistenceConstants.IDB_NAME,
    persistenceConstants.IDB_STORE,
    'projectsRoot',
  )) as FileSystemDirectoryHandleLike | null
  if (!root) return false

  const granted = await ensureReadWritePermission(root as any)
  if (!granted) return false

  const csvGenerated = await generateNightDarwinCSVString({ leafGroupId })
  if (!csvGenerated) return false
  const { csv } = csvGenerated

  const zipEntries: ZipInput = {}
  zipEntries['darwin_export.csv'] = strToU8(csv)

  const allPatches = patchesStore.get() || {}
  const allPhotos = photosStore.get() || {}

  const identified = getIdentifiedDetectionsForLeafGroup(leafGroupId)

  const bySpecies: Map<string, DetectionEntity> = new Map()
  for (const det of identified) {
    const speciesKey = getSpeciesKey(det)
    if (!speciesKey) continue
    if (!bySpecies.has(speciesKey)) bySpecies.set(speciesKey, det)
  }

  for (const [speciesKey, det] of bySpecies) {
    const patch = allPatches?.[det.patchId]
    const photo = allPhotos?.[det.photoId]
    const imageFile = patch?.imageFile?.file
    if (!imageFile) continue

    const safeName = buildExportImageName({ detection: det, speciesKey, patch, photo })
    const bytes = new Uint8Array(await imageFile.arrayBuffer())
    zipEntries[`images/${safeName}`] = bytes
  }

  const zipped = zipSync(zipEntries, { level: 6 })
  const projectExportPath = getProjectExportPath({ leafGroupId })
  const zipFileName = buildRSSummaryFileName({ leafGroupId })
  const pathParts = [...projectExportPath.split('/').filter(Boolean), zipFileName]
  await fsaaWriteBytes(root, pathParts, zipped)
  console.log('✅ exportNightSummaryRS: written file', { path: pathParts.join('/') })

  return true
}

function buildRSSummaryFileName(params: { leafGroupId: string }): string {
  const { leafGroupId } = params
  const { datasetName, siteName, deploymentName, nightName } = buildExportFileNameParts({ leafGroupId })

  const fileName = siteName
    ? `${datasetName}_${siteName}_${deploymentName}_${nightName}_rs_summary.zip`
    : `${datasetName}_${deploymentName}_${nightName}_rs_summary.zip`
  return fileName
}

function getSpeciesKey(d: DetectionEntity): string {
  const taxon = d?.taxon
  if (taxon?.scientificName) return taxon.scientificName
  const label = (d?.label ?? '').trim()
  if (label) return label
  return ''
}

function buildExportImageName(params: {
  detection: DetectionEntity
  speciesKey: string
  patch?: PatchEntity
  photo?: PhotoEntity
}): string {
  const { detection, speciesKey, patch } = params
  const id = detection?.id || patch?.id || ''
  const scientificName = detection?.taxon?.scientificName || speciesKey || 'unknown'
  const normalizedName = scientificName
    .replaceAll(/[^a-z0-9\-_. ]/gi, '_')
    .replaceAll(/\s+/g, '_')
    .slice(0, 120)
  const fileName = `${id}__${normalizedName}.jpg`
  return fileName
}
