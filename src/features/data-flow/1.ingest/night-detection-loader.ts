import { ingestDetectionsForNight } from './ingest'
import { indexedFilesStore, patchFileMapByNightStore } from './files.state'
import { detectionsStore } from '~/stores/entities/detections'
import { nightSummariesStore } from '~/stores/entities/night-summaries'
import { isMothboxNextIngestMode } from './ingest-mode'

export async function ensureDetectionsLoadedForNight(params: { nightId: string }) {
  const { nightId } = params
  if (isMothboxNextIngestMode()) return
  const loadedCount = countLoadedDetectionsForNight({ nightId })
  const expectedCount = nightSummariesStore.get()?.[nightId]?.totalDetections ?? 0

  if (!shouldLoadNightDetections({ loadedCount, expectedCount })) return

  console.log('🌀 ensureDetectionsLoadedForNight: loading', { nightId })

  const indexedFiles = indexedFilesStore.get() || []
  const patchMapByNight = patchFileMapByNightStore.get() || {}
  const patchMap = patchMapByNight[nightId]

  await ingestDetectionsForNight({ files: indexedFiles, nightId, patchMap })

  console.log('✅ ensureDetectionsLoadedForNight: complete', { nightId })
}

function shouldLoadNightDetections(params: { loadedCount: number; expectedCount: number }) {
  const { loadedCount, expectedCount } = params

  if (loadedCount === 0) return true
  if (expectedCount <= 0) return false

  return loadedCount < expectedCount
}

function countLoadedDetectionsForNight(params: { nightId: string }) {
  const { nightId } = params
  const detections = detectionsStore.get() || {}
  let loadedCount = 0

  for (const detection of Object.values(detections)) {
    if (detection?.nightId === nightId) loadedCount += 1
  }

  return loadedCount
}
