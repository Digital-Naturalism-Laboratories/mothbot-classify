import { ensureReadWritePermission, persistenceConstants } from '~/features/data-flow/3.persist/files.persistence'
import { photosStore } from '~/stores/entities/photos'
import { fsaaResolveAvailableFileName, fsaaWriteBytes, type FileSystemDirectoryHandleLike } from '~/utils/fsaa'
import { idbGet } from '~/utils/index-db'
import { getNightDiskPathFromPhotos } from '~/utils/paths'
import { loadTerminalFolderPaths } from '~/features/data-flow/1.ingest/terminal-paths.storage'
import { formatTodayYyyyMm_Dd, getPackageExportFolderPath, getProjectExportPath, sanitizeForFileName } from '../export-utils'
import { buildVizDetections } from './viz-data'
import { loadPatchImages } from './viz-images'
import { renderMosaicFromDetections } from './viz-renderer'
import type { VizConfig } from './viz-types'

export type VizExportResult =
  | {
      folderPath: string
      filePath: string
      fullPath: string
      /** Detections chosen by the current scope/filters. */
      selected: number
      /** Of those, how many had a usable image. */
      loaded: number
      /** Of those, how many actually landed on the canvas. */
      placed: number
    }
  | null

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

  const { images, misses } = await loadPatchImages(detections, {
    preferNobg: config.preferNobg,
    requireNobg: config.requireNobg,
  })

  const imageCount = images.size
  const { canvas, stats } = await renderMosaicFromDetections(detections, config, images, baseMask)
  const blob = await canvas.convertToBlob({ type: 'image/png' })
  const bytes = new Uint8Array(await blob.arrayBuffer())

  for (const bmp of images.values()) bmp.close()

  const folderPath = resolveExportFolderPath(config)
  const pathParts = folderPath.split('/').filter(Boolean)
  const fileName = buildVizFileName(config)
  // Don't clobber an earlier export with the same name — write a numbered
  // version (…_2.png, …_3.png) alongside it instead.
  const writePath = await fsaaResolveAvailableFileName(root, [...pathParts, fileName])
  await fsaaWriteBytes(root, writePath, bytes)

  const filePath = writePath.join('/')
  // Absolute path when the datasets root's disk path is known (a browser can't
  // read it from the folder handle, but it's captured for terminal commands).
  const diskRoot = loadTerminalFolderPaths().datasetsRootPath.trim().replace(/[/\\]+$/, '')
  const fullPath = diskRoot ? `${diskRoot}/${filePath}` : filePath
  console.log('🌀 viz export funnel', {
    selected: detections.length,
    loaded: images.size,
    placed: stats.placed,
    noFit: stats.noFit,
    ...misses,
  })

  return { folderPath, filePath, fullPath, selected: detections.length, loaded: imageCount, placed: stats.placed }
}

function resolveExportFolderPath(config: VizConfig): string {
  // Mothbox Next packages: every visualization lands in one place —
  // <package>/04_exports, alongside 02_records and 03_classifications — rather
  // than being scattered into a per-night folder for each export.
  const packageExports = getPackageExportFolderPath()
  if (packageExports) return packageExports

  // Legacy datasets have no package root; keep deriving from photo disk paths
  // for consistency with the Darwin CSV path style.
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
  const sort = config.sortReversed ? `${config.sortMode}-rev` : config.sortMode
  return `${scope}_mosaic-${config.layout}-${sort}_${date}.png`
}
