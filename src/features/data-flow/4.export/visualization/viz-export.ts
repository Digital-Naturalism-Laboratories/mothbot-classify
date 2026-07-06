import { ensureReadWritePermission, persistenceConstants } from '~/features/data-flow/3.persist/files.persistence'
import { patchesStore } from '~/stores/entities/5.patches'
import { photosStore, makeIndexedFileHandle } from '~/stores/entities/photos'
import { fsaaWriteBytes, type FileSystemDirectoryHandleLike } from '~/utils/fsaa'
import { idbGet } from '~/utils/index-db'
import { getNightDiskPathFromPhotos } from '~/utils/paths'
import { formatTodayYyyyMm_Dd, getProjectExportPath, sanitizeForFileName } from '../export-utils'
import { buildVizData } from './viz-data'
import { renderVisualization } from './viz-renderer'
import type { VizConfig } from './viz-types'

type ParentDir = { getFileHandle?: (name: string) => Promise<{ getFile: () => Promise<File> }> }

export type VizExportResult = { folderPath: string; filePath: string } | null

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

  const folderPath = resolveExportFolderPath(config)
  const pathParts = folderPath.split('/').filter(Boolean)
  const fileName = buildVizFileName(config)

  await fsaaWriteBytes(root, [...pathParts, fileName], bytes)

  for (const bmp of imageMap.values()) bmp.close()

  return { folderPath, filePath: [...pathParts, fileName].join('/') }
}

function resolveExportFolderPath(config: VizConfig): string {
  // Derive from actual photo disk paths for consistency with Darwin CSV path style
  const allPhotos = Object.values(photosStore.get() ?? {})
  for (const leafGroupId of config.selectedLeafGroupIds) {
    const photos = allPhotos.filter((p) => p.leafGroupId === leafGroupId)
    const nightPath = getNightDiskPathFromPhotos({ photos })
    if (nightPath) {
      const projectRoot = nightPath.split('/').filter(Boolean)[0]
      if (projectRoot) return `${projectRoot}/exports`
    }
  }
  return getProjectExportPath({ leafGroupId: config.selectedLeafGroupIds[0]! })
}

async function loadPatchImages(
  detections: Array<{ patchId: string; leafGroupId: string }>,
  preferNobg: boolean,
): Promise<Map<string, ImageBitmap>> {
  const patches = patchesStore.get()
  const result = new Map<string, ImageBitmap>()

  await Promise.allSettled(
    detections.map(async (det) => {
      const patch = patches[det.patchId]
      if (!patch) return

      const imageFile = patch.imageFile
      if (!imageFile) return

      let file: File | undefined = undefined

      if (preferNobg) {
        const parentDir = imageFile.parentDir as ParentDir | undefined
        if (parentDir?.getFileHandle) {
          const nobgName = imageFile.name.replace(/\.jpg$/i, '_nobg.png')
          file = await parentDir.getFileHandle(nobgName)
            .then((h) => h.getFile())
            .catch(() => undefined)
        }
      }

      if (!file) {
        // Try pre-loaded file, then fall back to handle-based loading
        file = imageFile.file
        if (!file) {
          const handle = makeIndexedFileHandle(imageFile)
          file = await handle?.getFile().catch(() => undefined)
        }
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
