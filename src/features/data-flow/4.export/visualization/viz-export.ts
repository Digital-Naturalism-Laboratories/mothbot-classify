import { ensureReadWritePermission, persistenceConstants } from '~/features/data-flow/3.persist/files.persistence'
import { patchesStore } from '~/stores/entities/5.patches'
import { patchFileMapByNightStore } from '~/features/data-flow/1.ingest/files.state'
import { fsaaWriteBytes, type FileSystemDirectoryHandleLike } from '~/utils/fsaa'
import { idbGet } from '~/utils/index-db'
import { formatTodayYyyyMm_Dd, getProjectExportPath, sanitizeForFileName } from '../export-utils'
import { buildVizData } from './viz-data'
import { renderVisualization } from './viz-renderer'
import type { VizConfig } from './viz-types'

export type VizExportResult = { folderPath: string } | null

export async function exportVisualization(config: VizConfig): Promise<VizExportResult> {
  if (!config.selectedLeafGroupIds.length) return null

  const root = (await idbGet(
    persistenceConstants.IDB_NAME,
    persistenceConstants.IDB_STORE,
    'projectsRoot',
  )) as FileSystemDirectoryHandleLike | null
  if (!root) return null

  const granted = await ensureReadWritePermission(root as any)
  if (!granted) return null

  const data = buildVizData(config)
  const imageMap = await loadPatchImages(data.groups.flatMap((g) =>
    config.representativeMode === 'first' ? [g.representative] : g.detections,
  ), config.preferNobg)

  const canvas = new OffscreenCanvas(config.outputWidth, config.outputHeight)
  await renderVisualization(canvas, data, config, imageMap)

  const blob = await canvas.convertToBlob({ type: 'image/png' })
  const bytes = new Uint8Array(await blob.arrayBuffer())

  const exportPath = getProjectExportPath({ leafGroupId: config.selectedLeafGroupIds[0]! })
  const pathParts = exportPath.split('/').filter(Boolean)
  const fileName = buildVizFileName(config)

  await fsaaWriteBytes(root, [...pathParts, fileName], bytes)

  for (const bmp of imageMap.values()) bmp.close()

  return { folderPath: exportPath }
}

async function loadPatchImages(
  detections: Array<{ patchId: string; leafGroupId: string }>,
  preferNobg: boolean,
): Promise<Map<string, ImageBitmap>> {
  const patches = patchesStore.get()
  const patchMapByNight = patchFileMapByNightStore.get()
  const result = new Map<string, ImageBitmap>()

  await Promise.allSettled(
    detections.map(async (det) => {
      const patch = patches[det.patchId]
      if (!patch) return

      let file: File | undefined = undefined

      if (preferNobg) {
        const nightMap = patchMapByNight[det.leafGroupId]
        const baseName = patch.name.replace(/\.[^.]+$/, '')
        const nobgName = `${baseName}_nobg.png`
        file = nightMap?.[nobgName]?.file
      }

      if (!file) {
        file = patch.imageFile?.file
      }

      if (!file) return

      try {
        const bmp = await createImageBitmap(file)
        result.set(det.patchId, bmp)
      } catch {
        // silently skip unreadable images
      }
    }),
  )

  return result
}

function buildVizFileName(config: VizConfig): string {
  const scope = config.selectedLeafGroupIds.length === 1
    ? sanitizeForFileName(config.selectedLeafGroupIds[0]!.split('/').pop() ?? 'night')
    : `${config.selectedLeafGroupIds.length}-nights`
  const groupBy = config.groupBy === 'cluster' ? 'clusters' : config.taxaRank
  const date = formatTodayYyyyMm_Dd()
  return `${scope}_viz-${groupBy}-${config.chartType}_${date}.png`
}
