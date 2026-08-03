import { ingestDetectionsForLeafGroup } from './ingest'
import { indexedFilesStore, patchFileMapByNightStore } from './files.state'
import { detectionsStore } from '~/stores/entities/detections'
import { leafGroupSummariesStore } from '~/stores/entities/night-summaries'
import { isMothboxNextIngestMode } from './ingest-mode'

export async function ensureDetectionsLoadedForNight(params: { leafGroupId: string }) {
  const { leafGroupId } = params
  if (isMothboxNextIngestMode()) return
  const loadedCount = countLoadedDetectionsForNight({ leafGroupId })
  const expectedCount = leafGroupSummariesStore.get()?.[leafGroupId]?.totalDetections ?? 0

  if (!shouldLoadNightDetections({ loadedCount, expectedCount })) return

  console.log('🌀 ensureDetectionsLoadedForNight: loading', { leafGroupId })

  const indexedFiles = indexedFilesStore.get() || []
  const patchMapByNight = patchFileMapByNightStore.get() || {}
  const patchMap = patchMapByNight[leafGroupId]

  await ingestDetectionsForLeafGroup({ files: indexedFiles, leafGroupId, patchMap })

  console.log('✅ ensureDetectionsLoadedForNight: complete', { leafGroupId })
}

function shouldLoadNightDetections(params: { loadedCount: number; expectedCount: number }) {
  const { loadedCount, expectedCount } = params

  if (loadedCount === 0) return true
  if (expectedCount <= 0) return false

  return loadedCount < expectedCount
}

function countLoadedDetectionsForNight(params: { leafGroupId: string }) {
  const { leafGroupId } = params
  const detections = detectionsStore.get() || {}
  let loadedCount = 0

  for (const detection of Object.values(detections)) {
    if (detection?.leafGroupId === leafGroupId) loadedCount += 1
  }

  return loadedCount
}
