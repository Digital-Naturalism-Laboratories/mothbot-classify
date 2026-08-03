import { exportNightDarwinCSV } from '~/features/data-flow/4.export/darwin-csv'
import { exportNightSummaryRS } from '~/features/data-flow/4.export/rs-summary'
import type { LeafGroupEntity } from '~/stores/entities/leaf-groups'
import { resolveDatasetId } from '~/features/mothbox-next/dataset-scope'
import { detectionsStore, type DetectionEntity } from '~/stores/entities/detections'
import { patchesStore, type PatchEntity } from '~/stores/entities/5.patches'
import { photosStore, type PhotoEntity } from '~/stores/entities/photos'
import { ensureDetectionsLoadedForNight } from '~/features/data-flow/1.ingest/night-detection-loader'
import { setNightExporting, clearNightExporting } from './export.state'

type ExportScope = 'project' | 'site' | 'deployment' | 'night'

type ExportScopeParams = {
  scope: ExportScope
  id: string
  nights: Record<string, LeafGroupEntity>
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

export function collectNightIdsForScope(params: { scope: ExportScope; id: string; nights: Record<string, LeafGroupEntity> }) {
  const { scope, id, nights } = params

  if (scope === 'night') return [id]

  const nightValues = Object.values(nights ?? {})

  if (scope === 'deployment') return nightValues.filter((n) => n.deploymentId === id).map((n) => n.id)
  if (scope === 'site') return nightValues.filter((n) => n.siteId === id).map((n) => n.id)
  if (scope === 'project') return nightValues.filter((n) => resolveDatasetId(n) === id).map((n) => n.id)

  return []
}

async function processNightsForExport(params: {
  scope: ExportScope
  id: string
  nights: Record<string, LeafGroupEntity>
  exportFn: (params: { leafGroupId: string }) => Promise<boolean>
  label: string
}) {
  const { scope, id, nights, exportFn, label } = params
  const leafGroupIds = collectNightIdsForScope({ scope, id, nights })

  console.log(`🏁 exportScope${label}: start`, { scope, id, nightCount: leafGroupIds.length })

  let processedCount = 0
  let failedCount = 0

  for (const leafGroupId of leafGroupIds) {
    try {
      setNightExporting(leafGroupId)
      await ensureDetectionsLoadedForNight({ leafGroupId })
      const exportResult = await exportFn({ leafGroupId })

      clearDetectionsForNight({ leafGroupId })
      clearNightExporting(leafGroupId)

      if (!exportResult) {
        failedCount++
        console.error(`🚨 exportScope${label}: export returned false`, { leafGroupId })
      } else {
        processedCount++
      }
    } catch (error) {
      failedCount++
      clearNightExporting(leafGroupId)
      console.error(`🚨 exportScope${label}: failed for night`, { leafGroupId, error })
    }
  }

  console.log(`✅ exportScope${label}: complete`, { scope, id, nightCount: leafGroupIds.length, processedCount, failedCount })
  return { processedCount, failedCount }
}

function clearDetectionsForNight(params: { leafGroupId: string }) {
  const { leafGroupId } = params

  filterStoreByNightId(detectionsStore, leafGroupId, (d: any) => d?.leafGroupId)
  filterStoreByNightId(patchesStore, leafGroupId, (p: PatchEntity) => p.leafGroupId)
  filterStoreByNightId(photosStore, leafGroupId, (p: PhotoEntity) => p.leafGroupId)

  console.log('🗑️ clearDetectionsForNight: cleared', { leafGroupId })
}

function filterStoreByNightId<T extends Record<string, any>>(
  store: { get: () => T | undefined; set: (value: T) => void },
  leafGroupId: string,
  getNightId: (item: T[keyof T]) => string | undefined,
) {
  const current = store.get() || ({} as T)
  const filtered = {} as T

  for (const [id, item] of Object.entries(current)) {
    if (getNightId(item as T[keyof T]) !== leafGroupId) {
      ;(filtered as any)[id] = item
    }
  }

  store.set(filtered)
}
