import { atom, computed } from 'nanostores'
import { nightSummariesStore } from '~/stores/entities/night-summaries'
import type { TaxonRecord } from '~/models/taxonomy/types'
import { speciesListsStore } from '~/features/data-flow/2.identify/species-list.store'
import { photosStore, type PhotoEntity } from '~/stores/entities/photos'
import { parseBotDetectionJsonSafely, extractPatchFilename } from '~/features/data-flow/1.ingest/ingest-json'
import { projectSpeciesSelectionStore } from '~/stores/species/project-species-list'
import {
  acceptDetection,
  buildDetectionFromBotShape,
  updateDetectionWithTaxon,
  updateDetectionAsMorphospecies,
  updateDetectionAsError,
} from '~/models/detection-shapes'
import { scheduleSaveForNight } from '~/features/data-flow/3.persist/detection-persistence'
import { ensureDetectionsLoadedForNight } from '~/features/data-flow/1.ingest/night-detection-loader'
import { clearMorphoCover } from '~/features/data-flow/3.persist/covers'
import { setMorphoLink } from '~/features/data-flow/3.persist/links'
import { buildNightSummary } from './night-summaries'
import { hasTaxonFields } from '~/models/taxonomy/validate'
import { getProjectIdFromNightId } from '~/utils/paths'
import { normalizeMorphoKey } from '~/models/taxonomy/morphospecies'
import { computeFinalLabel } from '~/models/taxonomy/label'

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
  const updated: Record<string, DetectionEntity> = { ...current }

  for (const id of detectionIds) {
    const existing = current?.[id]
    if (!existing) continue

    const context = getSpeciesListContextForDetection({ detection: existing })

    if (isError) {
      updated[id] = updateDetectionAsError({ existing, ...context })
      continue
    }

    if (hasTaxon && taxon && isMorphospeciesLabelWithTaxon({ label: trimmed, taxon })) {
      const morphoResult = updateDetectionAsMorphospecies({ existing, morphospecies: trimmed, taxon, ...context })
      if (morphoResult) {
        updated[id] = morphoResult
      }
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
 * Accepts detections by setting detectedBy to 'user' without changing taxonomy.
 */
export function acceptDetections(params: { detectionIds: string[] }) {
  const { detectionIds } = params
  if (!Array.isArray(detectionIds) || detectionIds.length === 0) return

  const current = detectionsStore.get() || {}
  const updated: Record<string, DetectionEntity> = { ...current }

  for (const id of detectionIds) {
    const existing = current?.[id]
    if (!existing) continue

    const context = getSpeciesListContextForDetection({ detection: existing })
    updated[id] = acceptDetection({ existing, ...context })
  }

  detectionsStore.set(updated)
  updateNightSummariesAndScheduleSave({ detectionIds, detections: updated })
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
  const detectionsByNight = groupDetectionsByNight({ detections })

  for (const nightId of nightIds) {
    if (!nightId) continue
    const summary = buildNightSummary({ nightId, detections: detectionsByNight[nightId] || [] })

    const currentSummaries = nightSummariesStore.get() || {}
    nightSummariesStore.set({ ...currentSummaries, [nightId]: summary })
  }
}

export function findDetectionsByMorphoKey(params: { morphoKey: string }) {
  const { morphoKey } = params
  const allDetections = detectionsStore.get() || {}
  const detectionIds: string[] = []
  const nightIds = new Set<string>()

  const normalizedKey = normalizeMorphoKey(morphoKey)

  for (const [id, detection] of Object.entries(allDetections)) {
    const morpho = typeof detection?.morphospecies === 'string' ? detection.morphospecies : ''
    const normalizedMorpho = normalizeMorphoKey(morpho)
    if (normalizedMorpho === normalizedKey && detection?.detectedBy === 'user') {
      detectionIds.push(id)
      if (detection?.nightId) nightIds.add(detection.nightId)
    }
  }

  return { detectionIds, nightIds }
}

export function findMorphoUsageByKey(params: { morphoKey: string }) {
  const { morphoKey } = params
  const normalizedKey = normalizeMorphoKey(morphoKey)
  const summaries = nightSummariesStore.get() || {}
  const detections = detectionsStore.get() || {}
  const nightIds = new Set<string>()
  const projectIds = new Set<string>()
  const countedNightIds = new Set<string>()
  let instanceCount = 0

  for (const [nightId, summary] of Object.entries(summaries)) {
    const count = summary?.morphoCounts?.[normalizedKey]
    if (!count) continue
    nightIds.add(nightId)
    countedNightIds.add(nightId)
    instanceCount += count

    const projectId = getProjectIdFromNightId(nightId)
    if (projectId) projectIds.add(projectId)
  }

  for (const detection of Object.values(detections)) {
    if (detection?.detectedBy !== 'user') continue
    if (normalizeMorphoKey(detection?.morphospecies ?? '') !== normalizedKey) continue

    const nightId = detection?.nightId
    if (!nightId) continue

    nightIds.add(nightId)

    const projectId = getProjectIdFromNightId(nightId)
    if (projectId) projectIds.add(projectId)

    if (countedNightIds.has(nightId)) continue
    instanceCount += 1
  }

  return {
    morphoKey: normalizedKey,
    instanceCount,
    nightIds,
    projectIds,
  }
}

export async function bulkIdentifyMorphospecies(params: { morphoKey: string; taxon: TaxonRecord }) {
  const { morphoKey, taxon } = params
  const usage = findMorphoUsageByKey({ morphoKey })
  const nightIds = Array.from(usage.nightIds)

  if (nightIds.length === 0) {
    return { updatedCount: 0, nightCount: 0, projectCount: 0 }
  }

  let updatedCount = 0

  for (const nightId of nightIds) {
    await ensureDetectionsLoadedForNight({ nightId })

    const detectionIds = findDetectionIdsByMorphoKeyInNight({ morphoKey, nightId })
    if (!detectionIds.length) continue

    const result = applyTaxonToDetectionIds({ detectionIds, taxon })
    updatedCount += result.updatedCount
  }

  const remainingUsage = findMorphoUsageByKey({ morphoKey })
  if (remainingUsage.instanceCount === 0) {
    await setMorphoLink({ morphoKey, url: '' })
    await clearMorphoCover({ morphoKey })
  }

  return {
    updatedCount,
    nightCount: usage.nightIds.size,
    projectCount: usage.projectIds.size,
  }
}

function isMorphospeciesLabelWithTaxon(params: { label: string; taxon: TaxonRecord }) {
  const { label, taxon } = params

  if (!label) return false

  const normalizedLabel = label.trim().toLowerCase()
  const normalizedTaxonLabel = computeFinalLabel({ taxon }).trim().toLowerCase()

  if (!normalizedTaxonLabel) return false

  return normalizedLabel !== normalizedTaxonLabel
}

function findDetectionIdsByMorphoKeyInNight(params: { morphoKey: string; nightId: string }) {
  const { morphoKey, nightId } = params
  const normalizedKey = normalizeMorphoKey(morphoKey)
  const detections = detectionsStore.get() || {}
  const detectionIds: string[] = []

  for (const [id, detection] of Object.entries(detections)) {
    if (detection?.nightId !== nightId) continue
    if (detection?.detectedBy !== 'user') continue
    if (normalizeMorphoKey(detection?.morphospecies ?? '') !== normalizedKey) continue
    detectionIds.push(id)
  }

  return detectionIds
}

function applyTaxonToDetectionIds(params: { detectionIds: string[]; taxon: TaxonRecord }) {
  const { detectionIds, taxon } = params
  const current = detectionsStore.get() || {}
  const updated: Record<string, DetectionEntity> = { ...current }
  let updatedCount = 0

  for (const id of detectionIds) {
    const existing = current?.[id]
    if (!existing) continue
    const context = getSpeciesListContextForDetection({ detection: existing })
    updated[id] = updateDetectionWithTaxon({ existing, taxon, ...context })
    updatedCount += 1
  }

  detectionsStore.set(updated)
  updateNightSummariesAndScheduleSave({ detectionIds, detections: updated })

  return { updatedCount }
}

function groupDetectionsByNight(params: { detections: Record<string, DetectionEntity> }) {
  const { detections } = params
  const grouped: Record<string, DetectionEntity[]> = {}

  for (const detection of Object.values(detections || {})) {
    const nightId = detection?.nightId
    if (!nightId) continue
    if (!grouped[nightId]) grouped[nightId] = []
    grouped[nightId].push(detection)
  }

  return grouped
}

function getSpeciesListContextForDetection(params: { detection: DetectionEntity }) {
  const { detection } = params
  const selectionByProject = projectSpeciesSelectionStore.get() || {}
  const speciesLists = speciesListsStore.get() || {}
  const projectId = getProjectIdFromNightId(detection?.nightId)
  const speciesListId = projectId ? selectionByProject?.[projectId] : undefined
  const speciesListDOI = speciesListId ? (speciesLists?.[speciesListId]?.doi as string | undefined) : undefined

  return { speciesListId, speciesListDOI }
}
