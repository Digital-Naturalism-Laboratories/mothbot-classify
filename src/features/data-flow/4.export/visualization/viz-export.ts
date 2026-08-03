import { ensureReadWritePermission, persistenceConstants } from '~/features/data-flow/3.persist/files.persistence'
import { photosStore } from '~/stores/entities/photos'
import { fsaaWriteBytes, type FileSystemDirectoryHandleLike } from '~/utils/fsaa'
import { idbGet } from '~/utils/index-db'
import { getNightDiskPathFromPhotos } from '~/utils/paths'
import { loadTerminalFolderPaths } from '~/features/data-flow/1.ingest/terminal-paths.storage'
import { formatTodayYyyyMm_Dd, getProjectExportPath, sanitizeForFileName } from '../export-utils'
import { buildVizDetections } from './viz-data'
import { loadPatchImages } from './viz-images'
import { renderMosaicFromDetections } from './viz-renderer'
import type { VizConfig } from './viz-types'

export type VizExportResult = { folderPath: string; filePath: string; fullPath: string } | null

export async function exportVisualization(
  config: VizConfig,
  baseMask: ImageBitmap | null = null,
): Promise<VizExportResult> {
  const root = (await idbGet(
    persistenceConstants.IDB_NAME,
    persistenceConstants.IDB_STORE,
    'projectsRoot',
  )) as FileSystemDirectoryHandleLike | null
  if (!root) return null

  const granted = await ensureReadWritePermission(root as any)
  if (!granted) return null

  const { detections } = buildVizDetections(config)
  if (!detections.length) return null

  const { images } = await loadPatchImages(detections, {
    preferNobg: config.preferNobg,
    requireNobg: config.requireNobg,
  })

  const { canvas } = await renderMosaicFromDetections(detections, config, images, baseMask)
  const blob = await canvas.convertToBlob({ type: 'image/png' })
  const bytes = new Uint8Array(await blob.arrayBuffer())

  for (const bmp of images.values()) bmp.close()

  const folderPath = resolveExportFolderPath(config)
  const pathParts = folderPath.split('/').filter(Boolean)
  const fileName = buildVizFileName(config)
  await fsaaWriteBytes(root, [...pathParts, fileName], bytes)

  const filePath = [...pathParts, fileName].join('/')
  // Absolute path when the datasets root's disk path is known (a browser can't
  // read it from the folder handle, but it's captured for terminal commands).
  const diskRoot = loadTerminalFolderPaths().datasetsRootPath.trim().replace(/[/\\]+$/, '')
  const fullPath = diskRoot ? `${diskRoot}/${filePath}` : filePath
  return { folderPath, filePath, fullPath }
}

function resolveExportFolderPath(config: VizConfig): string {
  // Derive from actual photo disk paths for consistency with the Darwin CSV path style.
  const allPhotos = Object.values(photosStore.get() ?? {})
  for (const leafGroupId of config.selectedLeafGroupIds) {
    const photos = allPhotos.filter((p) => p.leafGroupId === leafGroupId)
    const nightPath = getNightDiskPathFromPhotos({ photos })
    if (nightPath) {
      const projectRoot = nightPath.split('/').filter(Boolean)[0]
      if (projectRoot) return `${projectRoot}/exports`
    }
  }
  return getProjectExportPath({ leafGroupId: config.selectedLeafGroupIds[0] ?? '' })
}

function buildVizFileName(config: VizConfig): string {
  const scope = config.scope === 'selection'
    ? 'selection'
    : config.selectedLeafGroupIds.length === 1
      ? sanitizeForFileName(config.selectedLeafGroupIds[0]!.split('/').pop() ?? 'night')
      : `${config.selectedLeafGroupIds.length}-nights`
  const date = formatTodayYyyyMm_Dd()
  return `${scope}_mosaic-${config.layout}-${config.sortMode}_${date}.png`
}
