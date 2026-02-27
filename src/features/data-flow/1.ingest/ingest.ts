import { projectsStore, type ProjectEntity } from '~/stores/entities/1.projects'
import { sitesStore, type SiteEntity } from '~/stores/entities/2.sites'
import { deploymentsStore, type DeploymentEntity } from '~/stores/entities/3.deployments'
import { nightsStore, type NightEntity } from '~/stores/entities/4.nights'
import { photosStore, type PhotoEntity, type IndexedFile } from '~/stores/entities/photos'
import { patchesStore, type PatchEntity } from '~/stores/entities/5.patches'
import { detectionsStore, type DetectionEntity } from '~/stores/entities/detections'
import { normalizeLegacyNightId, parsePathParts } from './ingest-paths'
import { parseNightBotDetections, overlayNightUserDetections } from './ingest-night'

export async function ingestFilesToStores(params: {
  files: IndexedFile[]
  parseDetectionsForNightId?: string | null
  patchMap?: Record<string, IndexedFile>
}) {
  const { files, parseDetectionsForNightId, patchMap } = params
  if (!files?.length) return
  const targetNightId =
    typeof parseDetectionsForNightId === 'string' ? normalizeLegacyNightId(parseDetectionsForNightId) : parseDetectionsForNightId

  const proj: Record<string, ProjectEntity> = {}
  const sites: Record<string, SiteEntity> = {}
  const deps: Record<string, DeploymentEntity> = {}
  const nights: Record<string, NightEntity> = {}
  const photos: Record<string, PhotoEntity> = {}
  const patches: Record<string, PatchEntity> = {}
  const detections: Record<string, DetectionEntity> = {}

  for (const f of files) {
    const parts = parsePathParts({ path: f.path })
    if (!parts) continue

    const { project, site, deployment, night, isPatch, isPhotoJpg, isBotJson, isUserJson, fileName, baseName } = parts
    if (!project || !site || !deployment || !night) continue

    const hasRelevantMedia = isPhotoJpg || isPatch || isBotJson || isUserJson
    if (!hasRelevantMedia) continue

    const projectId = project
    const siteId = `${project}/${site}`
    const deploymentId = `${project}/${deployment}`
    const nightId = normalizeLegacyNightId(`${project}/${deployment}/${night}`)

    proj[projectId] = proj[projectId] ?? { id: projectId, name: project }
    sites[siteId] = sites[siteId] ?? { id: siteId, name: site, projectId }
    deps[deploymentId] = deps[deploymentId] ?? { id: deploymentId, name: deployment, projectId, siteId }
    nights[nightId] = nights[nightId] ?? { id: nightId, name: night, projectId, siteId, deploymentId }

    const shouldIncludeMedia =
      targetNightId === undefined ? true : targetNightId === null ? false : nightId === targetNightId

    if (isPhotoJpg && shouldIncludeMedia) {
      const photoId = `${baseName}.jpg`
      const existing = photos[photoId] ?? { id: photoId, name: photoId, nightId }
      if (existing.nightId && existing.nightId !== nightId) {
        console.warn('🚨 ingest: photoId collision across nights', {
          photoId,
          existingNightId: existing.nightId,
          incomingNightId: nightId,
          existingPath: existing.imageFile?.path || existing.botDetectionFile?.path || existing.userDetectionFile?.path,
          incomingPath: f.path,
        })
      }
      photos[photoId] = { ...existing, imageFile: f }
      continue
    }

    if (isPatch && shouldIncludeMedia) {
      const photoId = `${baseName}.jpg`
      const patchId = fileName
      const existingPatch = patches[patchId]
      if (existingPatch && existingPatch.nightId !== nightId) {
        console.warn('🚨 ingest: patchId collision across nights', {
          patchId,
          existingNightId: existingPatch.nightId,
          incomingNightId: nightId,
          existingPath: existingPatch.imageFile?.path,
          incomingPath: f.path,
        })
      }
      patches[patchId] = existingPatch ?? { id: patchId, name: patchId, nightId, photoId, imageFile: f }
      continue
    }

    if (isBotJson && shouldIncludeMedia) {
      const photoId = `${baseName}.jpg`
      const existing = photos[photoId] ?? { id: photoId, name: photoId, nightId }
      photos[photoId] = { ...existing, botDetectionFile: f }
      continue
    }

    if (isUserJson && shouldIncludeMedia) {
      const photoId = `${baseName}.jpg`
      const existing = photos[photoId] ?? { id: photoId, name: photoId, nightId }
      photos[photoId] = { ...existing, userDetectionFile: f }
      console.log('📂 ingest: found _identified.json', { path: f.path, photoId, nightId })
      continue
    }
  }

  if (parseDetectionsForNightId !== null) {
    // When parsing for a specific night, merge existing photos from store into local photos object
    // so parseNightBotDetections can see photos that already have botDetectionFile set
    if (typeof targetNightId === 'string') {
      const currentPhotos = photosStore.get() || {}
      // Merge existing photos into local photos, with local photos taking precedence
      for (const [photoId, existingPhoto] of Object.entries(currentPhotos)) {
        if (normalizeLegacyNightId(existingPhoto.nightId) === targetNightId) {
          if (!photos[photoId]) {
            photos[photoId] = existingPhoto
          } else {
            // Merge: keep existing photo but add botDetectionFile/userDetectionFile if missing
            photos[photoId] = {
              ...existingPhoto,
              ...photos[photoId],
              botDetectionFile: photos[photoId].botDetectionFile || existingPhoto.botDetectionFile,
              userDetectionFile: photos[photoId].userDetectionFile || existingPhoto.userDetectionFile,
            }
          }
        }
      }
    }
    await parseNightBotDetections({ photos, files, patchMap, parseDetectionsForNightId: targetNightId, patches, detections })
    await overlayNightUserDetections({ photos, parseDetectionsForNightId: targetNightId, detections })
  }

  if (typeof targetNightId === 'string') {
    const currProj = projectsStore.get() || {}
    const currSites = sitesStore.get() || {}
    const currDeps = deploymentsStore.get() || {}
    const currNights = nightsStore.get() || {}
    projectsStore.set({ ...currProj, ...proj })
    sitesStore.set({ ...currSites, ...sites })
    deploymentsStore.set({ ...currDeps, ...deps })
    nightsStore.set({ ...currNights, ...nights })
  } else {
    projectsStore.set(proj)
    sitesStore.set(sites)
    deploymentsStore.set(deps)
    nightsStore.set(nights)
  }

  if (parseDetectionsForNightId === null) {
    photosStore.set({})
    patchesStore.set({})
  } else if (typeof targetNightId === 'string') {
    const currentPhotos = photosStore.get() || {}
    const currentPatches = patchesStore.get() || {}
    photosStore.set({ ...currentPhotos, ...photos })
    patchesStore.set({ ...currentPatches, ...patches })
  } else {
    photosStore.set(photos)
    patchesStore.set(patches)
  }

  if (parseDetectionsForNightId === null) {
    detectionsStore.set({})
  } else if (typeof targetNightId === 'string') {
    const currentDetections = detectionsStore.get() || {}
    // Fresh file data wins over stale store data
    const merged: Record<string, DetectionEntity> = { ...currentDetections, ...detections }
    detectionsStore.set(merged)
  } else {
    detectionsStore.set(detections)
  }
}

export async function ingestDetectionsForNight(params: { files: IndexedFile[]; nightId: string; patchMap?: Record<string, IndexedFile> }) {
  const { files, nightId, patchMap } = params
  if (!files?.length || !nightId) return
  await ingestFilesToStores({ files, parseDetectionsForNightId: nightId, patchMap })
}
