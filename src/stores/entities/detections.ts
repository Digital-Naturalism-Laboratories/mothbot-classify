import { atom, computed } from 'nanostores'
import { leafGroupSummariesStore } from '~/stores/entities/night-summaries'
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
import { scheduleSaveForLeafGroup } from '~/features/data-flow/3.persist/detection-persistence'
import { ensureDetectionsLoadedForNight } from '~/features/data-flow/1.ingest/night-detection-loader'
import { clearMorphoCover } from '~/features/data-flow/3.persist/covers'
import { setMorphoLink } from '~/features/data-flow/3.persist/links'
import { buildLeafGroupSummary } from './night-summaries'
import { hasTaxonFields } from '~/models/taxonomy/validate'
import { resolveDatasetIdForLeafGroup } from '~/features/mothbox-next/dataset-scope'
import { isMothboxNextPackageOpen, mothboxNextPackageStore } from '~/features/mothbox-next/active-package'
import { detectionFromClassification } from '~/features/mothbox-next/classification-to-detection'
import { findBotClassificationForPatch } from '~/features/mothbox-next/resolve-classifications'
import { leafGroupsStore } from './leaf-groups'
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
 * Computed store: detections grouped by leafGroupId.
 * Provides O(1) lookup for leaf-group-specific detections.
 */
export const detectionsByLeafGroupStore = computed(detectionsStore, (all) => {
  const byLeafGroup: Record<string, DetectionEntity[]> = {}
  for (const d of Object.values(all)) {
    const leafGroupId = d.leafGroupId
    if (!leafGroupId) continue
    if (!byLeafGroup[leafGroupId]) byLeafGroup[leafGroupId] = []
    byLeafGroup[leafGroupId].push(d)
  }
  return byLeafGroup
})

/**
 * Selector: Get all detections for a specific leaf group.
 * Uses the computed store for efficient lookup.
 */
export function getDetectionsForLeafGroup(leafGroupId: string): DetectionEntity[] {
  const byLeafGroup = detectionsByLeafGroupStore.get()
  return byLeafGroup[leafGroupId] || []
}

/**
 * Selector: Get user-identified detections for a specific leaf group.
 */
export function getIdentifiedDetectionsForLeafGroup(leafGroupId: string): DetectionEntity[] {
  return getDetectionsForLeafGroup(leafGroupId).filter((d) => d.detectedBy === 'user')
}

/**
 * Selector: Get auto-detected (not user-identified) detections for a specific leaf group.
 */
export function getAutoDetectionsForLeafGroup(leafGroupId: string): DetectionEntity[] {
  return getDetectionsForLeafGroup(leafGroupId).filter((d) => d.detectedBy !== 'user')
}

/** @deprecated Use getAutoDetectionsForLeafGroup */
export const getAutoDetectionsForNight = getAutoDetectionsForLeafGroup

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
  updateLeafGroupSummariesAndScheduleSave({ detectionIds, detections: updated })
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
  updateLeafGroupSummariesAndScheduleSave({ detectionIds, detections: updated })
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

      const packageBot = resolvePackageBotDetection({ patchId: id, existing })
      if (packageBot) {
        updated[id] = packageBot
        continue
      }

      const match = shapes.find((s: any) => extractPatchFilename({ patchPath: (s as any)?.patch_path ?? '' }) === id)

      if (match) {
        updated[id] = buildDetectionFromBotShape({ shape: match, existingDetection: existing })
      } else {
        updated[id] = clearHumanIdentificationFlags({ existing })
      }
    }
  }

  detectionsStore.set(updated)
  updateLeafGroupSummariesAndScheduleSave({ detectionIds, detections: updated })
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function resolvePackageBotDetection(params: {
  patchId: string
  existing: DetectionEntity
}): DetectionEntity | undefined {
  const { patchId, existing } = params
  if (!isMothboxNextPackageOpen()) return undefined

  const classificationFiles = mothboxNextPackageStore.get()?.loaded?.classificationFiles
  const botRow = findBotClassificationForPatch({ patchId, classificationFiles })
  if (!botRow) return undefined

  const photoId = existing.photoId
  const leafGroupId = existing.leafGroupId
  if (!photoId || !leafGroupId) return undefined

  return detectionFromClassification({ row: botRow, leafGroupId, photoId })
}

function clearHumanIdentificationFlags(params: { existing: DetectionEntity }): DetectionEntity {
  const { existing } = params

  return {
    ...existing,
    detectedBy: 'auto',
    identifiedAt: undefined,
    isError: undefined,
    morphospecies: undefined,
    speciesListId: undefined,
    speciesListDOI: undefined,
  }
}

function collectTouchedLeafGroupIds(params: { detectionIds: string[]; detections: Record<string, DetectionEntity> }): Set<string> {
  const { detectionIds, detections } = params
  const touchedLeafGroupIds = new Set<string>()
  for (const id of detectionIds) {
    const detection = detections?.[id]
    if (detection?.leafGroupId) touchedLeafGroupIds.add(detection.leafGroupId)
  }
  return touchedLeafGroupIds
}

function updateLeafGroupSummariesAndScheduleSave(params: { detectionIds: string[]; detections: Record<string, DetectionEntity> }) {
  const { detectionIds, detections } = params
  const touchedLeafGroupIds = collectTouchedLeafGroupIds({ detectionIds, detections })
  updateLeafGroupSummariesInMemory({ leafGroupIds: touchedLeafGroupIds, detections })

  for (const leafGroupId of touchedLeafGroupIds) {
    scheduleSaveForLeafGroup(leafGroupId)
  }
}

function updateLeafGroupSummariesInMemory(params: { leafGroupIds: Set<string>; detections: Record<string, DetectionEntity> }) {
  const { leafGroupIds, detections } = params

  if (!leafGroupIds || leafGroupIds.size === 0) return
  const detectionsByLeafGroup = groupDetectionsByLeafGroup({ detections })

  for (const leafGroupId of leafGroupIds) {
    if (!leafGroupId) continue
    const summary = buildLeafGroupSummary({ leafGroupId, detections: detectionsByLeafGroup[leafGroupId] || [] })

    const currentSummaries = leafGroupSummariesStore.get() || {}
    leafGroupSummariesStore.set({ ...currentSummaries, [leafGroupId]: summary })
  }
}

export function findDetectionsByMorphoKey(params: { morphoKey: string }) {
  const { morphoKey } = params
  const allDetections = detectionsStore.get() || {}
  const detectionIds: string[] = []
  const leafGroupIds = new Set<string>()

  const normalizedKey = normalizeMorphoKey(morphoKey)

  for (const [id, detection] of Object.entries(allDetections)) {
    const morpho = typeof detection?.morphospecies === 'string' ? detection.morphospecies : ''
    const normalizedMorpho = normalizeMorphoKey(morpho)
    if (normalizedMorpho === normalizedKey && detection?.detectedBy === 'user') {
      detectionIds.push(id)
      if (detection?.leafGroupId) leafGroupIds.add(detection.leafGroupId)
    }
  }

  return { detectionIds, leafGroupIds }
}

export function findMorphoUsageByKey(params: { morphoKey: string }) {
  const { morphoKey } = params
  const normalizedKey = normalizeMorphoKey(morphoKey)
  const summaries = leafGroupSummariesStore.get() || {}
  const detections = detectionsStore.get() || {}
  const leafGroupIds = new Set<string>()
  const projectIds = new Set<string>()
  const countedLeafGroupIds = new Set<string>()
  const leafGroups = leafGroupsStore.get() || {}
  let instanceCount = 0

  for (const [leafGroupId, summary] of Object.entries(summaries)) {
    const count = summary?.morphoCounts?.[normalizedKey]
    if (!count) continue
    leafGroupIds.add(leafGroupId)
    countedLeafGroupIds.add(leafGroupId)
    instanceCount += count

    const datasetId = resolveDatasetIdForLeafGroup({ leafGroupId, leafGroups })
    if (datasetId) projectIds.add(datasetId)
  }

  for (const detection of Object.values(detections)) {
    if (detection?.detectedBy !== 'user') continue
    if (normalizeMorphoKey(detection?.morphospecies ?? '') !== normalizedKey) continue

    const leafGroupId = detection?.leafGroupId
    if (!leafGroupId) continue

    leafGroupIds.add(leafGroupId)

    const datasetId = resolveDatasetIdForLeafGroup({ leafGroupId, leafGroups })
    if (datasetId) projectIds.add(datasetId)

    if (countedLeafGroupIds.has(leafGroupId)) continue
    instanceCount += 1
  }

  return {
    morphoKey: normalizedKey,
    instanceCount,
    leafGroupIds,
    projectIds,
  }
}

export async function bulkIdentifyMorphospecies(params: { morphoKey: string; taxon: TaxonRecord }) {
  const { morphoKey, taxon } = params
  const usage = findMorphoUsageByKey({ morphoKey })
  const leafGroupIds = Array.from(usage.leafGroupIds)

  if (leafGroupIds.length === 0) {
    return { updatedCount: 0, leafGroupCount: 0, projectCount: 0 }
  }

  let updatedCount = 0

  for (const leafGroupId of leafGroupIds) {
    await ensureDetectionsLoadedForNight({ leafGroupId })

    const detectionIds = findDetectionIdsByMorphoKeyInLeafGroup({ morphoKey, leafGroupId })
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
    leafGroupCount: usage.leafGroupIds.size,
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

function findDetectionIdsByMorphoKeyInLeafGroup(params: { morphoKey: string; leafGroupId: string }) {
  const { morphoKey, leafGroupId } = params
  const normalizedKey = normalizeMorphoKey(morphoKey)
  const detections = detectionsStore.get() || {}
  const detectionIds: string[] = []

  for (const [id, detection] of Object.entries(detections)) {
    if (detection?.leafGroupId !== leafGroupId) continue
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
  updateLeafGroupSummariesAndScheduleSave({ detectionIds, detections: updated })

  return { updatedCount }
}

function groupDetectionsByLeafGroup(params: { detections: Record<string, DetectionEntity> }) {
  const { detections } = params
  const grouped: Record<string, DetectionEntity[]> = {}

  for (const detection of Object.values(detections || {})) {
    const leafGroupId = detection?.leafGroupId
    if (!leafGroupId) continue
    if (!grouped[leafGroupId]) grouped[leafGroupId] = []
    grouped[leafGroupId].push(detection)
  }

  return grouped
}

function getSpeciesListContextForDetection(params: { detection: DetectionEntity }) {
  const { detection } = params
  const selectionByProject = projectSpeciesSelectionStore.get() || {}
  const speciesLists = speciesListsStore.get() || {}
  const leafGroups = leafGroupsStore.get() || {}
  const datasetId = detection?.leafGroupId
    ? resolveDatasetIdForLeafGroup({ leafGroupId: detection.leafGroupId, leafGroups })
    : undefined
  const speciesListId = datasetId ? selectionByProject?.[datasetId] : undefined
  const speciesListDOI = speciesListId ? (speciesLists?.[speciesListId]?.doi as string | undefined) : undefined

  return { speciesListId, speciesListDOI }
}
