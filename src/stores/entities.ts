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
export { leafGroupsStore, type LeafGroupEntity } from './entities/leaf-groups'
export { patchesStore, type PatchEntity, clearFileObjectsForLeafGroup as clearPatchesForLeafGroup } from './entities/5.patches'
export { photosStore, type PhotoEntity, type IndexedFile, clearFileObjectsForLeafGroup as clearPhotosForLeafGroup } from './entities/photos'
export { detectionsStore, detectionStoreById, type DetectionEntity } from './entities/detections'

// Re-export ingest functions from the canonical location
export { ingestFilesToStores, ingestDetectionsForLeafGroup as ingestDetectionsForNight } from '~/features/data-flow/1.ingest/ingest'

// Re-export identification functions from detections store
export { labelDetections, acceptDetections, resetDetections } from './entities/detections'

import { projectsStore } from './entities/1.projects'
import { sitesStore } from './entities/2.sites'
import { deploymentsStore } from './entities/3.deployments'
import { leafGroupsStore } from './entities/leaf-groups'
import { patchesStore, clearFileObjectsForLeafGroup as clearPatchesForLeafGroup } from './entities/5.patches'
import { photosStore, clearFileObjectsForLeafGroup as clearPhotosForLeafGroup } from './entities/photos'
import { detectionsStore } from './entities/detections'
import { leafGroupSummariesStore } from './entities/night-summaries'
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
  leafGroupsStore.set({})
  photosStore.set({})
  patchesStore.set({})
  detectionsStore.set({})
  leafGroupSummariesStore.set({})
  morphoLinksStore.set({})
}

/**
 * Clears File objects from photos and patches for nights not in the active set.
 * This helps with memory management when navigating away from nights.
 */
export function clearFileObjectsForInactiveLeafGroups(params: { activeLeafGroupIds: Set<string> }) {
  const { activeLeafGroupIds } = params
  const photos = photosStore.get() || {}
  const patches = patchesStore.get() || {}
  const leafGroupsToCleanup = new Set<string>()

  for (const photo of Object.values(photos)) {
    if (photo.leafGroupId && !activeLeafGroupIds.has(photo.leafGroupId)) {
      leafGroupsToCleanup.add(photo.leafGroupId)
    }
  }

  for (const patch of Object.values(patches)) {
    if (patch.leafGroupId && !activeLeafGroupIds.has(patch.leafGroupId)) {
      leafGroupsToCleanup.add(patch.leafGroupId)
    }
  }

  for (const leafGroupId of leafGroupsToCleanup) {
    clearPhotosForLeafGroup({ leafGroupId })
    clearPatchesForLeafGroup({ leafGroupId })
  }

  if (leafGroupsToCleanup.size > 0) {
    console.log('🗑️ cleanup: cleared File objects for inactive nights', {
      nightsCleared: Array.from(leafGroupsToCleanup),
      activeNights: Array.from(activeLeafGroupIds),
    })
  }
}
