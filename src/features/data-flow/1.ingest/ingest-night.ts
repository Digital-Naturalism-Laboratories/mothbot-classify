import { incrementNightIngestProcessed } from '~/stores/ui'
import type { IndexedFile } from '~/stores/entities/photos'
import type { PhotoEntity } from '~/stores/entities/photos'
import type { PatchEntity } from '~/stores/entities/5.patches'
import type { DetectionEntity } from '~/stores/entities/detections'

import { extractNightDiskPathFromIndexedPath } from './ingest-paths'
import { extractPatchFilename, parseBotDetectionJsonSafely, parseUserDetectionJsonSafely } from './ingest-json'
import { buildDetectionFromIdentifiedJsonShape, buildDetectionFromBotShape } from '~/models/detection-shapes'

export async function parseNightBotDetections(params: {
  photos: Record<string, PhotoEntity>
  files: IndexedFile[]
  patchMap?: Record<string, IndexedFile>
  parseDetectionsForNightId?: string | null
  patches: Record<string, PatchEntity>
  detections: Record<string, DetectionEntity>
}) {
  const { photos, files, patchMap, parseDetectionsForNightId, patches, detections } = params
  const targetNightId = typeof parseDetectionsForNightId === 'string' ? parseDetectionsForNightId : undefined
  const processedPatchIds = new Set<string>()

  for (const photo of Object.values(photos)) {
    if (parseDetectionsForNightId && photo.leafGroupId !== parseDetectionsForNightId) continue
    const jsonFile = (photo as any)?.botDetectionFile as IndexedFile | undefined
    if (!jsonFile) continue

    const parsed = await parseBotDetectionJsonSafely({ file: jsonFile })
    if (!parsed) continue

    for (let i = 0; i < parsed.shapes.length; i++) {
      const shape = parsed.shapes[i] as any
      const patchFileName = extractPatchFilename({ patchPath: shape?.patch_path ?? '' })
      if (!patchFileName) continue
      const patchId = patchFileName
      const existingPatch = patches[patchId]

      const imageFileExisting = existingPatch?.imageFile
      const hasHydratedFile = !!(imageFileExisting as any)?.file
      const imageFile: IndexedFile | undefined = hasHydratedFile
        ? (imageFileExisting as any)
        : await (async () => {
            if (imageFileExisting) {
              const hydrated = await ensureFileHydrated(imageFileExisting as any)
              return hydrated as any
            }
            const found = await findPatchFileForPatchId({
              files,
              patchMap,
              patchId,
              nightDiskPath: extractNightDiskPathFromIndexedPath((jsonFile as any)?.path ?? ''),
            })
            return found as any
          })()

      patches[patchId] = {
        id: patchId,
        name: existingPatch?.name ?? patchId,
        leafGroupId: photo.leafGroupId,
        photoId: photo.id,
        imageFile: imageFile as any,
      } as any

      const detectionId = patchId
      const existingDetection: DetectionEntity = {
        id: detectionId,
        patchId,
        photoId: photo.id,
        leafGroupId: photo.leafGroupId,
      }
      detections[detectionId] = buildDetectionFromBotShape({ shape, existingDetection })

      if (targetNightId && !processedPatchIds.has(patchId) && !!patches?.[patchId]?.imageFile) {
        processedPatchIds.add(patchId)
        incrementNightIngestProcessed({ leafGroupId: targetNightId, by: 1 })
      }
    }
  }
}

export async function overlayNightUserDetections(params: {
  photos: Record<string, PhotoEntity>
  parseDetectionsForNightId?: string | null
  detections: Record<string, DetectionEntity>
}) {
  const { photos, parseDetectionsForNightId, detections } = params

  let userJsonCount = 0
  let shapesLoaded = 0

  for (const photo of Object.values(photos)) {
    if (parseDetectionsForNightId && photo.leafGroupId !== parseDetectionsForNightId) continue
    const userJson = (photo as any)?.userDetectionFile as IndexedFile | undefined
    if (!userJson) continue

    userJsonCount++
    const parsedUser = await parseUserDetectionJsonSafely({ file: userJson })
    if (!parsedUser) continue

    if (Array.isArray(parsedUser.shapes)) {
      for (const s of parsedUser.shapes) {
        const shape = s as any
        const patchFileName = extractPatchFilename({ patchPath: shape?.patch_path ?? '' })
        if (!patchFileName) continue

        const detectionId = patchFileName
        const existing = detections[detectionId]
        const next = buildDetectionFromIdentifiedJsonShape({ shape, photo, existingDetection: existing })
        detections[detectionId] = next
        shapesLoaded++

        if (next.morphospecies) {
          console.log('💾 ingest: loaded morphospecies from _identified.json', {
            detectionId,
            morphospecies: next.morphospecies,
            shapeMorphospecies: shape?.morphospecies,
          })
        }
      }
    }
  }

  if (userJsonCount > 0) {
    console.log('💾 ingest: overlayed user detections', { userJsonCount, shapesLoaded, leafGroupId: parseDetectionsForNightId })
  }
}

async function findPatchFileForPatchId(params: {
  files: IndexedFile[]
  nightDiskPath: string
  patchId: string
  patchMap?: Record<string, IndexedFile>
}) {
  const { files, nightDiskPath, patchId, patchMap } = params
  if (!files?.length || !nightDiskPath || !patchId) return undefined
  const fromMap = patchMap?.[patchId.toLowerCase()]
  if (fromMap) return await ensureFileHydrated(fromMap)
  const normalizedNight = nightDiskPath.replaceAll('\\', '/').replace(/^\/+/, '').toLowerCase()
  const patchIdLower = patchId.toLowerCase()
  const expectedSuffixLower = `${normalizedNight}/patches/${patchIdLower}`
  for (const f of files) {
    const pathLower = (f?.path ?? '').replaceAll('\\', '/').toLowerCase()
    if (!pathLower) continue
    if (pathLower.endsWith(expectedSuffixLower)) return await ensureFileHydrated(f)
  }
  const trailingLower = `/patches/${patchIdLower}`
  for (const f of files) {
    const pathLower = (f?.path ?? '').replaceAll('\\', '/').toLowerCase()
    if (!pathLower) continue
    if (pathLower.endsWith(trailingLower)) {
      console.log('💡 ingest: fallback matched patch file', { patchId, path: (f as any).path })
      return await ensureFileHydrated(f)
    }
  }
  return undefined
}

async function ensureFileHydrated(fileLike: IndexedFile): Promise<IndexedFile> {
  const hasFile = !!(fileLike as any)?.file
  if (hasFile) return fileLike
  const handle = (fileLike as any)?.handle as { getFile?: () => Promise<File> } | undefined
  if (handle && typeof handle.getFile === 'function') {
    try {
      const file = await handle.getFile()
      const hydrated = { ...fileLike, file, name: file?.name ?? fileLike.name, size: file?.size ?? fileLike.size }
      return hydrated as any
    } catch {
      return fileLike
    }
  }
  return fileLike
}
