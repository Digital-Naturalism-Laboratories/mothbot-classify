import { projectsStore, type ProjectEntity } from '~/stores/entities/1.projects'
import { sitesStore, type SiteEntity } from '~/stores/entities/2.sites'
import { deploymentsStore, type DeploymentEntity } from '~/stores/entities/3.deployments'
import { nightsStore, type NightEntity } from '~/stores/entities/4.nights'
import { photosStore, type PhotoEntity, type IndexedFile } from '~/stores/entities/photos'
import { patchesStore, type PatchEntity } from '~/stores/entities/5.patches'
import { detectionsStore, type DetectionEntity } from '~/stores/entities/detections'
import { parsePathParts, deriveSiteFromDeploymentFolder } from './ingest-paths'
import { parseNightBotDetections, overlayNightUserDetections } from './ingest-night'

export async function ingestFilesToStores(params: {
  files: IndexedFile[]
  parseDetectionsForNightId?: string | null
  patchMap?: Record<string, IndexedFile>
}) {
  const { files, parseDetectionsForNightId, patchMap } = params
  if (!files?.length) return

  const proj: Record<string, ProjectEntity> = {}
  const sites: Record<string, SiteEntity> = {}
  const deps: Record<string, DeploymentEntity> = {}
  const nights: Record<string, NightEntity> = {}
  const photos: Record<string, PhotoEntity> = {}
  const patches: Record<string, PatchEntity> = {}
  const detections: Record<string, DetectionEntity> = {}

  let photoJpgCount = 0
  let patchFileCount = 0
  let botJsonCount = 0
  let userJsonCount = 0

  for (const f of files) {
    const parts = parsePathParts({ path: f.path })
    if (!parts) continue

    const { project, site, deployment, night, isPatch, isPhotoJpg, isBotJson, isUserJson, fileName, baseName } = parts
    if (!project || !site || !deployment || !night) continue

    const hasRelevantMedia = isPhotoJpg || isPatch || isBotJson || isUserJson
    if (!hasRelevantMedia) continue

    const projectId = project
    const siteId = `${project}/${site}`
    const deploymentId = `${project}/${site}/${deployment}`
    const nightId = `${project}/${site}/${deployment}/${night}`

    proj[projectId] = proj[projectId] ?? { id: projectId, name: project }
    const siteDisplayName = deriveSiteFromDeploymentFolder(deployment) || site
    sites[siteId] = sites[siteId] ?? { id: siteId, name: siteDisplayName, projectId }
    deps[deploymentId] = deps[deploymentId] ?? { id: deploymentId, name: deployment, projectId, siteId }
    nights[nightId] = nights[nightId] ?? { id: nightId, name: night, projectId, siteId, deploymentId }

    const shouldIncludeMedia =
      parseDetectionsForNightId === undefined ? true : parseDetectionsForNightId === null ? false : nightId === parseDetectionsForNightId

    if (isPhotoJpg && shouldIncludeMedia) {
      const photoId = `${baseName}.jpg`
      const existing = photos[photoId] ?? { id: photoId, name: photoId, nightId }
      photos[photoId] = { ...existing, imageFile: f }
      photoJpgCount++
      continue
    }

    if (isPatch && shouldIncludeMedia) {
      const photoId = `${baseName}.jpg`
      const patchId = fileName
      patches[patchId] = patches[patchId] ?? { id: patchId, name: patchId, nightId, photoId, imageFile: f }
      patchFileCount++
      continue
    }

    if (isBotJson && shouldIncludeMedia) {
      const photoId = `${baseName}.jpg`
      const existing = photos[photoId] ?? { id: photoId, name: photoId, nightId }
      photos[photoId] = { ...existing, botDetectionFile: f }
      botJsonCount++
      continue
    }

    if (isUserJson && shouldIncludeMedia) {
      const photoId = `${baseName}.jpg`
      const existing = photos[photoId] ?? { id: photoId, name: photoId, nightId }
      photos[photoId] = { ...existing, userDetectionFile: f }
      userJsonCount++
      console.log('📂 ingest: found _identified.json', { path: f.path, photoId, nightId })
      continue
    }
  }

  if (parseDetectionsForNightId !== null) {
    // When parsing for a specific night, merge existing photos from store into local photos object
    // so parseNightBotDetections can see photos that already have botDetectionFile set
    if (typeof parseDetectionsForNightId === 'string') {
      const currentPhotos = photosStore.get() || {}
      // Merge existing photos into local photos, with local photos taking precedence
      for (const [photoId, existingPhoto] of Object.entries(currentPhotos)) {
        if (existingPhoto.nightId === parseDetectionsForNightId) {
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
    await parseNightBotDetections({ photos, files, patchMap, parseDetectionsForNightId, patches, detections })
    await overlayNightUserDetections({ photos, parseDetectionsForNightId, detections })
  }

  if (typeof parseDetectionsForNightId === 'string') {
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
  } else if (typeof parseDetectionsForNightId === 'string') {
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
  } else if (typeof parseDetectionsForNightId === 'string') {
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
