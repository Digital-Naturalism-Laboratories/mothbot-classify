import { atom, computed } from 'nanostores'
import { nightSummariesStore } from '~/stores/entities/night-summaries'
import type { TaxonRecord } from '~/models/taxonomy/types'
import { speciesListsStore } from '~/features/data-flow/2.identify/species-list.store'
import { photosStore, type PhotoEntity } from '~/stores/entities/photos'
import { parseBotDetectionJsonSafely, extractPatchFilename } from '~/features/data-flow/1.ingest/ingest-json'
import { projectSpeciesSelectionStore } from '~/stores/species/project-species-list'
import {
  buildDetectionFromBotShape,
  updateDetectionWithTaxon,
  updateDetectionAsMorphospecies,
  updateDetectionAsError,
} from '~/models/detection-shapes'
import { toast } from 'sonner'
import { scheduleSaveForNight } from '~/features/data-flow/3.persist/detection-persistence'
import { buildNightSummary } from './night-summaries'
import { hasTaxonFields } from '~/models/taxonomy/validate'
import { getProjectIdFromNightId } from '~/utils/paths'
import { validateAndGroupDetectionsForAccept, resolveOrderTaxonFromSpeciesList } from '~/features/data-flow/2.identify/accept'
import { normalizeMorphoKey } from '~/models/taxonomy/morphospecies'
import { identifyDetection } from '~/features/data-flow/2.identify/identify'

// Re-export DetectionEntity from its canonical location
export type { DetectionEntity } from '~/models/detection.types'
import type { DetectionEntity } from '~/models/detection.types'

export const detectionsStore = atom<Record<string, DetectionEntity>>({})

export function detectionStoreById(id: string) {
  return computed(detectionsStore, (all) => all?.[id])
}

/**
 * Computed store: detections grouped by nightId.
 * Provides O(1) lookup for night-specific detections.
 */
export const detectionsByNightStore = computed(detectionsStore, (all) => {
  const byNight: Record<string, DetectionEntity[]> = {}
  for (const d of Object.values(all)) {
    const nightId = d.nightId
    if (!nightId) continue
    if (!byNight[nightId]) byNight[nightId] = []
    byNight[nightId].push(d)
  }
  return byNight
})

/**
 * Selector: Get all detections for a specific night.
 * Uses the computed store for efficient lookup.
 */
export function getDetectionsForNight(nightId: string): DetectionEntity[] {
  const byNight = detectionsByNightStore.get()
  return byNight[nightId] || []
}

/**
 * Selector: Get user-identified detections for a specific night.
 */
export function getIdentifiedDetectionsForNight(nightId: string): DetectionEntity[] {
  return getDetectionsForNight(nightId).filter((d) => d.detectedBy === 'user')
}

/**
 * Selector: Get auto-detected (not user-identified) detections for a specific night.
 */
export function getAutoDetectionsForNight(nightId: string): DetectionEntity[] {
  return getDetectionsForNight(nightId).filter((d) => d.detectedBy !== 'user')
}

/**
 * Checks if a detection was identified by a user.
 * Single source of truth for determining user-identified state.
 */
export function isUserIdentified(detection: DetectionEntity | undefined): boolean {
  return detection?.detectedBy === 'user'
}

/**
 * Labels detections with a taxon or free-text label.
 * Uses centralized detection update functions from detection-shapes.ts.
 */
export function labelDetections(params: { detectionIds: string[]; label?: string; taxon?: TaxonRecord }) {
  const { detectionIds, taxon, label } = params
  const trimmed = (label ?? '').trim()

  if (!Array.isArray(detectionIds) || detectionIds.length === 0) return

  const hasTaxon = hasTaxonFields(taxon)
  const isError = !hasTaxon && trimmed.toUpperCase() === 'ERROR'

  if (!hasTaxon && !trimmed && !isError) return

  const current = detectionsStore.get() || {}
  const selectionByProject = projectSpeciesSelectionStore.get() || {}
  const speciesLists = speciesListsStore.get() || {}
  const updated: Record<string, DetectionEntity> = { ...current }

  for (const id of detectionIds) {
    const existing = current?.[id]
    if (!existing) continue

    const projectId = getProjectIdFromNightId(existing?.nightId)
    const speciesListId = projectId ? selectionByProject?.[projectId] : undefined
    const speciesListDOI = speciesListId ? (speciesLists?.[speciesListId]?.doi as string | undefined) : undefined

    const context = { speciesListId, speciesListDOI }

    if (isError) {
      updated[id] = updateDetectionAsError({ existing, ...context })
      continue
    }

    if (hasTaxon && taxon) {
      updated[id] = updateDetectionWithTaxon({ existing, taxon, label: trimmed, ...context })
      continue
    }

    // Morphospecies case - free text without taxon
    const morphoResult = updateDetectionAsMorphospecies({ existing, morphospecies: trimmed, ...context })
    if (morphoResult) {
      updated[id] = morphoResult
    }
    // If morphoResult is null, the detection lacks required context - skip it
  }

  detectionsStore.set(updated)
  updateNightSummariesAndScheduleSave({ detectionIds, detections: updated })
}

/**
 * Accepts detections by setting detectedBy to 'user'.
 * Validates that order exists and searches species list for order taxon.
 */
export function acceptDetections(params: { detectionIds: string[] }) {
  const { detectionIds } = params
  if (!Array.isArray(detectionIds) || detectionIds.length === 0) return

  const detections = detectionsStore.get() || {}
  const selectionByProject = projectSpeciesSelectionStore.get() || {}

  const { groupedByOrder, errors } = validateAndGroupDetectionsForAccept({
    detectionIds,
    detections,
    selectionByProject,
  })

  for (const error of errors) {
    toast.error(error.message)
  }

  for (const group of groupedByOrder) {
    const result = resolveOrderTaxonFromSpeciesList({ group })

    if (!result.taxon) {
      for (const id of result.errorIds) {
        toast.error(result.errorMessage || 'Cannot accept: order not found')
      }
      continue
    }

    labelDetections({ detectionIds: group.ids, taxon: result.taxon })
  }
}

/**
 * Resets detections to their original bot-detected state.
 */
export async function resetDetections(params: { detectionIds: string[] }) {
  const { detectionIds } = params
  if (!Array.isArray(detectionIds) || detectionIds.length === 0) return

  const current = detectionsStore.get() || {}
  const photos = photosStore.get() || {}

  // Group by photo to avoid redundant JSON parsing
  const idsByPhoto: Record<string, string[]> = {}
  for (const id of detectionIds) {
    const existing = current?.[id]
    const photoId = (existing as any)?.photoId as string | undefined
    if (!existing || !photoId) continue
    if (!idsByPhoto[photoId]) idsByPhoto[photoId] = []
    idsByPhoto[photoId].push(id)
  }

  const updated: Record<string, DetectionEntity> = { ...current }

  for (const [photoId, ids] of Object.entries(idsByPhoto)) {
    const photo = photos?.[photoId] as PhotoEntity | undefined
    const jsonFile = (photo as any)?.botDetectionFile
    let shapes: Array<any> = []
    if (jsonFile) {
      try {
        const parsed = await parseBotDetectionJsonSafely({ file: jsonFile as any })
        shapes = Array.isArray(parsed?.shapes) ? parsed!.shapes : []
      } catch {
        shapes = []
      }
    }

    for (const id of ids) {
      const existing = current?.[id]
      if (!existing) continue

      const match = shapes.find((s: any) => extractPatchFilename({ patchPath: (s as any)?.patch_path ?? '' }) === id)

      if (match) {
        updated[id] = buildDetectionFromBotShape({ shape: match, existingDetection: existing })
      } else {
        // Fallback: clear human flags and mark as auto
        const next: DetectionEntity = {
          ...existing,
          detectedBy: 'auto',
          identifiedAt: undefined,
          isError: undefined,
          morphospecies: undefined,
          speciesListId: undefined,
          speciesListDOI: undefined,
        }
        updated[id] = next
      }
    }
  }

  detectionsStore.set(updated)
  updateNightSummariesAndScheduleSave({ detectionIds, detections: updated })
}

export type BulkIdentifyMorphospeciesResult = {
  updatedCount: number
  nightCount: number
}

/**
 * Finds all detections matching a morphospecies key.
 * Used to count instances before bulk identification.
 */
export function findDetectionsByMorphoKey(params: { morphoKey: string }): {
  detectionIds: string[]
  nightIds: Set<string>
} {
  const { morphoKey } = params
  const targetKey = normalizeMorphoKey(morphoKey)

  if (!targetKey) return { detectionIds: [], nightIds: new Set() }

  const allDetections = detectionsStore.get() || {}
  const detectionIds: string[] = []
  const nightIds = new Set<string>()

  for (const [id, detection] of Object.entries(allDetections)) {
    if (detection.detectedBy !== 'user') continue
    if (!detection.morphospecies) continue

    const detectionKey = normalizeMorphoKey(detection.morphospecies)
    if (detectionKey !== targetKey) continue

    detectionIds.push(id)
    if (detection.nightId) nightIds.add(detection.nightId)
  }

  return { detectionIds, nightIds }
}

/**
 * Bulk identifies all instances of a morphospecies as a specific taxon.
 * Updates all matching detections across all nights and persists changes.
 */
export function bulkIdentifyMorphospecies(params: {
  morphoKey: string
  taxon: TaxonRecord
}): BulkIdentifyMorphospeciesResult {
  const { morphoKey, taxon } = params
  const targetKey = normalizeMorphoKey(morphoKey)

  if (!targetKey) return { updatedCount: 0, nightCount: 0 }

  const current = detectionsStore.get() || {}
  const selectionByProject = projectSpeciesSelectionStore.get() || {}
  const speciesLists = speciesListsStore.get() || {}
  const updated: Record<string, DetectionEntity> = { ...current }

  const matchingIds: string[] = []
  const touchedNightIds = new Set<string>()

  for (const [id, detection] of Object.entries(current)) {
    if (detection.detectedBy !== 'user') continue
    if (!detection.morphospecies) continue

    const detectionKey = normalizeMorphoKey(detection.morphospecies)
    if (detectionKey !== targetKey) continue

    matchingIds.push(id)

    const projectId = getProjectIdFromNightId(detection.nightId)
    const speciesListId = projectId ? selectionByProject?.[projectId] : undefined
    const speciesListDOI = speciesListId ? (speciesLists?.[speciesListId]?.doi as string | undefined) : undefined

    const result = identifyDetection({
      detection,
      input: { type: 'taxon', taxon },
      context: { speciesListId, speciesListDOI },
    })

    if (result.changed) {
      updated[id] = result.detection
      if (detection.nightId) touchedNightIds.add(detection.nightId)
    }
  }

  if (matchingIds.length === 0) return { updatedCount: 0, nightCount: 0 }

  console.log('🔄 bulk identify morphospecies', {
    morphoKey,
    targetKey,
    matchingCount: matchingIds.length,
    nightCount: touchedNightIds.size,
    taxon: taxon?.scientificName,
  })

  detectionsStore.set(updated)
  updateNightSummariesInMemory({ nightIds: touchedNightIds, detections: updated })

  for (const nightId of touchedNightIds) {
    scheduleSaveForNight(nightId)
  }

  return { updatedCount: matchingIds.length, nightCount: touchedNightIds.size }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function collectTouchedNightIds(params: { detectionIds: string[]; detections: Record<string, DetectionEntity> }): Set<string> {
  const { detectionIds, detections } = params
  const touchedNightIds = new Set<string>()
  for (const id of detectionIds) {
    const detection = detections?.[id]
    if (detection?.nightId) touchedNightIds.add(detection.nightId)
  }
  return touchedNightIds
}

function updateNightSummariesAndScheduleSave(params: { detectionIds: string[]; detections: Record<string, DetectionEntity> }) {
  const { detectionIds, detections } = params
  const touchedNightIds = collectTouchedNightIds({ detectionIds, detections })
  updateNightSummariesInMemory({ nightIds: touchedNightIds, detections })

  for (const nightId of touchedNightIds) {
    scheduleSaveForNight(nightId)
  }
}

function updateNightSummariesInMemory(params: { nightIds: Set<string>; detections: Record<string, DetectionEntity> }) {
  const { nightIds, detections } = params

  if (!nightIds || nightIds.size === 0) return

  for (const nightId of nightIds) {
    if (!nightId) continue

    const detectionsForNight = Object.values(detections || {}).filter((d) => d.nightId === nightId)

    const summary = buildNightSummary({ nightId, detections: detectionsForNight })

    const currentSummaries = nightSummariesStore.get() || {}
    nightSummariesStore.set({ ...currentSummaries, [nightId]: summary })
  }
}
