/**
 * Re-exports from individual entity stores.
 * This file provides a convenient single import for common entity operations.
 *
 * NOTE: The canonical stores live in the individual files (1.projects.ts, etc.).
 * This file re-exports them for backward compatibility.
 */

// Re-export stores from individual files
export { projectsStore, type ProjectEntity } from './entities/1.projects'
export { sitesStore, type SiteEntity } from './entities/2.sites'
export { deploymentsStore, type DeploymentEntity } from './entities/3.deployments'
export { nightsStore, type NightEntity } from './entities/4.nights'
export { patchesStore, type PatchEntity, clearFileObjectsForNight as clearPatchesForNight } from './entities/5.patches'
export { photosStore, type PhotoEntity, type IndexedFile, clearFileObjectsForNight as clearPhotosForNight } from './entities/photos'
export { detectionsStore, detectionStoreById, type DetectionEntity } from './entities/detections'

// Re-export ingest functions from the canonical location
export { ingestFilesToStores, ingestDetectionsForNight } from '~/features/data-flow/1.ingest/ingest'

// Re-export identification functions from detections store
export { labelDetections, acceptDetections, resetDetections } from './entities/detections'

import { projectsStore } from './entities/1.projects'
import { sitesStore } from './entities/2.sites'
import { deploymentsStore } from './entities/3.deployments'
import { nightsStore } from './entities/4.nights'
import { patchesStore, clearFileObjectsForNight as clearPatchesForNight } from './entities/5.patches'
import { photosStore, clearFileObjectsForNight as clearPhotosForNight } from './entities/photos'
import { detectionsStore } from './entities/detections'
import { nightSummariesStore } from './entities/night-summaries'
import { morphoLinksStore } from '~/features/data-flow/3.persist/links'
import { clearMothboxNextPackage } from '~/features/mothbox-next/active-package'
import { clearActiveHierarchy } from '~/features/mothbox-next/active-hierarchy'

/**
 * Resets all entity stores to empty state.
 */
export function resetAllEntityStores() {
  clearMothboxNextPackage()
  clearActiveHierarchy()
  projectsStore.set({})
  sitesStore.set({})
  deploymentsStore.set({})
  nightsStore.set({})
  photosStore.set({})
  patchesStore.set({})
  detectionsStore.set({})
  nightSummariesStore.set({})
  morphoLinksStore.set({})
}

/**
 * Clears File objects from photos and patches for nights not in the active set.
 * This helps with memory management when navigating away from nights.
 */
export function clearFileObjectsForInactiveNights(params: { activeNightIds: Set<string> }) {
  const { activeNightIds } = params
  const photos = photosStore.get() || {}
  const patches = patchesStore.get() || {}
  const nightsToCleanup = new Set<string>()

  for (const photo of Object.values(photos)) {
    if (photo.nightId && !activeNightIds.has(photo.nightId)) {
      nightsToCleanup.add(photo.nightId)
    }
  }

  for (const patch of Object.values(patches)) {
    if (patch.nightId && !activeNightIds.has(patch.nightId)) {
      nightsToCleanup.add(patch.nightId)
    }
  }

  for (const nightId of nightsToCleanup) {
    clearPhotosForNight({ nightId })
    clearPatchesForNight({ nightId })
  }

  if (nightsToCleanup.size > 0) {
    console.log('🗑️ cleanup: cleared File objects for inactive nights', {
      nightsCleared: Array.from(nightsToCleanup),
      activeNights: Array.from(activeNightIds),
    })
  }
}
