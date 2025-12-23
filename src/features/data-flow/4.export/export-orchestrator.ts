import { exportNightDarwinCSV } from '~/features/data-flow/4.export/darwin-csv'
import { exportNightSummaryRS } from '~/features/data-flow/4.export/rs-summary'
import type { NightEntity } from '~/stores/entities/4.nights'
import { detectionsStore, type DetectionEntity } from '~/stores/entities/detections'
import { patchesStore, type PatchEntity } from '~/stores/entities/5.patches'
import { photosStore, type PhotoEntity } from '~/stores/entities/photos'
import { ingestDetectionsForNight } from '~/features/data-flow/1.ingest/ingest'
import { patchFileMapByNightStore, indexedFilesStore } from '~/features/data-flow/1.ingest/files.state'
import { setNightExporting, clearNightExporting } from './export.state'

type ExportScope = 'project' | 'site' | 'deployment' | 'night'

type ExportScopeParams = {
  scope: ExportScope
  id: string
  nights: Record<string, NightEntity>
}

export async function exportScopeDarwinCSV(params: ExportScopeParams) {
  const { scope, id, nights } = params

  const result = await processNightsForExport({
    scope,
    id,
    nights,
    exportFn: exportNightDarwinCSV,
    label: 'DarwinCSV',
  })

  return result
}

export async function exportScopeRS(params: ExportScopeParams) {
  const { scope, id, nights } = params

  const result = await processNightsForExport({
    scope,
    id,
    nights,
    exportFn: exportNightSummaryRS,
    label: 'RS',
  })

  return result
}

export function collectNightIdsForScope(params: { scope: ExportScope; id: string; nights: Record<string, NightEntity> }) {
  const { scope, id, nights } = params

  if (scope === 'night') return [id]

  const nightValues = Object.values(nights ?? {})

  if (scope === 'deployment') return nightValues.filter((n) => n.deploymentId === id).map((n) => n.id)
  if (scope === 'site') return nightValues.filter((n) => n.siteId === id).map((n) => n.id)
  if (scope === 'project') return nightValues.filter((n) => n.projectId === id).map((n) => n.id)

  return []
}

async function processNightsForExport(params: {
  scope: ExportScope
  id: string
  nights: Record<string, NightEntity>
  exportFn: (params: { nightId: string }) => Promise<boolean>
  label: string
}) {
  const { scope, id, nights, exportFn, label } = params
  const nightIds = collectNightIdsForScope({ scope, id, nights })

  console.log(`🏁 exportScope${label}: start`, { scope, id, nightCount: nightIds.length })

  let processedCount = 0
  let failedCount = 0

  for (const nightId of nightIds) {
    try {
      setNightExporting(nightId)
      await ensureDetectionsLoadedForNight({ nightId })
      const exportResult = await exportFn({ nightId })

      if (!exportResult) {
        console.error(`🚨 exportScope${label}: export returned false`, { nightId })
      }

      clearDetectionsForNight({ nightId })
      clearNightExporting(nightId)
      processedCount++
    } catch (error) {
      failedCount++
      clearNightExporting(nightId)
      console.error(`🚨 exportScope${label}: failed for night`, { nightId, error })
    }
  }

  console.log(`✅ exportScope${label}: complete`, { scope, id, nightCount: nightIds.length, processedCount, failedCount })
  return { processedCount, failedCount }
}

async function ensureDetectionsLoadedForNight(params: { nightId: string }) {
  const { nightId } = params
  const detections = detectionsStore.get() || {}

  const hasDetections = Object.values(detections).some((d: any) => d?.nightId === nightId)
  if (hasDetections) return

  console.log('🌀 ensureDetectionsLoadedForNight: loading', { nightId })

  const indexedFiles = indexedFilesStore.get() || []
  const patchMapByNight = patchFileMapByNightStore.get() || {}
  const patchMap = patchMapByNight[nightId]

  await ingestDetectionsForNight({ files: indexedFiles, nightId, patchMap })

  console.log('✅ ensureDetectionsLoadedForNight: complete', { nightId })
}

function clearDetectionsForNight(params: { nightId: string }) {
  const { nightId } = params

  filterStoreByNightId(detectionsStore, nightId, (d: any) => d?.nightId)
  filterStoreByNightId(patchesStore, nightId, (p: PatchEntity) => p.nightId)
  filterStoreByNightId(photosStore, nightId, (p: PhotoEntity) => p.nightId)

  console.log('🗑️ clearDetectionsForNight: cleared', { nightId })
}

function filterStoreByNightId<T extends Record<string, any>>(
  store: { get: () => T | undefined; set: (value: T) => void },
  nightId: string,
  getNightId: (item: T[keyof T]) => string | undefined,
) {
  const current = store.get() || ({} as T)
  const filtered = {} as T

  for (const [id, item] of Object.entries(current)) {
    if (getNightId(item as T[keyof T]) !== nightId) {
      ;(filtered as any)[id] = item
    }
  }

  store.set(filtered)
}
